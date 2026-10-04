// 図に渡すデータの組み立て（画面・ECharts に依存しない。テストできる部分）。
// tests/make_expected_charts.py の Python の基準実装と同じ計算にそろえる（tests/charts.test.mjs で照合）。
import { isNum } from './fields.js?v=9af2442f53';

/** 昇順にした配列の q 分位点（線形補間）。 */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** 外れ値を除いた表示範囲（1〜99%点を、両側に pad の割合だけ広げる）。 */
export function clipBounds(values, pad = 0.06) {
  const a = values.filter(isNum).sort((x, y) => x - y);
  if (a.length < 2) return null;
  const lo = quantile(a, 0.01); const hi = quantile(a, 0.99);
  const w = (hi - lo) * pad || 1;
  return [lo - w, hi + w];
}

/** 値域を [minPx, maxPx] に正規化したマーカーの大きさ（絶対値。欠損は中央値）。 */
export function markerSizes(values, minPx = 6, maxPx = 40) {
  const abs = values.map((v) => (isNum(v) ? Math.abs(v) : null));
  const known = abs.filter((v) => v !== null).sort((a, b) => a - b);
  if (!known.length) return values.map(() => minPx + 4);
  const med = quantile(known, 0.5);
  const arr = abs.map((v) => (v === null ? med : v));
  const mn = Math.min(...arr); const mx = Math.max(...arr);
  if (mx === mn) return arr.map(() => minPx + 4);
  return arr.map((v) => minPx + ((v - mn) / (mx - mn)) * (maxPx - minPx));
}

// ── セグメント ──────────────────────────────────────────────────

// 「セグメント利益」に使う指標の自動フォールバック順
export const PROFIT_PRIORITY = ['profit_attributable_to_owners', 'operating_income', 'ordinary_income', 'equity_method_income'];

export const SEGMENT_METRICS = [
  { key: 'profit_attributable_to_owners', label: '親会社帰属利益（IFRS）' },
  { key: 'operating_income',             label: '営業利益' },
  { key: 'ordinary_income',              label: '経常利益（日本基準）' },
  { key: 'gross_profit',                 label: '売上総利益' },
  { key: 'equity_method_income',         label: '持分法投資損益' },
  { key: 'assets',                       label: 'セグメント資産' },
  { key: 'external_revenue',             label: '外部顧客売上' },
  { key: 'revenue',                      label: '売上収益' },
];
export const METRIC_LABEL = Object.fromEntries(SEGMENT_METRICS.map((m) => [m.key, m.label]));

/** セグメント1件から [使った指標, 値]。preferred があればそれだけ、なければ優先順で最初の値。なければ null。 */
export function segmentValue(seg, preferred = null) {
  if (preferred) return isNum(seg[preferred]) ? [preferred, seg[preferred]] : null;
  for (const k of PROFIT_PRIORITY) if (isNum(seg[k])) return [k, seg[k]];
  return null;
}

/**
 * 業界ポートフォリオ（Treemap）の1社分。
 * segData: segments/<EDINET>.json（periods は古い期から）。offset=0 が最新期。
 * 戻り値: { fy, metric, rows:[{name,value}]（正の値・降順）, negatives:[...]（負の値・昇順） } / データなしは null
 */
export function portfolioItem(segData, offset = 0, preferred = null) {
  if (!segData || !segData.periods || offset >= segData.periods.length) return null;
  const period = segData.periods[segData.periods.length - 1 - offset];
  const rows = []; const negatives = [];
  let used = null;
  for (const s of period.segments) {
    const r = segmentValue(s, preferred);
    if (!r) continue;
    used = r[0];
    (r[1] > 0 ? rows : negatives).push({ name: s.name, key: s.key, value: r[1] });
  }
  rows.sort((a, b) => b.value - a.value);
  negatives.sort((a, b) => a.value - b.value);
  return { fy: period.fy, metric: used, rows, negatives };
}

/** その会社に値がある指標（SEGMENT_METRICS の順）。 */
export function availableMetrics(segData) {
  if (!segData) return [];
  return SEGMENT_METRICS.map((m) => m.key).filter((k) =>
    segData.periods.some((p) => p.segments.some((s) => isNum(s[k]))));
}

/**
 * セグメント推移（small multiple）の系列。直近 n 期（古い順）。
 * 全期間に出るセグメントを集め（名前は新しい期を優先）、値が全部欠損のものは除く。
 * sortBy: 'latest'（最新値の降順）／'name'
 */
export function segmentSeries(segData, metric, n = 5, sortBy = 'latest') {
  if (!segData) return null;
  const periods = segData.periods.slice(-n);
  const fys = periods.map((p) => p.fy);
  const names = new Map(); const noLabel = new Map(); const order = [];
  [...periods].reverse().forEach((p) => p.segments.forEach((s) => {
    if (!s.key) return;
    if (!names.has(s.key)) { names.set(s.key, s.name); noLabel.set(s.key, !!s.nl); order.push(s.key); }
  }));
  let series = order.map((key) => ({
    key, name: names.get(key), nl: noLabel.get(key),
    values: periods.map((p) => {
      const m = p.segments.find((s) => s.key === key);
      return m && isNum(m[metric]) ? m[metric] : null;
    }),
  })).filter((s) => s.values.some((v) => v !== null));
  const latest = (s) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null) return s.values[i]; return 0; };
  // 名前順は、ロケールに依存しないコード順（Python の基準実装と同じ。環境が違っても並びが変わらない）
  series = sortBy === 'name'
    ? series.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    : series.sort((a, b) => latest(b) - latest(a));
  return { fys, series };
}

// ── 財務の推移（会社ごとの時系列） ──────────────────────────────────────

// kind: bar=金額（棒）/ line=比率・1株指標（折れ線）。scale: 表示値 = 生の値 × scale
export const TREND_METRICS = {
  rev:              { label: '売上・収益',            unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  total_assets:     { label: '総資産',                unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  net_assets:       { label: '純資産',                unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  operating_income: { label: '営業利益',              unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  ordinary_income:  { label: '経常利益',              unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  net_income:       { label: '純利益（親会社帰属）',  unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  roe:              { label: 'ROE',                   unit: '%',    scale: 100,  digits: 1, kind: 'line' },
  equity_ratio:     { label: '自己資本比率',          unit: '%',    scale: 100,  digits: 1, kind: 'line' },
  eps:              { label: 'EPS',                   unit: '円',   scale: 1,    digits: 1, kind: 'line' },
  dps:              { label: 'DPS（配当）',           unit: '円',   scale: 1,    digits: 1, kind: 'line' },
  bps:              { label: 'BPS',                   unit: '円',   scale: 1,    digits: 0, kind: 'line' },
  per:              { label: 'PER（有報の値）',       unit: '倍',   scale: 1,    digits: 1, kind: 'line' },
  operating_cf:     { label: '営業CF',                unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  investing_cf:     { label: '投資CF',                unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  financing_cf:     { label: '財務CF',                unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
  fcf:              { label: 'FCF（営業CF＋投資CF）', unit: '億円', scale: 1e-8, digits: 0, kind: 'bar'  },
};
export const TREND_GROUPS = [
  { id: 'scale',    title: '規模',                 metrics: ['rev', 'total_assets', 'net_assets'] },
  { id: 'profit',   title: '利益',                 metrics: ['operating_income', 'ordinary_income', 'net_income'] },
  { id: 'quality',  title: '収益性・健全性',       metrics: ['roe', 'equity_ratio'] },
  { id: 'pershare', title: '1株あたり・株価指標',  metrics: ['eps', 'dps', 'bps', 'per'] },
  { id: 'cf',       title: 'キャッシュフロー',     metrics: ['operating_cf', 'investing_cf', 'financing_cf', 'fcf'] },
];
// 「売上」の呼び名は会社ごとに違う。売上高 → 経常収益（金融）→ 純収益（証券）の順で、最初に値があるもの
const REV_SOURCES = [['net_sales', '売上'], ['ordinary_revenue', '経常収益'], ['net_revenue', '純収益']];

/**
 * 1社の時系列。rows は新しい期から（data.byCompany の形）。n を指定すると、直近 n 期。
 * 戻り値: { fys:[古い期から], std:[会計基準], series:{指標キー:[値|null]}, revSrc:[売上の呼び名|null] }
 * 導出: rev（売上・収益）、fcf（営業CF＋投資CF。どちらかが欠ければ null）
 */
// ── 会社の比較（最新期どうしを並べる）
// better: 'high' は大きいほど良い（強調する）。null は良し悪しを決めない（規模・PER・CFなど）
export const COMPARE_ROWS = [
  { group: '規模', key: 'rev', label: '売上・収益', unit: '億円', scale: 1e-8, digits: 0, better: null },
  { group: '規模', key: 'total_assets', label: '総資産', unit: '億円', scale: 1e-8, digits: 0, better: null },
  { group: '規模', key: 'net_assets', label: '純資産', unit: '億円', scale: 1e-8, digits: 0, better: null },
  { group: '収益性', key: 'op_margin', label: '営業利益率', unit: '%', scale: 100, digits: 1, better: 'high' },
  { group: '収益性', key: 'net_margin', label: '純利益率', unit: '%', scale: 100, digits: 1, better: 'high' },
  { group: '収益性', key: 'roe', label: 'ROE', unit: '%', scale: 100, digits: 1, better: 'high' },
  { group: '成長', key: 'rev_growth', label: '売上の前期比', unit: '%', scale: 100, digits: 1, better: 'high' },
  { group: '安全性', key: 'equity_ratio', label: '自己資本比率', unit: '%', scale: 100, digits: 1, better: 'high' },
  { group: '株式', key: 'per', label: 'PER', unit: '倍', scale: 1, digits: 1, better: null },
  { group: '株式', key: 'eps', label: 'EPS', unit: '円', scale: 1, digits: 1, better: null },
  { group: '株式', key: 'dps', label: 'DPS（1株配当）', unit: '円', scale: 1, digits: 1, better: null },
  { group: '株式', key: 'bps', label: 'BPS', unit: '円', scale: 1, digits: 0, better: null },
  { group: 'キャッシュフロー', key: 'operating_cf', label: '営業CF', unit: '億円', scale: 1e-8, digits: 0, better: null },
  { group: 'キャッシュフロー', key: 'investing_cf', label: '投資CF', unit: '億円', scale: 1e-8, digits: 0, better: null },
  { group: 'キャッシュフロー', key: 'financing_cf', label: '財務CF', unit: '億円', scale: 1e-8, digits: 0, better: null },
  { group: 'キャッシュフロー', key: 'fcf', label: 'FCF（営業CF＋投資CF）', unit: '億円', scale: 1e-8, digits: 0, better: null },
];

/** 1社の最新期の値と、そこから計算する比率。rows は新しい期から。前期がなければ、前期比は null。 */
export function compareValues(rows) {
  const cur = rows[0]; const prev = rows[1];
  const num = (v) => (isNum(v) ? v : null);
  const src = REV_SOURCES.find(([k]) => isNum(cur[k]));
  const rev = src ? cur[src[0]] : null;
  const prevRev = src && prev && isNum(prev[src[0]]) ? prev[src[0]] : null;
  const ratio = (a, b) => (isNum(a) && isNum(b) && b > 0 ? a / b : null);
  const values = {
    rev,
    total_assets: num(cur.total_assets), net_assets: num(cur.net_assets),
    op_margin: ratio(cur.operating_income, rev), net_margin: ratio(cur.net_income, rev),
    roe: num(cur.roe), rev_growth: prevRev !== null && prevRev > 0 && rev !== null ? rev / prevRev - 1 : null,
    equity_ratio: num(cur.equity_ratio), per: num(cur.per), eps: num(cur.eps), dps: num(cur.dps), bps: num(cur.bps),
    operating_cf: num(cur.operating_cf), investing_cf: num(cur.investing_cf), financing_cf: num(cur.financing_cf),
    fcf: isNum(cur.operating_cf) && isNum(cur.investing_cf) ? cur.operating_cf + cur.investing_cf : null,
  };
  return { fy: cur.fy, std: cur.std, cons: cur.cons, pattern: cur.pattern || '', revSrc: src ? src[1] : null, values };
}

/** 最も良い値の位置（2社以上に値があるときだけ。同点は全員）。better が null なら空。 */
export function bestIndexes(values, better) {
  if (better !== 'high') return [];
  const nums = values.filter((v) => isNum(v));
  if (nums.length < 2) return [];
  const top = Math.max(...nums);
  return values.map((v, i) => (v === top ? i : -1)).filter((i) => i >= 0);
}

export function trendData(rows, n = null) {
  const asc = [...rows].reverse();
  const use = n ? asc.slice(-n) : asc;
  const num = (v) => (isNum(v) ? v : null);
  const series = {};
  Object.keys(TREND_METRICS).forEach((k) => {
    if (k === 'rev' || k === 'fcf') return;
    series[k] = use.map((r) => num(r[k]));
  });
  const revSrc = use.map((r) => { const s = REV_SOURCES.find(([k]) => isNum(r[k])); return s ? s[1] : null; });
  series.rev = use.map((r) => { const s = REV_SOURCES.find(([k]) => isNum(r[k])); return s ? r[s[0]] : null; });
  series.fcf = use.map((r) => (isNum(r.operating_cf) && isNum(r.investing_cf) ? r.operating_cf + r.investing_cf : null));
  return { fys: use.map((r) => r.fy), std: use.map((r) => r.std), series, revSrc };
}

/**
 * 最初に値がある期を 100 とした指数（比べるため）。指数 = 100 + (値 − 最初の値) ÷ |最初の値| × 100。
 * 最初の値が正なら 値 ÷ 最初の値 × 100 と同じ。負（赤字）でも、改善すれば 100 を上回る。最初の値が 0 や欠損のときは、すべて null。
 */
export function indexSeries(values) {
  const first = values.find((v) => isNum(v));
  if (!isNum(first) || first === 0) return values.map(() => null);
  return values.map((v) => (isNum(v) ? 100 + ((v - first) / Math.abs(first)) * 100 : null));
}

/** 値が1つでもあるか（グラフを出すかの判断）。 */
export const hasValues = (values) => values.some((v) => isNum(v));

/** 会計基準が途中で変わっていれば、その経緯の文字列（例: 「JP → IFRS（2021/03 から）」）。なければ null。 */
export function standardChange(fys, stds) {
  const parts = [];
  for (let i = 1; i < stds.length; i++) {
    if (stds[i] && stds[i - 1] && stds[i] !== stds[i - 1]) parts.push(`${stds[i - 1]} → ${stds[i]}（${fys[i].slice(0, 4)}/${fys[i].slice(5, 7)} から）`);
  }
  return parts.length ? parts.join('、') : null;
}

/** 金額（円）を「億円」「兆円」の文字列にする。 */
export function fmtAmount(yen) {
  const oku = yen / 1e8;
  if (Math.abs(oku) >= 10000) return `${(oku / 10000).toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}兆円`;
  return `${oku.toLocaleString('ja-JP', { maximumFractionDigits: 0 })}億円`;
}

/** 業種などのカテゴリ数に応じた、見分けやすい色（黄金角で色相をずらす）。 */
export function categoryPalette(n) {
  return Array.from({ length: n }, (_, i) => `hsl(${Math.round((i * 137.508) % 360)}, ${58 + (i % 3) * 8}%, ${46 + (i % 2) * 8}%)`);
}
