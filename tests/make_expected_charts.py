"""tests/expected_charts.json を作る。

図のデータ（Treemap・セグメント推移・外れ値の範囲）の期待値を、Streamlit 版の実装
（lib/portfolio_helper.py の collect_portfolio / segments_5yr、views/04_segment_trend.py の集計）で計算する。
静的サイト版（docs/assets/lib/chartdata.js）と一致するかを、tests/charts.test.mjs で確認する。

    python tests/make_expected_charts.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from lib.companies import load_companies  # noqa: E402
from lib.portfolio_helper import collect_portfolio, segments_5yr  # noqa: E402

comp = load_companies()
with_seg = comp[comp["has_segments"]]
featured = comp[comp["group"] != ""].index.tolist()
rng = np.random.default_rng(7)
others = [e for e in with_seg.index if e not in featured]
sample = featured[:6] + list(rng.choice(others, 8, replace=False))

# ── Treemap
portfolio = {}
for ed in sample:
    portfolio[ed] = {}
    for offset in (0, 1):
        for pref in (None, "operating_income"):
            item = collect_portfolio([ed], offset=offset, preferred_metric=pref)[0]
            if item.get("missing"):
                portfolio[ed][f"{offset}:{pref}"] = None
                continue
            portfolio[ed][f"{offset}:{pref}"] = {
                "fy": item["fy"], "metric": item["metric"],
                "rows": [[r["label"], r["value"]] for r in item["rows"]],
                "negatives": [[r["label"], r["value"]] for r in item["negatives"]],
            }


# ── セグメント推移（views/04_segment_trend.py の集計と同じ）
def series_for(ed: str, metric: str, n: int, sort_by: str):
    data = segments_5yr(ed, n=n)
    labels, order = {}, []
    from lib.portfolio_helper import segment_display_name
    for fy, segs in reversed(data):
        for s in segs:
            key = s.get("key")
            if key and key not in labels:
                labels[key] = segment_display_name(s)
                order.append(key)
    series = {}
    for k in order:
        vals = []
        for fy, segs in data:
            m = next((s for s in segs if s.get("key") == k), None)
            v = m.get(metric) if m else None
            vals.append(v if isinstance(v, (int, float)) else None)
        if any(x is not None for x in vals):
            series[k] = vals

    def latest(k):
        for v in reversed(series[k]):
            if v is not None:
                return v
        return 0.0

    keys = sorted(series, key=latest, reverse=True) if sort_by == "latest" else sorted(series, key=lambda k: labels[k])
    return {"fys": [fy for fy, _ in data], "series": [[labels[k], series[k]] for k in keys]}


segment_series = {}
for ed in sample[:8]:
    for metric in ("operating_income", "profit_attributable_to_owners"):
        for n, sort_by in ((5, "latest"), (3, "name")):
            segment_series[f"{ed}:{metric}:{n}:{sort_by}"] = series_for(ed, metric, n, sort_by)

# ── 外れ値の範囲（1〜99%点を両側6%広げる。散布図の「外れ値を除く」）
fin = pd.read_csv(ROOT / "data" / "financials.csv.gz", dtype={"edinet_code": str})
fin = fin[fin["edinet_code"].isin(comp.index)].copy()
fin["o"] = fin.groupby("edinet_code")["fy"].rank(ascending=False, method="first").astype(int) - 1
latest = fin[fin["o"] == 0]
clip = {}
for col, scale in (("roe", 100), ("per", 1), ("equity_ratio", 100), ("net_sales", 1e-8)):
    s = (latest[col] * scale).dropna()
    lo, hi = float(s.quantile(0.01)), float(s.quantile(0.99))
    pad = (hi - lo) * 0.06
    clip[col] = [lo - pad, hi + pad]

out = {"sample": [str(e) for e in sample], "portfolio": portfolio, "segment_series": segment_series, "clip": clip}
(ROOT / "tests" / "expected_charts.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print("expected_charts.json:", len(sample), "社,", sum(1 for v in portfolio.values() for x in v.values() if x), "Treemap,", len(segment_series), "系列セット")
