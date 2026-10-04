"""
業界ポートフォリオ — 会社別のセグメント別利益 Treemap
"""
import math

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from lib.companies import load_companies, render_company_selector
from lib.layout_toggle import render_layout_toggle
from lib.portfolio_helper import (
    METRIC_LABEL_JA,
    PROFIT_METRIC_PRIORITY,
    collect_portfolio,
)

st.set_page_config(
    page_title="業界ポートフォリオ",
    page_icon="🗺️",
    layout="wide",
    initial_sidebar_state="expanded",
)
render_layout_toggle()

st.title("🗺️ 業界ポートフォリオ")
st.caption(
    "会社ごとの事業セグメント別の利益を Treemap で一覧。"
    "EDINET の有価証券報告書から抽出した事業セグメント情報を使用しています。"
)

# ──────────────────────────────────────────────────────────────────
# サイドバー
# ──────────────────────────────────────────────────────────────────
targets_all = render_company_selector("p01")

with st.sidebar:
    period_labels = ["最新期", "1期前", "2期前", "3期前", "4期前"]
    offset = st.selectbox(
        "期間",
        options=list(range(len(period_labels))),
        format_func=lambda x: period_labels[x],
        index=0,
    )

    metric_options = [
        ("auto",                            "自動（利益優先フォールバック）"),
        ("profit_attributable_to_owners",   "親会社帰属利益（IFRS）"),
        ("operating_income",                "営業利益"),
        ("ordinary_income",                 "経常利益（日本基準）"),
        ("equity_method_income",            "持分法投資損益"),
        ("gross_profit",                    "売上総利益"),
        ("assets",                          "セグメント資産"),
        ("external_revenue",                "外部顧客売上"),
    ]
    metric_choice = st.selectbox(
        "セグメント指標",
        options=[m[0] for m in metric_options],
        format_func=lambda k: dict(metric_options)[k],
        index=0,
    )
    preferred_metric = None if metric_choice == "auto" else metric_choice

    cols_per_row = st.slider("グリッド列数", min_value=1, max_value=4, value=3)
    treemap_height = st.slider("Treemap 高さ(px)", min_value=240, max_value=500, value=340, step=20)

    st.markdown("---")
    st.caption(
        "**指標フォールバック順（自動）**: "
        + " → ".join(METRIC_LABEL_JA.get(m, m) for m in PROFIT_METRIC_PRIORITY)
        + "\n\nセグメント利益の定義は会社により異なります（営業利益ベース or 親会社帰属利益ベース）。"
        "個別の値は各 Treemap のサブタイトルで確認してください。"
    )

# ──────────────────────────────────────────────────────────────────
# 対象の絞り込み（セグメント情報がある会社だけ描画。ページ分割）
# ──────────────────────────────────────────────────────────────────
comp = load_companies()
with_seg = [ed for ed in targets_all if bool(comp.at[ed, "has_segments"])]
no_seg = [comp.at[ed, "name"] for ed in targets_all if ed not in set(with_seg)]

PAGE_SIZE = 12
n_pages = max(1, math.ceil(len(with_seg) / PAGE_SIZE))
if not with_seg:
    st.warning("表示できる会社がありません。対象の選び方を変えてください。")
    st.stop()

if n_pages > 1:
    with st.sidebar:
        page = st.number_input(f"表示ページ（全{n_pages}ページ・{PAGE_SIZE}社ずつ）", 1, n_pages, 1)
else:
    page = 1
shown = with_seg[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]

st.caption(
    f"{len(with_seg)}社中 {(page - 1) * PAGE_SIZE + 1}〜{(page - 1) * PAGE_SIZE + len(shown)}社を表示"
    + (f"（セグメント情報がない {len(no_seg)}社は除外）" if no_seg else "")
)
portfolio = collect_portfolio(shown, offset=offset, preferred_metric=preferred_metric)


def _fmt_amount(value: float) -> str:
    """値を億円単位で表示。"""
    oku = value / 1e8
    if abs(oku) >= 10000:
        return f"{oku/10000:,.1f}兆円"
    return f"{oku:,.0f}億円"


def _render_treemap(item: dict) -> None:
    company = item["company"]
    if item.get("missing"):
        st.warning(f"{company}：データなし")
        return
    rows = item.get("rows", [])
    negs = item.get("negatives", [])
    metric = item.get("metric")
    fy = item.get("fy", "")
    std = item.get("accounting_standard", "")

    if not rows:
        st.info(f"{company}（{fy} / {std}）：正の値を持つセグメントなし")
        if negs:
            with st.expander(f"マイナス値セグメント（{len(negs)}件）", expanded=False):
                for r in negs:
                    st.markdown(f"- {r['label']}: **{_fmt_amount(r['value'])}**")
        return

    labels = [r["label"] for r in rows]
    values = [r["value"] for r in rows]
    customdata = [_fmt_amount(v) for v in values]

    fig = go.Figure(go.Treemap(
        labels=labels,
        values=values,
        parents=[""] * len(labels),
        customdata=customdata,
        texttemplate="<b>%{label}</b><br>%{customdata}<br>(%{percentRoot:.1%})",
        hovertemplate="%{label}<br>%{customdata}<br>構成比 %{percentRoot:.1%}<extra></extra>",
        textfont=dict(size=11),
        marker=dict(cornerradius=4),
    ))
    metric_ja = METRIC_LABEL_JA.get(metric, metric) if metric else "—"
    fig.update_layout(
        title=dict(
            text=f"<b>{company}</b><br><sub>{fy} ({std}) — 指標: {metric_ja}</sub>",
            font=dict(size=15),
            x=0.02,
        ),
        margin=dict(l=4, r=4, t=64, b=4),
        height=treemap_height,
    )
    st.plotly_chart(fig, use_container_width=True, key=f"tm_{item['edinet']}_{offset}")

    if negs:
        neg_caption = "・".join(f"{r['label']}: {_fmt_amount(r['value'])}" for r in negs)
        st.caption(f"⚠ マイナス値（Treemap 外）: {neg_caption}")


# ──────────────────────────────────────────────────────────────────
# グリッド描画
# ──────────────────────────────────────────────────────────────────
for i in range(0, len(portfolio), cols_per_row):
    chunk = portfolio[i: i + cols_per_row]
    cols = st.columns(cols_per_row)
    for col, item in zip(cols, chunk):
        with col:
            _render_treemap(item)

# ──────────────────────────────────────────────────────────────────
# データテーブル（補助情報）
# ──────────────────────────────────────────────────────────────────
with st.expander("📋 セグメント別利益の数値一覧（表示中の会社）", expanded=False):
    table_rows = []
    for item in portfolio:
        if item.get("missing"):
            continue
        metric_ja = METRIC_LABEL_JA.get(item["metric"], item["metric"] or "—")
        for r in item.get("rows", []) + item.get("negatives", []):
            table_rows.append({
                "会社": item["company"],
                "FY": item["fy"],
                "指標": metric_ja,
                "セグメント": r["label"],
                "値（円）": int(r["value"]),
                "値（億円）": round(r["value"] / 1e8, 1),
            })
    if table_rows:
        st.dataframe(pd.DataFrame(table_rows), use_container_width=True, hide_index=True)
    else:
        st.info("表示するデータなし")

if no_seg:
    with st.expander(f"セグメント情報がない会社（{len(no_seg)}社）"):
        st.write("、".join(no_seg))
        st.caption("事業が単一、またはセグメントの記載形式が異なる会社です。")


# 出典・加工の明記（PDL1.0 の条件）
from lib.attribution import render_attribution_footer  # noqa: E402
render_attribution_footer()
