"""tests/expected.json を作る。

静的サイト版（JavaScript）の絞り込み・CFパターンの期待値を、Streamlit 版が使うデータ
（data/financials.csv.gz・data/companies.csv）から、pandas で**別に実装して**計算する。
JS 側の実装（docs/assets/lib/*.js）と一致するかを、tests/logic.test.mjs で確認する。

    python tests/make_expected.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
comp = pd.read_csv(ROOT / "data" / "companies.csv", dtype={"edinet_code": str, "sec_code": str})
fin = pd.read_csv(ROOT / "data" / "financials.csv.gz", dtype={"edinet_code": str})
fin = fin[fin["edinet_code"].isin(comp["edinet_code"])].copy()
fin["offset"] = fin.groupby("edinet_code")["fy"].rank(ascending=False, method="first").astype(int) - 1
fin = fin.merge(comp[["edinet_code", "consolidated", "industry"]], on="edinet_code")
latest = fin[fin["offset"] == 0].copy()

SCALE = {"roe": 100, "per": 1, "equity_ratio": 100, "net_sales": 1e-8, "net_income": 1e-8}
PATTERN = {
    (1, -1, -1): "優良安定型", (1, -1, 1): "積極成長型", (1, 1, -1): "リストラ型", (1, 1, 1): "資金蓄積型",
    (-1, -1, 1): "成長投資型", (-1, 1, -1): "再建型", (-1, 1, 1): "危機型", (-1, -1, -1): "末期型",
}


def pattern(op, inv, fn):
    s = [np.sign(x) if pd.notna(x) else None for x in (op, inv, fn)]
    if any(x is None or x == 0 for x in s):
        return None
    return PATTERN[tuple(int(x) for x in s)]


latest["pattern"] = [pattern(a, b, c) for a, b, c in zip(latest["operating_cf"], latest["investing_cf"], latest["financing_cf"])]


def rng(df, key, lo=None, hi=None):
    v = df[key] * SCALE[key]
    m = v.notna()
    if lo is not None:
        m &= v >= lo
    if hi is not None:
        m &= v <= hi
    return df[m]


def sign_cond(df, col, pos):
    v = df[col]
    return df[v.notna() & (v > 0 if pos else v < 0)]


filters = {
    "roe=10..": len(rng(latest, "roe", 10)),
    "roe=10..&per=..15": len(rng(rng(latest, "roe", 10), "per", None, 15)),
    "std=IFRS": int((latest["std"] == "IFRS").sum()),
    "cons=0": int((~latest["consolidated"]).sum()),
    "cons=1": int(latest["consolidated"].sum()),
    "cf_op=pos&cf_inv=neg&cf_fin=neg": len(sign_cond(sign_cond(sign_cond(latest, "operating_cf", True), "investing_cf", False), "financing_cf", False)),
    "pat=優良安定型": int((latest["pattern"] == "優良安定型").sum()),
    "pat=危機型,末期型": int(latest["pattern"].isin(["危機型", "末期型"]).sum()),
    "net_sales=10000..": len(rng(latest, "net_sales", 10000)),
    "equity_ratio=..20&roe=8..": len(rng(rng(latest, "equity_ratio", None, 20), "roe", 8)),
    "std=JP,US&per=10..20": len(rng(latest[latest["std"].isin(["JP", "US"])], "per", 10, 20)),
    "": len(latest),
}

dist = latest["pattern"].value_counts().to_dict()
sample = latest.sort_values("edinet_code").head(30)
sample = {r.edinet_code: (r.pattern if r.pattern else None) for r in sample.itertuples()}

expected = {
    "companies": int(len(comp)),
    "rows": int(len(fin)),
    "filters": filters,
    "pattern_dist": dict(sorted(dist.items())),
    "pattern_sample": sample,
    "offset1_count": int((fin["offset"] == 1).sum()),
    "industry_wholesale": int((comp["industry"] == "卸売業").sum()),
}
(ROOT / "tests" / "expected.json").write_text(json.dumps(expected, ensure_ascii=False, indent=1), encoding="utf-8")
print("expected.json を作成:", {k: v for k, v in expected.items() if k not in ("pattern_sample",)})
