"""
出典・加工の明記（EDINET 利用規約 / 公共データ利用規約 第1.0版 の条件）。

- 出典の表示:   EDINET閲覧（提出）サイトのURLと、PDL1.0 の規約原文ページのURL
- 加工の明記:   加工した旨と加工した者（政府が作成した未加工の情報であるかのように見せない）
参考: https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html
"""
from __future__ import annotations

import streamlit as st

EDINET_URL = "https://disclosure2.edinet-fsa.go.jp/"
PDL_URL = "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0"
EDINET_TERMS_URL = "https://disclosure2dl.edinet-fsa.go.jp/guide/static/disclosure/WZEK0030.html"
BLOG_URL = "https://minnanosaiban.github.io/tomo/blog/"
PROCESSOR = "minnanosaiban"

_NOTICE = (
    f"**出典**：[EDINET閲覧（提出）サイト]({EDINET_URL})、"
    f"[公共データ利用規約（第1.0版）]({PDL_URL})  \n"
    f"**加工**：金融庁 EDINET の有価証券報告書（XBRL）から、{PROCESSOR} が必要な項目を抽出・"
    "変換し、集計・分類・図表化しています。政府が作成した情報そのものではなく、"
    "元の提出書類と異なる場合があります。  \n"
    "投資の助言ではありません。正確な内容は各社の有価証券報告書で確認してください。"
)


def render_attribution_sidebar() -> None:
    """全ページ共通でサイドバーの下部に表示する。"""
    from lib.companies import load_meta

    meta = load_meta()
    with st.sidebar:
        st.divider()
        if meta:
            st.caption(f"データ：{meta.get('companies', '?')}社（更新日 {meta.get('updated', '?')}）")
        st.caption(_NOTICE)
        st.markdown(f"[📚 解説ブログ（株価分析の連載）]({BLOG_URL})")


def render_attribution_footer() -> None:
    """各ページの末尾に表示する短い出典表記。"""
    st.divider()
    st.caption(
        f"出典：[EDINET閲覧（提出）サイト]({EDINET_URL})（{PROCESSOR} が加工）、"
        f"[PDL1.0]({PDL_URL})"
    )
