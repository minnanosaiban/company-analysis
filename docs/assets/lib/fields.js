// 財務指標の定義（表示名・単位・表示倍率）と、数値の整形。画面に依存しない。

// scale: 表示値 = 生の値 × scale（例: ROE 0.113 → 11.3%、売上 1.2e12 円 → 12,000 億円）
export const FIELDS = [
  { key: 'roe',          label: 'ROE',          unit: '%',   scale: 100,  digits: 1 },
  { key: 'per',          label: 'PER',          unit: '倍',  scale: 1,    digits: 1 },
  { key: 'equity_ratio', label: '自己資本比率', unit: '%',   scale: 100,  digits: 1 },
  { key: 'eps',          label: 'EPS',          unit: '円',  scale: 1,    digits: 1 },
  { key: 'dps',          label: 'DPS',          unit: '円',  scale: 1,    digits: 1 },
  { key: 'bps',          label: 'BPS',          unit: '円',  scale: 1,    digits: 0 },
  { key: 'net_sales',    label: '売上',         unit: '億円', scale: 1e-8, digits: 0 },
  { key: 'net_income',   label: '純利益',       unit: '億円', scale: 1e-8, digits: 0 },
  { key: 'total_assets', label: '総資産',       unit: '億円', scale: 1e-8, digits: 0 },
  { key: 'net_assets',   label: '純資産',       unit: '億円', scale: 1e-8, digits: 0 },
  { key: 'operating_cf', label: '営業CF',       unit: '億円', scale: 1e-8, digits: 0 },
  { key: 'investing_cf', label: '投資CF',       unit: '億円', scale: 1e-8, digits: 0 },
  { key: 'financing_cf', label: '財務CF',       unit: '億円', scale: 1e-8, digits: 0 },
];
export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

// スクリーニングで、数値の範囲を指定できる項目
export const RANGE_KEYS = ['roe', 'per', 'equity_ratio', 'eps', 'dps', 'bps', 'net_sales', 'net_income', 'total_assets', 'operating_cf'];

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 生の値を、表示用の文字列（単位なし）にする。欠損は「—」。 */
export function fmtValue(key, raw) {
  if (!isNum(raw)) return '—';
  const f = FIELD[key];
  if (!f) return String(raw);
  return (raw * f.scale).toLocaleString('ja-JP', { minimumFractionDigits: f.digits, maximumFractionDigits: f.digits });
}

/** 「10..」「..15」「5..15」を [min, max]（表示単位。無指定は null）にする。不正なら null。 */
export function parseRange(s) {
  if (!s || !s.includes('..')) return null;
  const [a, b] = s.split('..');
  const lo = a.trim() === '' ? null : Number(a);
  const hi = b.trim() === '' ? null : Number(b);
  if ((lo !== null && !Number.isFinite(lo)) || (hi !== null && !Number.isFinite(hi))) return null;
  if (lo === null && hi === null) return null;
  return [lo, hi];
}

export const splitCsv = (s) => (s ? s.split(',').map((x) => x.trim()).filter(Boolean) : []);
