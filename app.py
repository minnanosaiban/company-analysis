"""
企業分析アプリ（商社8社・石油5社の有価証券報告書をもとにした可視化）

    streamlit run app.py
"""
from pathlib import Path

import streamlit as st

from lib.attribution import render_attribution_sidebar

# 注意: フォルダ名を pages/ にしない。pages/ があると Streamlit の自動検出が働き、
# URL を直接開いたときに app.py（出典・加工の表示、ナビゲーション）を通らなくなる。
_PAGES = Path(__file__).resolve().parent / "views"

st.set_page_config(
    page_title="企業分析アプリ",
    page_icon="🏢",
    layout="wide",
    initial_sidebar_state="expanded",
)

# url_path は、ブログなどからページへ直接リンクするときの URL（変えるとリンクが切れるので固定）
pg = st.navigation([
    st.Page(_PAGES / "01_portfolio_treemap.py", title="業界ポートフォリオ",     icon="🗺️", url_path="portfolio", default=True),
    st.Page(_PAGES / "02_valuation_scatter.py", title="バリュエーション散布図", icon="📊", url_path="valuation"),
    st.Page(_PAGES / "03_cf_pattern.py",        title="CFパターン分類",         icon="💵", url_path="cashflow"),
    st.Page(_PAGES / "04_segment_trend.py",     title="セグメント推移",         icon="📈", url_path="segments"),
])
render_attribution_sidebar()
pg.run()
