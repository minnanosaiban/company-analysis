// 図に渡すデータの組み立て（画面・ECharts に依存しない。テストできる部分）。
// Streamlit 版（lib/portfolio_helper.py・views/04_segment_trend.py）と同じ計算にそろえる。
import { isNum } from './fields.js';

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
  // 名前順は、ロケールに依存しないコード順（Streamlit 版と同じ。環境が違っても並びが変わらない）
  series = sortBy === 'name'
    ? series.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    : series.sort((a, b) => latest(b) - latest(a));
  return { fys, series };
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
