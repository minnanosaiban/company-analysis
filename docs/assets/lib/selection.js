// 「対象の会社」の選び方（おすすめ／業種／会社／全社）。画面に依存しない部分。
import { splitCsv } from './fields.js?v=00492caca6';
import { groupRank } from './data.js?v=00492caca6';

export const MODES = [
  { id: 'preset', label: 'おすすめ：商社・石油（13社）' },
  { id: 'ind',    label: '業種から選ぶ' },
  { id: 'co',     label: '会社を選ぶ' },
  { id: 'all',    label: '全社' },
];

/** URL のパラメータから、対象の会社を決める。 */
export function selectedCompanies(params, data, defaultMode = 'all') {
  const mode = MODES.some((m) => m.id === params.get('m')) ? params.get('m') : defaultMode;
  let list;
  if (mode === 'preset') {
    list = data.companies.filter((c) => c.gr).sort((a, b) => groupRank(a.gr) - groupRank(b.gr) || a.s.localeCompare(b.s));
  } else if (mode === 'ind') {
    const inds = new Set(splitCsv(params.get('ind')));
    list = data.companies.filter((c) => inds.has(c.i));
  } else if (mode === 'co') {
    const cs = new Set(splitCsv(params.get('co')));
    list = data.companies.filter((c) => cs.has(c.e));
  } else {
    list = data.companies;
  }
  // おすすめは商社→石油の順を保つ。それ以外は証券コード順
  return { mode, list: mode === 'preset' ? list : [...list].sort((a, b) => a.s.localeCompare(b.s)) };
}

/** 検索語に合う会社（名前・コード・EDINETコードの部分一致）。全角英数は半角にそろえて比べる。 */
export function searchCompanies(data, q, limit = 12) {
  const norm = (s) => String(s).normalize('NFKC').toLowerCase();
  const nq = norm(q).trim();
  if (!nq) return [];
  const hit = data.companies.filter((c) => norm(c.n).includes(nq) || c.s.startsWith(nq) || norm(c.e) === nq);
  hit.sort((a, b) => (norm(a.n).startsWith(nq) ? 0 : 1) - (norm(b.n).startsWith(nq) ? 0 : 1) || a.s.localeCompare(b.s));
  return hit.slice(0, limit);
}
