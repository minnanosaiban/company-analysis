// CFパターン分類（営業CF・投資CF・財務CF の符号で、経営フェーズを8パターンに分ける）。
// Streamlit 版（views/03_cf_pattern.py）の PATTERN_TABLE と同じ定義。変えるときは両方そろえる。

export const PATTERNS = [
  { key: '1,-1,-1',  name: '優良安定型', desc: '営業＋・投資拡大・借入返済。最も健全な姿',           color: '#2ca02c' },
  { key: '1,-1,1',   name: '積極成長型', desc: '営業＋・投資拡大・借入増。攻めの成長フェーズ',       color: '#1f77b4' },
  { key: '1,1,-1',   name: 'リストラ型', desc: '営業＋・資産売却・借入返済。事業縮小／資産整理',     color: '#ff7f0e' },
  { key: '1,1,1',    name: '資金蓄積型', desc: '営業＋・売却・借入とも増。流動性確保フェーズ',       color: '#8c564b' },
  { key: '-1,-1,1',  name: '成長投資型', desc: '営業赤・投資拡大・借入で凌ぐ。創業期/赤字成長',     color: '#9467bd' },
  { key: '-1,1,-1',  name: '再建型',     desc: '営業赤・資産売却で借入返済。再建途上',               color: '#bcbd22' },
  { key: '-1,1,1',   name: '危機型',     desc: '営業赤・売却＋借入で資金繰り。流動性危機',           color: '#e377c2' },
  { key: '-1,-1,-1', name: '末期型',     desc: '全マイナス。事業継続性に黄信号',                     color: '#d62728' },
];
export const PATTERN_BY_KEY = Object.fromEntries(PATTERNS.map((p) => [p.key, p]));
export const PATTERN_NAMES = PATTERNS.map((p) => p.name);
export const PATTERN_COLOR = Object.fromEntries(PATTERNS.map((p) => [p.name, p.color]));

const sign = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.sign(v) : null);

/** パターン名を返す。値の欠損、または 0 を含むときは null。 */
export function classifyCF(op, inv, fin) {
  const s = [sign(op), sign(inv), sign(fin)];
  if (s.some((x) => x === null || x === 0)) return null;
  const p = PATTERN_BY_KEY[s.join(',')];
  return p ? p.name : null;
}
