"""tests/expected_charts.json を作る。

図のデータ（Treemap・セグメント推移・外れ値の範囲）の期待値を、**この Python の基準実装**で計算する。
静的サイト版（docs/assets/lib/chartdata.js）の JavaScript と一致するかを、tests/charts.test.mjs で確認する。
入力は、data/yuho/（有報 JSON）・data/companies.csv・data/financials.csv.gz。

    python tests/make_expected_charts.py        （pandas・numpy が必要: pip install -r tests/requirements.txt）
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
YUHO = ROOT / "data" / "yuho"

PROFIT_PRIORITY = ["profit_attributable_to_owners", "operating_income", "ordinary_income", "equity_method_income"]


# ── 基準実装（有報 JSON を、年度別ファイルのまま読む）──────────────────────
def period_files(ed: str) -> list[Path]:
    d = YUHO / ed
    return sorted(d.glob(f"{ed}_*.json")) if d.exists() else []


def load_json(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def segment_name(seg: dict) -> str:
    """日本語ラベル。なければ、英字のキーを読みやすく区切る。"""
    return seg.get("label") or re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", seg.get("key") or "?")


def segment_value(seg: dict, preferred):
    if preferred:
        v = seg.get(preferred)
        return (preferred, float(v)) if v is not None else None
    for k in PROFIT_PRIORITY:
        v = seg.get(k)
        if v is not None:
            return k, float(v)
    return None


def collect_portfolio(ed: str, offset: int, preferred):
    """offset=0 が最新期。ファイルがなければ None。"""
    files = period_files(ed)
    if not files or offset >= len(files):
        return None
    obj = load_json(files[-(1 + offset)])
    rows_pos, rows_neg, used = [], [], None
    for s in obj.get("segments") or []:
        r = segment_value(s, preferred)
        if r is None:
            continue
        used = r[0]
        (rows_pos if r[1] > 0 else rows_neg).append((segment_name(s), r[1]))
    return {
        "fy": obj["metadata"]["fiscal_year_end"], "metric": used,
        "rows": [[n, v] for n, v in sorted(rows_pos, key=lambda x: x[1], reverse=True)],
        "negatives": [[n, v] for n, v in sorted(rows_neg, key=lambda x: x[1])],
    }


def segments_last_n(ed: str, n: int):
    """直近 n 期（古い順）の (fy, segments)。"""
    out = []
    for f in period_files(ed)[-n:]:
        d = load_json(f)
        out.append((d["metadata"]["fiscal_year_end"], d.get("segments") or []))
    return out


def series_for(ed: str, metric: str, n: int, sort_by: str):
    data = segments_last_n(ed, n)
    labels, order = {}, []
    for fy, segs in reversed(data):            # 新しい期から見て、名前は新しい方を優先
        for s in segs:
            key = s.get("key")
            if key and key not in labels:
                labels[key] = segment_name(s)
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


# ── サンプルの選び方 ────────────────────────────────────────────────
comp = pd.read_csv(ROOT / "data" / "companies.csv", dtype={"edinet_code": str, "sec_code": str}).set_index("edinet_code", drop=False)
comp["group"] = comp["group"].fillna("")
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
            portfolio[ed][f"{offset}:{pref}"] = collect_portfolio(ed, offset, pref)

# ── セグメント推移
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
