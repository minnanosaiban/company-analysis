"""
会社一覧（data/companies.csv）と、全ページ共通の「対象の会社」選択部品。

- 会社の追加は companies.csv と data/yuho/<EDINETコード>/ に置くだけ（コードの修正は不要）
- 環境変数 COMPANY_DATA_DIR でデータのフォルダ（companies.csv と yuho/ がある場所）を差し替え可能
"""
from __future__ import annotations

import json
import os
from pathlib import Path

import pandas as pd
import streamlit as st

DATA_DIR = Path(os.environ.get("COMPANY_DATA_DIR") or Path(__file__).resolve().parents[1] / "data")

PRESET = "おすすめ：商社・石油（13社）"
MODES = [PRESET, "業種から選ぶ", "会社を選ぶ", "全社"]
_GROUP_ORDER = {"商社": 0, "石油": 1}


def data_stamp() -> float:
    """データの更新を検知するための目印（キャッシュのキーに使う）。"""
    p = DATA_DIR / "meta.json"
    return p.stat().st_mtime if p.exists() else 0.0


@st.cache_data(show_spinner=False)
def _load_companies(stamp: float) -> pd.DataFrame:
    df = pd.read_csv(DATA_DIR / "companies.csv", dtype={"sec_code": str, "edinet_code": str})
    df["group"] = df["group"].fillna("")
    df["industry"] = df["industry"].fillna("")
    df["label"] = df["name"] + "（" + df["sec_code"] + "）"
    return df.set_index("edinet_code", drop=False)


def load_companies() -> pd.DataFrame:
    return _load_companies(data_stamp())


def load_meta() -> dict:
    p = DATA_DIR / "meta.json"
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def company_name(edinet_code: str) -> str:
    df = load_companies()
    return df.at[edinet_code, "name"] if edinet_code in df.index else edinet_code


def company_label(edinet_code: str) -> str:
    df = load_companies()
    return df.at[edinet_code, "label"] if edinet_code in df.index else edinet_code


def _sorted_codes(sel: pd.DataFrame, preset: bool = False) -> list[str]:
    if preset:
        sel = sel.assign(_g=sel["group"].map(_GROUP_ORDER).fillna(9))
        return sel.sort_values(["_g", "sec_code"])["edinet_code"].tolist()
    return sel.sort_values("sec_code")["edinet_code"].tolist()


def render_company_selector(
    key: str,
    default_mode: str = PRESET,
    default_industry: str = "卸売業",
) -> list[str]:
    """サイドバーに「対象の会社」の選択欄を描画し、選ばれた EDINET コードのリストを返す。"""
    df = load_companies()
    with st.sidebar:
        st.header("対象の会社")
        mode = st.radio("選び方", MODES, index=MODES.index(default_mode), key=f"{key}_mode")

        if mode == PRESET:
            sel = df[df["group"] != ""]
            codes = _sorted_codes(sel, preset=True)
        elif mode == "業種から選ぶ":
            industries = sorted(i for i in df["industry"].unique() if i)
            default = [default_industry] if default_industry in industries else industries[:1]
            chosen = st.multiselect("業種（東証33業種）", industries, default=default, key=f"{key}_ind")
            sel = df[df["industry"].isin(chosen)]
            codes = _sorted_codes(sel)
        elif mode == "会社を選ぶ":
            options = df.sort_values("sec_code")["label"].tolist()
            featured = df[df["group"] != ""].sort_values("sec_code")["label"].tolist()
            chosen = st.multiselect(
                "会社（名前・コードで検索）", options, default=featured[:3], key=f"{key}_co",
            )
            sel = df[df["label"].isin(chosen)]
            codes = _sorted_codes(sel)
        else:
            sel = df
            codes = _sorted_codes(sel)

        n_nc = int((~sel["consolidated"]).sum()) if len(sel) else 0
        st.caption(f"対象：{len(sel)}社" + (f"（うち個別財務諸表のみ {n_nc}社）" if n_nc else ""))
        st.divider()
        st.header("表示設定")
    return codes
