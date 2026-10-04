// スクリーニングの条件（URL のパラメータ）から、行を絞り込む。画面に依存しない。
import { FIELD, RANGE_KEYS, parseRange, splitCsv, isNum } from './fields.js?v=00492caca6';
import { PATTERN_NAMES } from './cf.js?v=00492caca6';

export const STANDARDS = ['JP', 'IFRS', 'US'];
export const STANDARD_LABEL = { JP: '日本基準', IFRS: 'IFRS', US: '米国基準' };
export const CF_SIGN_KEYS = [
  { param: 'cf_op',  field: 'operating_cf',  label: '営業CF' },
  { param: 'cf_inv', field: 'investing_cf',  label: '投資CF' },
  { param: 'cf_fin', field: 'financing_cf',  label: '財務CF' },
];

/**
 * rows: 対象の会社の行（1社1行）。params: URLSearchParams。
 * 条件: std（基準、カンマ区切り）, cons（1=連結のみ / 0=個別のみ）, 各指標の範囲（例 roe=10..）,
 *       cf_op / cf_inv / cf_fin（pos / neg）, pat（パターン名、カンマ区切り）
 */
export function applyFilters(rows, params) {
  const stds = splitCsv(params.get('std'));
  const cons = params.get('cons');
  const pats = splitCsv(params.get('pat'));
  const ranges = RANGE_KEYS.map((k) => [k, parseRange(params.get(k))]).filter(([, r]) => r);
  const signs = CF_SIGN_KEYS.map((s) => [s.field, params.get(s.param)]).filter(([, v]) => v === 'pos' || v === 'neg');

  return rows.filter((r) => {
    if (stds.length && !stds.includes(r.std)) return false;
    if (cons === '1' && !r.cons) return false;
    if (cons === '0' && r.cons) return false;
    for (const [k, [lo, hi]] of ranges) {
      const v = r[k];
      if (!isNum(v)) return false;           // 値がない会社は、範囲指定があれば除く
      const d = v * FIELD[k].scale;          // 入力は表示単位
      if (lo !== null && d < lo) return false;
      if (hi !== null && d > hi) return false;
    }
    for (const [field, want] of signs) {
      const v = r[field];
      if (!isNum(v) || v === 0) return false;
      if (want === 'pos' && v < 0) return false;
      if (want === 'neg' && v > 0) return false;
    }
    if (pats.length && !pats.includes(r.pattern)) return false;
    return true;
  });
}

/** 並べ替え。欠損は、昇順・降順にかかわらず、最後に置く。 */
export function sortRows(rows, key, dir = 'desc') {
  const sgn = dir === 'asc' ? 1 : -1;
  const val = (r) => (key === 'name' ? r.name : key === 'sec' ? r.sec : r[key]);
  return [...rows].sort((a, b) => {
    const x = val(a); const y = val(b);
    const xn = x === null || x === undefined || x === ''; const yn = y === null || y === undefined || y === '';
    if (xn && yn) return 0;
    if (xn) return 1;
    if (yn) return -1;
    if (typeof x === 'string') return sgn * x.localeCompare(y, 'ja');
    return sgn * (x - y);
  });
}

export const hasActiveFilters = (params) =>
  ['std', 'cons', 'pat', ...RANGE_KEYS, ...CF_SIGN_KEYS.map((s) => s.param)].some((k) => params.get(k));

export { PATTERN_NAMES };
