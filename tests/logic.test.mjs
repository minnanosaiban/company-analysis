// 静的サイト版のロジック（絞り込み・CFパターン・選択・検索）のテスト。
//   node tests/logic.test.mjs
// 期待値は、tests/expected.json（Python/pandas で、Streamlit 版と同じデータから別実装で計算したもの）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { buildData, periodRows } from '../docs/assets/lib/data.js';
import { applyFilters, sortRows } from '../docs/assets/lib/filters.js';
import { classifyCF } from '../docs/assets/lib/cf.js';
import { selectedCompanies, searchCompanies } from '../docs/assets/lib/selection.js';
import { parseRange } from '../docs/assets/lib/fields.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf-8'));
const data = buildData(read('../docs/data/meta.json'), read('../docs/data/companies.json'), read('../docs/data/financials.json'));
const expected = read('expected.json');

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${ok ? '' : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};
const P = (s) => new URLSearchParams(s);

// 会社数・期数
check('会社数', data.companies.length, expected.companies);
check('財務の行数（会社×期）', [...data.byCompany.values()].reduce((a, r) => a + r.length, 0), expected.rows);

// 最新期の絞り込み（件数）
const latest = periodRows(data, 0);
for (const [q, want] of Object.entries(expected.filters)) {
  check(`絞り込み ${q}`, applyFilters(latest, P(q)).length, want);
}

// CFパターンの分布（最新期）
const dist = {};
latest.forEach((r) => { if (r.pattern) dist[r.pattern] = (dist[r.pattern] || 0) + 1; });
check('CFパターンの分布（最新期）', Object.fromEntries(Object.entries(dist).sort()), expected.pattern_dist);

// 会社ごとのパターン（先頭30社）
const pat = Object.fromEntries(latest.sort((a, b) => a.e.localeCompare(b.e)).slice(0, 30).map((r) => [r.e, r.pattern]));
check('会社別パターン（先頭30社）', pat, expected.pattern_sample);

// 1期前の件数
check('1期前の会社数', periodRows(data, 1).length, expected.offset1_count);

// 単体
check('classifyCF(+,-,-)', classifyCF(1, -1, -1), '優良安定型');
check('classifyCF(0,-1,-1)', classifyCF(0, -1, -1), null);
check('classifyCF(null,1,1)', classifyCF(null, 1, 1), null);
check('parseRange("10..")', parseRange('10..'), [10, null]);
check('parseRange("..15")', parseRange('..15'), [null, 15]);
check('parseRange("5..15")', parseRange('5..15'), [5, 15]);
check('parseRange("abc")', parseRange('abc'), null);

// 並べ替え（欠損は最後）
const s = sortRows([{ roe: 0.1 }, { roe: null }, { roe: 0.3 }, { roe: 0.2 }], 'roe', 'asc').map((r) => r.roe);
check('sortRows 昇順（欠損は最後）', s, [0.1, 0.2, 0.3, null]);
const s2 = sortRows([{ roe: 0.1 }, { roe: null }, { roe: 0.3 }], 'roe', 'desc').map((r) => r.roe);
check('sortRows 降順（欠損は最後）', s2, [0.3, 0.1, null]);

// 選択
check('おすすめ=13社', selectedCompanies(P('m=preset'), data).list.length, 13);
check('全社=全会社', selectedCompanies(P(''), data).list.length, data.companies.length);
check('業種=卸売業', selectedCompanies(P('m=ind&ind=' + encodeURIComponent('卸売業')), data).list.length, expected.industry_wholesale);
check('会社を選ぶ(2社)', selectedCompanies(P('m=co&co=E02529,E02513'), data).list.map((c) => c.e), ['E02513', 'E02529']);

// 検索
check('検索「三菱商事」', searchCompanies(data, '三菱商事')[0]?.s, '8058');
check('検索「8058」(コード)', searchCompanies(data, '8058')[0]?.n, '三菱商事');
check('検索「ＮＴＴ」(全角)', searchCompanies(data, 'ntt')[0]?.s, '9432');
check('検索 空文字', searchCompanies(data, '').length, 0);

console.log(failed ? `\n${failed} 件失敗` : '\nすべて成功');
process.exit(failed ? 1 : 0);
