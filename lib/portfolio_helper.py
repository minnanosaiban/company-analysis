"""
lib.portfolio_helper — 有報 JSON（data/yuho/）の読み込みと、ページ共通の集計。

EDINET の有価証券報告書から抽出した JSON（財務指標・事業セグメント）を読む。
会社の一覧・名前・業種は lib.companies（data/companies.csv）が持つ。
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pandas as pd
import streamlit as st

from lib.companies import DATA_DIR, data_stamp, load_companies

YUHO = DATA_DIR / "yuho"

# 「セグメント利益」に使う指標の自動フォールバック優先順
PROFIT_METRIC_PRIORITY: list[str] = [
    "profit_attributable_to_owners",
    "operating_income",
    "ordinary_income",
    "equity_method_income",
]

METRIC_LABEL_JA: dict[str, str] = {
    "profit_attributable_to_owners": "親会社帰属利益",
    "operating_income": "営業利益",
    "ordinary_income": "経常利益",
    "equity_method_income": "持分法投資損益",
    "gross_profit": "売上総利益",
    "revenue": "売上収益",
    "external_revenue": "外部顧客売上",
    "assets": "セグメント資産",
    "intersegment_revenue": "セグメント間売上",
    "profit_before_tax": "税引前利益",
}


def list_period_files(edinet_code: str) -> list[Path]:
    """対象会社の年度別 JSON を、年度の昇順で返す。"""
    d = YUHO / edinet_code
    if not d.exists():
        return []
    return sorted(d.glob(f"{edinet_code}_*.json"))


def load_year(edinet_code: str, offset: int = 0) -> dict | None:
    """offset=0 で最新年度、1 で 1 期前。存在しなければ None。"""
    files = list_period_files(edinet_code)
    if not files or offset >= len(files):
        return None
    with open(files[-(1 + offset)], encoding="utf-8") as f:
        return json.load(f)


def summary_5yr(edinet_code: str, n: int = 5) -> list[tuple[str, dict]]:
    """直近 n 期の (fy_end, financials) を新しい順で返す。"""
    files = list_period_files(edinet_code)
    out: list[tuple[str, dict]] = []
    for f in reversed(files[-n:]):
        with open(f, encoding="utf-8") as fp:
            d = json.load(fp)
        fy = d.get("metadata", {}).get("fiscal_year_end", "")
        out.append((fy, d.get("financials", {}) or {}))
    return out


def segments_5yr(edinet_code: str, n: int = 5) -> list[tuple[str, list[dict]]]:
    """直近 n 期の (fy_end, segments[]) を古い順で返す（時系列推移用）。"""
    files = list_period_files(edinet_code)
    out: list[tuple[str, list[dict]]] = []
    for f in files[-n:]:
        with open(f, encoding="utf-8") as fp:
            d = json.load(fp)
        fy = d.get("metadata", {}).get("fiscal_year_end", "")
        out.append((fy, d.get("segments", []) or []))
    return out


def segment_display_name(segment: dict) -> str:
    """セグメント名。日本語ラベルがなければ、英字のキーを読みやすく区切って返す。"""
    label = segment.get("label")
    if label:
        return label
    key = segment.get("key") or "?"
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", key)


def segment_value(segment: dict, preferred_metric: str | None = None) -> tuple[str, float] | None:
    """セグメント 1 件から (使用した指標名, 値) を返す。

    preferred_metric が指定されればそれを優先、未指定なら
    PROFIT_METRIC_PRIORITY に従って fallback。値が無ければ None。
    """
    if preferred_metric:
        v = segment.get(preferred_metric)
        if v is not None:
            return preferred_metric, float(v)
        return None
    for key in PROFIT_METRIC_PRIORITY:
        v = segment.get(key)
        if v is not None:
            return key, float(v)
    return None


def collect_portfolio(
    edinet_codes: list[str],
    offset: int = 0,
    preferred_metric: str | None = None,
) -> list[dict]:
    """会社ごとの Treemap データを組み立てて返す。

    戻り値の各要素:
        {"edinet", "company", "fy", "accounting_standard", "metric",
         "rows": [{"label", "key", "value"}...]  # 正の値のみ
         "negatives": [...]                      # 負の値（Treemap に乗らないので別表示）
         "missing": False}
    """
    from lib.companies import company_name

    out: list[dict] = []
    for ed in edinet_codes:
        obj = load_year(ed, offset=offset)
        company = company_name(ed)
        if obj is None:
            out.append({"edinet": ed, "company": company, "missing": True})
            continue

        meta = obj.get("metadata", {})
        segs = obj.get("segments", []) or []
        rows_pos: list[dict] = []
        rows_neg: list[dict] = []
        used_metric: str | None = None
        for s in segs:
            result = segment_value(s, preferred_metric)
            if result is None:
                continue
            metric_name, v = result
            used_metric = metric_name
            row = {"label": segment_display_name(s), "key": s.get("key"), "value": v}
            (rows_pos if v > 0 else rows_neg).append(row)

        out.append({
            "edinet": ed,
            "company": company,
            "fy": meta.get("fiscal_year_end", ""),
            "accounting_standard": meta.get("accounting_standard", ""),
            "metric": used_metric,
            "rows": sorted(rows_pos, key=lambda r: r["value"], reverse=True),
            "negatives": sorted(rows_neg, key=lambda r: r["value"]),
            "missing": False,
        })
    return out


# ──────────────────────────────────────────────────────────────────
# 全社の表（散布図・CFパターン用。読み込みは1回だけにしてキャッシュする）
# ──────────────────────────────────────────────────────────────────
@st.cache_data(show_spinner="データを読み込み中…")
def _financials_all(stamp: float) -> pd.DataFrame | None:
    """data/financials.csv.gz（全社・全期を1ファイルにまとめたもの）。なければ None。

    offset=0 が最新期、1 が1期前…（会社ごとに fy の新しい順）。
    """
    p = DATA_DIR / "financials.csv.gz"
    if not p.exists():
        return None
    fin = pd.read_csv(p, dtype={"edinet_code": str})
    fin["offset"] = fin.groupby("edinet_code")["fy"].rank(ascending=False, method="first").astype(int) - 1
    comp = load_companies()
    fin = fin[fin["edinet_code"].isin(comp.index)]
    fin = fin.join(comp[["name", "label", "industry", "group", "consolidated"]], on="edinet_code")
    return fin.rename(columns={"name": "company"})


@st.cache_data(show_spinner="データを読み込み中…")
def _period_table(offset: int, stamp: float) -> pd.DataFrame:
    fin = _financials_all(stamp)
    if fin is not None:
        return fin[fin["offset"] == offset].drop(columns=["offset"]).reset_index(drop=True)
    comp = load_companies()
    rows: list[dict] = []
    for ed in comp.index:
        obj = load_year(ed, offset=offset)
        if obj is None:
            continue
        meta = obj.get("metadata", {})
        c = comp.loc[ed]
        rows.append({
            "edinet_code": ed, "company": c["name"], "label": c["label"], "industry": c["industry"],
            "group": c["group"], "consolidated": bool(c["consolidated"]),
            "fy": meta.get("fiscal_year_end", ""), "std": meta.get("accounting_standard", ""),
            **(obj.get("financials", {}) or {}),
        })
    return pd.DataFrame(rows)


def period_table(offset: int = 0) -> pd.DataFrame:
    """全社の「offset 期前」の財務指標（1社1行）。"""
    return _period_table(offset, data_stamp())


@st.cache_data(show_spinner="データを読み込み中…")
def _history_table(n: int, stamp: float) -> pd.DataFrame:
    fin = _financials_all(stamp)
    if fin is not None:
        return fin[fin["offset"] < n].reset_index(drop=True)
    comp = load_companies()
    rows: list[dict] = []
    for ed in comp.index:
        c = comp.loc[ed]
        for i, (fy, fin) in enumerate(summary_5yr(ed, n=n)):  # 新しい順
            rows.append({
                "edinet_code": ed, "company": c["name"], "label": c["label"], "industry": c["industry"],
                "consolidated": bool(c["consolidated"]), "fy": fy, "offset": i, **fin,
            })
    return pd.DataFrame(rows)


def history_table(n: int = 5) -> pd.DataFrame:
    """全社の直近 n 期の財務指標（1社×1期で1行。offset=0 が最新期）。"""
    return _history_table(n, data_stamp())
