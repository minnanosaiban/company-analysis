"""
セグメント推移 — 1社のセグメント別 5期推移を small multiple で表示
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from lib.companies import load_companies
from lib.layout_toggle import render_layout_toggle
from lib.portfolio_helper import segment_display_name, segments_5yr

st.set_page_config(
    page_title="セグメント推移",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)
render_layout_toggle()

st.title("📈 セグメント推移")
st.caption(
    "1 社を選ぶと、その会社の各セグメントを 5 期分の推移グラフでパネル表示。"
    "事業ポートフォリオの変化が一目で分かります。"
)

# ──────────────────────────────────────────────────────────────────
# 指標オプション
# ──────────────────────────────────────────────────────────────────
METRIC_OPTIONS: list[tuple[str, str]] = [
    ("profit_attributable_to_owners", "親会社帰属利益（IFRS）"),
    ("operating_income",              "営業利益"),
    ("ordinary_income",               "経常利益（日本基準）"),
    ("gross_profit",                  "売上総利益"),
    ("equity_method_income",          "持分法投資損益"),
    ("assets",                        "セグメント資産"),
    ("external_revenue",              "外部顧客売上"),
    ("revenue",                       "売上収益"),
]
METRIC_LABEL = dict(METRIC_OPTIONS)

comp = load_companies()
comp_seg = comp[comp["has_segments"]]

# ──────────────────────────────────────────────────────────────────
# サイドバー
# ──────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("対象の会社")
    industries = ["すべて"] + sorted(i for i in comp_seg["industry"].unique() if i)
    ind = st.selectbox("業種で絞り込み（東証33業種）", industries, index=0)
    pool = comp_seg if ind == "すべて" else comp_seg[comp_seg["industry"] == ind]
    pool = pool.sort_values("sec_code")
    options = pool["edinet_code"].tolist()
    default_ed = "E02529"  # 初期表示
    ed = st.selectbox(
        f"会社（{len(options)}社・名前やコードで検索）",
        options=options,
        index=options.index(default_ed) if default_ed in options else 0,
        format_func=lambda e: pool.at[e, "label"],
    )
    st.caption("セグメント情報がある会社だけが表示されます。")
    st.divider()
    st.header("表示設定")

    # その会社に値がある指標だけを選択肢にする（会社により、営業利益・経常利益など使える指標が違う）
    _any = segments_5yr(ed, n=5)
    avail = [m[0] for m in METRIC_OPTIONS
             if any(isinstance(s.get(m[0]), (int, float)) for _, segs in _any for s in segs)]
    if not avail:
        st.warning("この会社には、表示できるセグメント指標がありません。")
        st.stop()
    metric = st.selectbox(
        "指標", options=avail,
        format_func=lambda k: METRIC_LABEL[k], index=0,
    )
    n_periods = st.slider("表示期数", min_value=2, max_value=5, value=5)
    chart_kind = st.radio(
        "チャート種別", options=["bar", "line"],
        format_func=lambda k: {"bar": "棒グラフ", "line": "折れ線"}[k],
        horizontal=True, index=0,
    )
    cols_per_row = st.slider("グリッド列数", min_value=1, max_value=4, value=3)
    panel_height = st.slider("パネル高さ(px)", min_value=180, max_value=400, value=240, step=20)
    sort_by = st.radio("ソート", options=["最新値降順", "セグメント名"], index=0)

company = comp.at[ed, "name"]
std = comp.at[ed, "accounting_standard"]
st.caption(f"{comp.at[ed, 'label']} ／ {comp.at[ed, 'industry']} ／ {std} ／ "
           + ("連結" if comp.at[ed, "consolidated"] else "個別財務諸表のみ"))

# ──────────────────────────────────────────────────────────────────
# データ取得
# ──────────────────────────────────────────────────────────────────
data = segments_5yr(ed, n=n_periods)  # [(fy, segs[]), ...] 古い順
if not data:
    st.warning(f"{company}：データなし")
    st.stop()

# 全期間に出現する segment key の union（key -> 最新ラベル）
seg_keys_order: list[str] = []
seg_labels: dict[str, str] = {}
for fy, segs in reversed(data):  # 新しい→古い順で走査して、最新ラベル優先
    for s in segs:
        key = s.get("key")
        if not key:
            continue
        if key not in seg_labels:
            seg_labels[key] = segment_display_name(s)
            seg_keys_order.append(key)


def _series_for(key: str) -> tuple[list[str], list[float | None]]:
    fys: list[str] = []
    vals: list[float | None] = []
    for fy, segs in data:
        match = next((s for s in segs if s.get("key") == key), None)
        v = match.get(metric) if match else None
        fys.append(fy)
        vals.append(v if isinstance(v, (int, float)) else None)
    return fys, vals


series_map = {k: _series_for(k) for k in seg_keys_order}
series_map = {k: v for k, v in series_map.items() if any(x is not None for x in v[1])}  # 全て None は除外

if not series_map:
    st.warning(f"{company} は {METRIC_LABEL[metric]} の値を持つセグメントがありません。別の指標を試してください。")
    st.stop()


def _latest_value(k: str) -> float:
    for v in reversed(series_map[k][1]):
        if v is not None:
            return v
    return 0.0


if sort_by == "最新値降順":
    keys_sorted = sorted(series_map.keys(), key=_latest_value, reverse=True)
else:
    keys_sorted = sorted(series_map.keys(), key=lambda k: seg_labels[k])

if any(not any(s.get("label") for s in segs) for _, segs in data if segs):
    st.caption("ℹ セグメント名の日本語ラベルが未整備の会社は、英字のキーを区切って表示しています。")

# ──────────────────────────────────────────────────────────────────
# small multiple 描画
# ──────────────────────────────────────────────────────────────────
n_segs = len(keys_sorted)
rows = (n_segs + cols_per_row - 1) // cols_per_row

fig = make_subplots(
    rows=rows, cols=cols_per_row,
    subplot_titles=[seg_labels[k] for k in keys_sorted],
    vertical_spacing=0.13, horizontal_spacing=0.06,
)

for i, key in enumerate(keys_sorted):
    r = i // cols_per_row + 1
    c = i % cols_per_row + 1
    fys, vals = series_map[key]
    vals_oku = [v / 1e8 if v is not None else None for v in vals]
    has_neg = any(v is not None and v < 0 for v in vals_oku)
    base_color = "#d62728" if has_neg else "#1f77b4"

    if chart_kind == "bar":
        colors = ["#d62728" if (v is not None and v < 0) else "#1f77b4" for v in vals_oku]
        fig.add_trace(go.Bar(
            x=fys, y=vals_oku, marker_color=colors, showlegend=False,
            hovertemplate=f"<b>{seg_labels[key]}</b><br>FY %{{x}}<br>%{{y:,.0f}}億円<extra></extra>",
            text=[f"{v:,.0f}" if v is not None else "" for v in vals_oku],
            textposition="outside", textfont=dict(size=10),
        ), row=r, col=c)
    else:
        fig.add_trace(go.Scatter(
            x=fys, y=vals_oku, mode="lines+markers",
            marker=dict(size=8, color=base_color), line=dict(width=2, color=base_color),
            showlegend=False,
            hovertemplate=f"<b>{seg_labels[key]}</b><br>FY %{{x}}<br>%{{y:,.0f}}億円<extra></extra>",
        ), row=r, col=c)

    fig.add_hline(y=0, line_width=0.7, line_color="gray", opacity=0.3, row=r, col=c)

fig.update_layout(
    height=panel_height * rows + 80,
    margin=dict(l=30, r=10, t=60, b=30),
    title=dict(text=f"<b>{company}</b> — {METRIC_LABEL[metric]}（億円、{n_periods}期）", font=dict(size=16)),
    bargap=0.25,
)
fig.update_xaxes(tickangle=-30, tickfont=dict(size=10))
fig.update_yaxes(tickfont=dict(size=10), tickformat=",")
st.plotly_chart(fig, use_container_width=True)

# ──────────────────────────────────────────────────────────────────
# 補助テーブル
# ──────────────────────────────────────────────────────────────────
with st.expander("📋 数値テーブル（億円）", expanded=False):
    rows_table = []
    all_fys = [fy for fy, _ in data]
    for key in keys_sorted:
        _, vals = series_map[key]
        row = {"セグメント": seg_labels[key]}
        for fy, v in zip(all_fys, vals):
            row[fy] = f"{v/1e8:,.0f}" if isinstance(v, (int, float)) else "-"
        rows_table.append(row)
    st.dataframe(pd.DataFrame(rows_table), use_container_width=True, hide_index=True)


# 出典・加工の明記（PDL1.0 の条件）
from lib.attribution import render_attribution_footer  # noqa: E402
render_attribution_footer()
