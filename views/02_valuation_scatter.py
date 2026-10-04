"""
バリュエーション散布図 — 会社の財務指標を任意の2軸でプロット
"""
import pandas as pd
import plotly.colors as pc
import plotly.graph_objects as go
import streamlit as st

from lib.companies import render_company_selector
from lib.layout_toggle import render_layout_toggle
from lib.portfolio_helper import period_table

st.set_page_config(
    page_title="バリュエーション散布図",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)
render_layout_toggle()

st.title("📊 バリュエーション散布図")
st.caption(
    "会社の財務指標を任意の2軸でプロット。"
    "業種などで色分けし、中央値の十字線・強調表示・期間の切り替えに対応しています。"
)

# ──────────────────────────────────────────────────────────────────
# 指標定義
# ──────────────────────────────────────────────────────────────────
METRIC_OPTIONS: list[tuple[str, str, str]] = [
    # (key, display_label, axis_format)
    ("roe",           "ROE",            ".1%"),
    ("per",           "PER",            ".1f"),
    ("equity_ratio",  "自己資本比率",   ".1%"),
    ("eps",           "EPS",            ",.0f"),
    ("dps",           "DPS",            ",.0f"),
    ("bps",           "BPS",            ",.0f"),
    ("net_sales",     "売上",           ".2s"),
    ("net_income",    "親会社純利益",   ".2s"),
    ("gross_profit",  "売上総利益",     ".2s"),
    ("total_assets",  "総資産",         ".2s"),
    ("net_assets",    "純資産",         ".2s"),
    ("operating_cf",  "営業CF",         ".2s"),
]
METRIC_LABEL = {k: v for k, v, _ in METRIC_OPTIONS}
METRIC_FMT   = {k: f for k, _, f in METRIC_OPTIONS}

SIZE_OPTIONS: list[tuple[str, str]] = [
    ("none",         "なし"),
    ("net_sales",    "売上"),
    ("net_income",   "親会社純利益"),
    ("total_assets", "総資産"),
    ("gross_profit", "売上総利益"),
]
SIZE_LABEL = dict(SIZE_OPTIONS)

PALETTE = pc.qualitative.Light24 + pc.qualitative.Dark24  # 業種（33）を色分けできる数
GROUP_COLOR = {"商社": "#1f77b4", "石油": "#d62728", "その他": "#b0b0b0"}

# ──────────────────────────────────────────────────────────────────
# サイドバー
# ──────────────────────────────────────────────────────────────────
targets = render_company_selector("p02", default_mode="全社")

with st.sidebar:
    period_labels = ["最新期", "1期前", "2期前", "3期前", "4期前"]
    offset = st.selectbox(
        "期間",
        options=list(range(len(period_labels))),
        format_func=lambda x: period_labels[x],
        index=0,
    )
    x_key = st.selectbox(
        "X軸", options=[m[0] for m in METRIC_OPTIONS],
        format_func=lambda k: METRIC_LABEL[k], index=0,
    )
    y_key = st.selectbox(
        "Y軸", options=[m[0] for m in METRIC_OPTIONS],
        format_func=lambda k: METRIC_LABEL[k], index=1,
    )
    size_key = st.selectbox(
        "マーカーサイズ", options=[s[0] for s in SIZE_OPTIONS],
        format_func=lambda k: SIZE_LABEL[k], index=0,
    )
    color_by = st.radio("色分け", ["業種", "会計基準", "商社・石油"], index=0, horizontal=True)
    show_median = st.checkbox("中央値の十字線", value=True)
    clip = st.checkbox("外れ値を除いて表示（1〜99%点）", value=True,
                       help="極端な値で、ほとんどの点が1か所に固まるのを防ぎます。除外した会社数は図の下に表示します。")
    chart_height = st.slider("チャート高さ(px)", min_value=400, max_value=900, value=640, step=50)

# ──────────────────────────────────────────────────────────────────
# データ収集
# ──────────────────────────────────────────────────────────────────
df_all = period_table(offset)
df = df_all[df_all["edinet_code"].isin(targets)].copy()
if df.empty:
    st.warning("表示対象なし。対象の選び方を変えてください。")
    st.stop()

df_plot = df.dropna(subset=[x_key, y_key]).copy()
missing = df.loc[~df["edinet_code"].isin(df_plot["edinet_code"]), "company"].tolist()
if df_plot.empty:
    st.warning(f"選んだ会社には、{METRIC_LABEL[x_key]}と{METRIC_LABEL[y_key]}の両方の値がありません。")
    st.stop()

with st.sidebar:
    show_label = st.checkbox("会社名ラベル", value=len(df_plot) <= 40)
    highlight = st.multiselect(
        "強調表示する会社", df_plot.sort_values("label")["label"].tolist(), default=[],
        help="名前やコードで検索できます。",
    )

df_plot["group_disp"] = df_plot["group"].replace("", "その他")
color_col = {"業種": "industry", "会計基準": "std", "商社・石油": "group_disp"}[color_by]
df_plot[color_col] = df_plot[color_col].replace("", "（不明）")


def _marker_size(series: pd.Series, min_px: int = 6, max_px: int = 40) -> pd.Series:
    """値域を min_px〜max_px に正規化。"""
    s = series.astype(float).abs()
    if s.max() == s.min():
        return pd.Series([min_px + 4] * len(s), index=s.index)
    return min_px + (s - s.min()) / (s.max() - s.min()) * (max_px - min_px)


if size_key != "none" and size_key in df_plot.columns:
    sizes = _marker_size(df_plot[size_key].fillna(df_plot[size_key].median()))
else:
    sizes = pd.Series([8 if len(df_plot) > 40 else 14] * len(df_plot), index=df_plot.index)

# ──────────────────────────────────────────────────────────────────
# プロット
# ──────────────────────────────────────────────────────────────────
fig = go.Figure()
cats = sorted(df_plot[color_col].unique())
for i, cat in enumerate(cats):
    sub = df_plot[df_plot[color_col] == cat]
    color = GROUP_COLOR.get(cat) if color_by == "商社・石油" else PALETTE[i % len(PALETTE)]
    fig.add_trace(go.Scatter(
        x=sub[x_key], y=sub[y_key],
        mode="markers+text" if show_label else "markers",
        text=sub["company"] if show_label else None,
        textposition="top center", textfont=dict(size=10),
        marker=dict(size=sizes.loc[sub.index], color=color, line=dict(width=0.6, color="white"), opacity=0.85),
        name=f"{cat}（{len(sub)}）",
        customdata=sub[["company", "fy", "std", "industry", "consolidated"]].values,
        hovertemplate=(
            "<b>%{customdata[0]}</b>（%{customdata[3]}）<br>"
            "FY %{customdata[1]} (%{customdata[2]})"
            "<br>" + METRIC_LABEL[x_key] + ": %{x:" + METRIC_FMT[x_key] + "}"
            "<br>" + METRIC_LABEL[y_key] + ": %{y:" + METRIC_FMT[y_key] + "}"
            "<extra></extra>"
        ),
    ))

if highlight:
    hl = df_plot[df_plot["label"].isin(highlight)]
    fig.add_trace(go.Scatter(
        x=hl[x_key], y=hl[y_key], mode="markers+text", text=hl["company"],
        textposition="top center", textfont=dict(size=12, color="#111"),
        marker=dict(size=18, color="rgba(0,0,0,0)", line=dict(width=2.5, color="#111")),
        name="強調", hoverinfo="skip",
    ))

if show_median and len(df_plot) >= 2:
    x_med, y_med = float(df_plot[x_key].median()), float(df_plot[y_key].median())
    fig.add_vline(x=x_med, line_dash="dot", line_color="gray",
                  annotation_text=f"中央値 {x_med:.3g}", annotation_position="top")
    fig.add_hline(y=y_med, line_dash="dot", line_color="gray",
                  annotation_text=f"中央値 {y_med:.3g}", annotation_position="right")

hidden = 0
xaxis = dict(title=METRIC_LABEL[x_key], tickformat=METRIC_FMT[x_key], showgrid=True)
yaxis = dict(title=METRIC_LABEL[y_key], tickformat=METRIC_FMT[y_key], showgrid=True)
if clip and len(df_plot) >= 20:
    def _bounds(s: pd.Series) -> tuple[float, float]:
        lo, hi = float(s.quantile(0.01)), float(s.quantile(0.99))
        pad = (hi - lo) * 0.06 or 1.0
        return lo - pad, hi + pad
    (xl, xh), (yl, yh) = _bounds(df_plot[x_key]), _bounds(df_plot[y_key])
    outside = ~(df_plot[x_key].between(xl, xh) & df_plot[y_key].between(yl, yh))
    hidden = int(outside.sum())
    xaxis["range"], yaxis["range"] = [xl, xh], [yl, yh]

fig.update_layout(
    xaxis=xaxis, yaxis=yaxis, height=chart_height,
    margin=dict(l=40, r=20, t=20, b=40),
    legend=dict(orientation="v", yanchor="top", y=1, xanchor="left", x=1.01, font=dict(size=11)),
    hovermode="closest",
)
st.plotly_chart(fig, use_container_width=True)

notes = []
if hidden:
    notes.append(f"外れ値として、図の範囲外にした会社：{hidden}社（表には含まれます）")
if missing:
    shown = "、".join(missing[:8]) + ("…" if len(missing) > 8 else "")
    notes.append(f"データ欠損で除外：{len(missing)}社（{shown}）")
n_nc = int((~df_plot["consolidated"]).sum())
if n_nc:
    notes.append(f"個別財務諸表のみの会社が {n_nc}社含まれます（連結の会社とは基準が異なります）")
for n in notes:
    st.caption("⚠ " + n)

# ──────────────────────────────────────────────────────────────────
# データテーブル
# ──────────────────────────────────────────────────────────────────
with st.expander("📋 データテーブル", expanded=False):
    show_cols = ["company", "industry", "fy", "std", x_key, y_key]
    if size_key != "none" and size_key not in show_cols:
        show_cols.append(size_key)
    extra = st.multiselect(
        "追加表示カラム",
        options=[m[0] for m in METRIC_OPTIONS if m[0] not in show_cols],
        format_func=lambda k: METRIC_LABEL[k], default=[],
    )
    show_cols += extra
    show_cols = [c for c in show_cols if c in df.columns]
    df_view = df[show_cols].rename(columns={
        "company": "会社", "industry": "業種", "fy": "FY", "std": "会計基準",
        **{k: v for k, v in METRIC_LABEL.items()},
    })
    st.dataframe(df_view, use_container_width=True, hide_index=True)


# 出典・加工の明記（PDL1.0 の条件）
from lib.attribution import render_attribution_footer  # noqa: E402
render_attribution_footer()
