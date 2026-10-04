// データの読み込みと、会社×期の表の組み立て。画面に依存しない（fetch の基準 URL だけ渡す）。
import { isNum } from './fields.js?v=00492caca6';
import { classifyCF } from './cf.js?v=00492caca6';

const GROUP_ORDER = { 商社: 0, 石油: 1 };

// 更新番号（tools/stamp_version.py が、この .js の URL に ?v= を付ける）を、データの URL にも引き継ぐ
const VERSION = new URL(import.meta.url).searchParams.get('v');
const withVersion = (url) => (VERSION ? `${url}?v=${VERSION}` : url);

export async function loadData(base = 'data/') {
  const get = async (name) => {
    const r = await fetch(withVersion(base + name));
    if (!r.ok) throw new Error(`${name} を読み込めませんでした（${r.status}）`);
    return r.json();
  };
  const [meta, companies, fin] = await Promise.all([get('meta.json'), get('companies.json'), get('financials.json')]);
  return buildData(meta, companies, fin, base);
}

/** 読み込み済みの JSON から、アプリが使う形を作る（テストでも使う）。 */
export function buildData(meta, companies, fin, base = 'data/') {
  const byE = new Map(companies.map((c) => [c.e, c]));
  const industries = [...new Set(companies.map((c) => c.i).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'));

  // 1社×1期の行（会社の情報＋財務）。会社ごとに新しい期から並べ、offset=0 を最新期とする
  const byCompany = new Map();
  fin.data.forEach((row) => {
    const o = {};
    fin.cols.forEach((c, i) => { o[c] = row[i]; });
    const c = byE.get(o.e);
    if (!c) return;
    const r = {
      ...o, name: c.n, sec: c.s, industry: c.i, cons: c.c, group: c.gr,
      std: o.a,
    };
    r.pattern = classifyCF(r.operating_cf, r.investing_cf, r.financing_cf);
    if (!byCompany.has(o.e)) byCompany.set(o.e, []);
    byCompany.get(o.e).push(r);
  });
  byCompany.forEach((rows) => {
    rows.sort((a, b) => (a.fy < b.fy ? 1 : a.fy > b.fy ? -1 : 0));
    rows.forEach((r, i) => { r.offset = i; });
  });

  return { meta, companies, byE, industries, byCompany, base, segCache: new Map() };
}

/** 全社の「offset 期前」の行（1社1行）。 */
export function periodRows(data, offset = 0) {
  const out = [];
  data.byCompany.forEach((rows) => { if (rows[offset]) out.push(rows[offset]); });
  return out;
}

/** 会社ごとのセグメント（古い期から）。選んだ会社の分だけ読み込む。なければ null。 */
export async function loadSegments(data, edinet) {
  if (data.segCache.has(edinet)) return data.segCache.get(edinet);
  let res = null;
  const c = data.byE.get(edinet);
  if (c && c.g) {
    try {
      const r = await fetch(withVersion(`${data.base}segments/${edinet}.json`));
      if (r.ok) res = await r.json();
    } catch { /* 読み込めない場合は null のまま */ }
  }
  data.segCache.set(edinet, res);
  return res;
}

export const groupRank = (g) => (g in GROUP_ORDER ? GROUP_ORDER[g] : 9);
export { isNum };
