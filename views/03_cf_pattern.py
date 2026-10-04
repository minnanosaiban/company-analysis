"""
CFパターン分類 — 営業/投資/財務CF の符号で経営フェーズを8パターンに分類
"""
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.companies import render_company_selector
from lib.layout_toggle import render_layout_toggle
from lib.portfolio_helper import history_table

st.set_page_config(
    page_title="CFパターン分類",
    page_icon="💵",
    layout="wide",
    initial_sidebar_state="expanded",
)
render_layout_toggle()

st.title("💵 CFパターン分類")
st.caption(
    "営業CF / 投資CF / 財務CF の符号の組み合わせで、各社の経営フェーズを 8 パターンに分類。"
    "最新期の分布と、業種ごとの内訳、少数の会社を選んだときは 5 期の軌跡も見られます。"
)

# ──────────────────────────────────────────────────────────────────
# 8 パターン定義
# ──────────────────────────────────────────────────────────────────
# (op_cf符号, inv_cf符号, fin_cf符号) → (パターン名, 説明)
PATTERN_TABLE: dict[tuple[int, int, int], tuple[str, str]] = {
    ( 1, -1, -1): ("優良安定型",   "営業＋・投資拡大・借入返済。最も健全な姿"),
    ( 1, -1,  1): ("積極成長型",   "営業＋・投資拡大・借入増。攻めの成長フェーズ"),
    ( 1,  1, -1): ("リストラ型",   "営業＋・資産売却・借入返済。事業縮小／資産整理"),
    ( 1,  1,  1): ("資金蓄積型",   "営業＋・売却・借入とも増。流動性確保フェーズ"),
    (-1, -1,  1): ("成長投資型",   "営業赤・投資拡大・借入で凌ぐ。創業期/赤字成長"),
    (-1,  1, -1): ("再建型",       "営業赤・資産売却で借入返済。再建途上"),
    (-1,  1,  1): ("危機型",       "営業赤・売却＋借入で資金繰り。流動性危機"),
    (-1, -1, -1): ("末期型",       "全マイナス。事業継続性に黄信号"),
}
PATTERN_ORDER = [name for name, _ in PATTERN_TABLE.values()]
PATTERN_COLOR: dict[str, str] = {
    "優良安定型":   "#2ca02c",
    "積極成長型":   "#1f77b4",
    "リストラ型":   "#ff7f0e",
    "資金蓄積型":   "#8c564b",
    "成長投資型":   "#9467bd",
    "再建型":       "#bcbd22",
    "危機型":       "#e377c2",
    "末期型":       "#d62728",
}
TRAIL_MAX_COMPANIES = 30   # 軌跡（過去期の線）を出す上限。これを超えると線が重なって読めない
LABEL_MAX_COMPANIES = 40   # 会社名ラベルを出す上限


def _sign(v) -> int | None:
    if v is None or pd.isna(v):
        return None
    return 1 if v > 0 else -1 if v < 0 else 0


def _classify(op, inv, fin) -> tuple[str, str] | None:
    so, si, sf = _sign(op), _sign(inv), _sign(fin)
    if None in (so, si, sf) or 0 in (so, si, sf):
        return None
    return PATTERN_TABLE.get((so, si, sf))


# ──────────────────────────────────────────────────────────────────
# サイドバー
# ──────────────────────────────────────────────────────────────────
targets = render_company_selector("p03", default_mode="全社")

with st.sidebar:
    n_periods = st.slider("表示期数", min_value=1, max_value=5, value=5)
    can_trail = len(targets) <= TRAIL_MAX_COMPANIES and n_periods > 1
    show_trail = st.checkbox(
        "過去期も軌跡として表示", value=can_trail, disabled=not can_trail,
        help=f"{TRAIL_MAX_COMPANIES}社以下を選んだときに使えます。",
    )
    normalize = st.checkbox("総資産で正規化（比較用）", value=False,
                            help="営業CF/総資産 のような比率にして、規模差を消す")
    chart_height = st.slider("チャート高さ(px)", min_value=400, max_value=900, value=640, step=20)

# ──────────────────────────────────────────────────────────────────
# データ
# ──────────────────────────────────────────────────────────────────
hist = history_table(5)
hist = hist[hist["edinet_code"].isin(targets) & (hist["offset"] < n_periods)].copy()
if hist.empty:
    st.warning("表示対象なし。対象の選び方を変えてください。")
    st.stop()

pats = [_classify(o, i, f) for o, i, f in zip(hist.get("operating_cf"), hist.get("investing_cf"), hist.get("financing_cf"))]
hist["pattern"] = [p[0] if p else None for p in pats]
hist["pattern_desc"] = [p[1] if p else None for p in pats]
hist["is_latest"] = hist["offset"] == 0


def _vals(row: pd.Series):
    if not normalize:
        return row["operating_cf"], row["investing_cf"], row["financing_cf"]
    ta = row.get("total_assets")
    if ta is None or pd.isna(ta) or ta <= 0:
        return None, None, None
    return row["operating_cf"] / ta, row["investing_cf"] / ta, row["financing_cf"] / ta


triples = [_vals(r) for _, r in hist.iterrows()]
hist["x_plot"], hist["y_plot"], hist["fin_plot"] = zip(*triples)
df_plot = hist.dropna(subset=["x_plot", "y_plot", "pattern"]).copy()
if not show_trail:
    df_plot = df_plot[df_plot["is_latest"]]

with st.sidebar:
    highlight = st.multiselect(
        "強調表示する会社",
        sorted(df_plot.loc[df_plot["is_latest"], "label"].unique()), default=[],
        help="名前やコードで検索できます。",
    )

n_latest = int(df_plot["is_latest"].sum())
show_label = n_latest <= LABEL_MAX_COMPANIES

# ──────────────────────────────────────────────────────────────────
# 散布図: X=営業CF, Y=投資CF, 色=パターン
# ──────────────────────────────────────────────────────────────────
fig = go.Figure()

if show_trail:
    for ed, sub in df_plot.groupby("edinet_code"):
        sub = sub.sort_values("offset", ascending=False)  # 古い→新しい
        fig.add_trace(go.Scatter(
            x=sub["x_plot"], y=sub["y_plot"], mode="lines",
            line=dict(width=1.2, color="rgba(120,120,120,0.4)"),
            showlegend=False, hoverinfo="skip",
        ))

for pat in PATTERN_ORDER:
    sub = df_plot[df_plot["pattern"] == pat]
    if sub.empty:
        continue
    big = sub["is_latest"]
    fig.add_trace(go.Scatter(
        x=sub["x_plot"], y=sub["y_plot"],
        mode="markers+text" if show_label else "markers",
        text=[c if (l and show_label) else "" for c, l in zip(sub["company"], big)],
        textposition="top center", textfont=dict(size=10),
        marker=dict(
            size=[(16 if n_latest <= 60 else 9) if l else 8 for l in big],
            color=PATTERN_COLOR.get(pat, "#7f7f7f"),
            opacity=[0.9 if l else 0.4 for l in big],
            line=dict(width=0.6, color="white"),
        ),
        name=f"{pat}（{int(big.sum())}）",
        customdata=sub[["company", "fy", "pattern", "pattern_desc", "financing_cf", "industry"]].values,
        hovertemplate=(
            "<b>%{customdata[0]}</b>（%{customdata[5]}）<br>FY %{customdata[1]}<br>"
            "営業CF %{x:,.3g}　投資CF %{y:,.3g}<br>財務CF %{customdata[4]:,.0f}<br>"
            "<b>%{customdata[2]}</b> — %{customdata[3]}<extra></extra>"
        ),
    ))

if highlight:
    hl = df_plot[df_plot["is_latest"] & df_plot["label"].isin(highlight)]
    fig.add_trace(go.Scatter(
        x=hl["x_plot"], y=hl["y_plot"], mode="markers+text", text=hl["company"],
        textposition="top center", textfont=dict(size=12, color="#111"),
        marker=dict(size=20, color="rgba(0,0,0,0)", line=dict(width=2.5, color="#111")),
        name="強調", hoverinfo="skip",
    ))

# 象限線（0軸）
fig.add_vline(x=0, line_dash="dash", line_color="gray", opacity=0.5)
fig.add_hline(y=0, line_dash="dash", line_color="gray", opacity=0.5)

axis_fmt = ".1%" if normalize else ".2s"
fig.update_layout(
    xaxis_title="営業CF" + ("／総資産" if normalize else "（円）"),
    yaxis_title="投資CF" + ("／総資産" if normalize else "（円）"),
    xaxis=dict(tickformat=axis_fmt, zeroline=False),
    yaxis=dict(tickformat=axis_fmt, zeroline=False),
    height=chart_height, margin=dict(l=40, r=20, t=20, b=40),
    legend=dict(orientation="v", yanchor="top", y=1, xanchor="left", x=1.02),
    hovermode="closest",
)
st.plotly_chart(fig, use_container_width=True)

st.caption(
    "大きいマーカー＝最新期" + ("、小さいマーカー＝過去期（薄く表示）、灰色の細線は年度間の軌跡。" if show_trail else "。")
    + " 0軸の十字で 4 象限に分け、色は財務CFを加味した 8 パターンです。"
    + ("" if normalize else " 規模の大きい会社が端に寄るため、比較には「総資産で正規化」も使えます。")
)
if int((~df_plot.drop_duplicates("edinet_code")["consolidated"]).sum()):
    st.caption("⚠ 個別財務諸表のみの会社が含まれます（連結の会社とは基準が異なります）。")

# ──────────────────────────────────────────────────────────────────
# 最新期のパターン分布・業種別の内訳
# ──────────────────────────────────────────────────────────────────
df_latest = hist[hist["is_latest"]].copy()
n_unclassified = int(df_latest["pattern"].isna().sum())

c1, c2 = st.columns([1, 1])
with c1:
    st.subheader("最新期のパターン分布")
    counts = df_latest["pattern"].value_counts().to_dict()
    summary = []
    for (so, si, sf), (name, desc) in PATTERN_TABLE.items():
        summary.append({
            "符号": f'{"+"if so>0 else "-"}/{"+"if si>0 else "-"}/{"+"if sf>0 else "-"}',
            "パターン": name, "説明": desc, "該当社数": counts.get(name, 0),
        })
    st.dataframe(pd.DataFrame(summary), use_container_width=True, hide_index=True)
    if n_unclassified:
        st.caption(f"分類できない会社（値の欠損など）：{n_unclassified}社")

with c2:
    st.subheader("最新期 会社別")
    df_show = df_latest[["company", "industry", "fy", "pattern", "operating_cf", "investing_cf", "financing_cf"]].copy()
    df_show.columns = ["会社", "業種", "FY", "パターン", "営業CF", "投資CF", "財務CF"]
    st.dataframe(df_show.sort_values(["パターン", "会社"]), use_container_width=True, hide_index=True, height=360)

# 業種ごとの内訳（2業種以上を選んだとき）
d_ind = df_latest.dropna(subset=["pattern"])
if d_ind["industry"].nunique() >= 2:
    st.subheader("業種別のパターン構成（最新期・社数）")
    pivot = d_ind.pivot_table(index="industry", columns="pattern", values="edinet_code", aggfunc="count", fill_value=0)
    pivot = pivot.reindex(columns=[p for p in PATTERN_ORDER if p in pivot.columns])
    pivot = pivot.loc[pivot.sum(axis=1).sort_values().index]
    bar = go.Figure()
    for pat in pivot.columns:
        bar.add_trace(go.Bar(y=pivot.index, x=pivot[pat], name=pat, orientation="h",
                             marker_color=PATTERN_COLOR.get(pat, "#7f7f7f")))
    bar.update_layout(barmode="stack", height=max(260, 24 * len(pivot) + 80),
                      margin=dict(l=10, r=10, t=10, b=30), legend=dict(orientation="h", y=1.08))
    st.plotly_chart(bar, use_container_width=True)

# ──────────────────────────────────────────────────────────────────
# 全期間生データ
# ──────────────────────────────────────────────────────────────────
with st.expander("📋 全期間データ", expanded=False):
    df_all = hist[["company", "industry", "fy", "pattern", "operating_cf", "investing_cf", "financing_cf", "total_assets"]].copy()
    df_all.columns = ["会社", "業種", "FY", "パターン", "営業CF", "投資CF", "財務CF", "総資産"]
    st.dataframe(df_all, use_container_width=True, hide_index=True)


# 出典・加工の明記（PDL1.0 の条件）
from lib.attribution import render_attribution_footer  # noqa: E402
render_attribution_footer()
