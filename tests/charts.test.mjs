// 図のデータ処理（Treemap・セグメント推移・外れ値の範囲）のテスト。
//   node tests/charts.test.mjs
// 期待値 tests/expected_charts.json は、Python の基準実装から作る（tests/make_expected_charts.py）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { portfolioItem, segmentSeries, clipBounds, markerSizes, availableMetrics, fmtAmount } from '../docs/assets/lib/chartdata.js';
import { periodRows, buildData } from '../docs/assets/lib/data.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => JSON.parse(readFileSync(path.join(here, p), 'utf-8'));
const expected = read('expected_charts.json');

let failed = 0; let n = 0;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const check = (name, got, want) => {
  n++;
  const ok = same(got, want);
  if (!ok) { failed++; console.log(`FAIL ${name}\n  got =${JSON.stringify(got).slice(0, 300)}\n  want=${JSON.stringify(want).slice(0, 300)}`); }
  return ok;
};

// Treemap
let pOk = 0;
for (const [ed, cases] of Object.entries(expected.portfolio)) {
  const seg = read(`../docs/data/segments/${ed}.json`);
  for (const [k, want] of Object.entries(cases)) {
    const [offset, pref] = k.split(':');
    const got = portfolioItem(seg, Number(offset), pref === 'None' ? null : pref);
    const g = got && { fy: got.fy, metric: got.metric, rows: got.rows.map((r) => [r.name, r.value]), negatives: got.negatives.map((r) => [r.name, r.value]) };
    if (check(`Treemap ${ed} ${k}`, g, want)) pOk++;
  }
}
console.log(`Treemap: ${pOk}/${Object.values(expected.portfolio).reduce((a, c) => a + Object.keys(c).length, 0)} 件が一致`);

// セグメント推移
let sOk = 0;
for (const [k, want] of Object.entries(expected.segment_series)) {
  const [ed, metric, nn, sortBy] = k.split(':');
  const seg = read(`../docs/data/segments/${ed}.json`);
  const got = segmentSeries(seg, metric, Number(nn), sortBy);
  const g = { fys: got.fys, series: got.series.map((s) => [s.name, s.values]) };
  if (check(`セグメント推移 ${k}`, g, want)) sOk++;
}
console.log(`セグメント推移: ${sOk}/${Object.keys(expected.segment_series).length} 件が一致`);

// 外れ値の範囲（散布図）
const data = buildData(read('../docs/data/meta.json'), read('../docs/data/companies.json'), read('../docs/data/financials.json'));
const latest = periodRows(data, 0);
const scale = { roe: 100, per: 1, equity_ratio: 100, net_sales: 1e-8 };
for (const [col, want] of Object.entries(expected.clip)) {
  const got = clipBounds(latest.map((r) => (typeof r[col] === 'number' ? r[col] * scale[col] : null)));
  const close = got && got.every((v, i) => Math.abs(v - want[i]) < 1e-6 * Math.max(1, Math.abs(want[i])));
  n++; if (!close) { failed++; console.log(`FAIL 範囲 ${col}`, got, want); } else console.log(`OK   外れ値の範囲 ${col}: [${got.map((v) => v.toFixed(2))}]`);
}

// 単体
check('markerSizes 一定', markerSizes([5, 5, 5]), [10, 10, 10]);
check('markerSizes 範囲', markerSizes([1, 2, 3], 6, 40), [6, 23, 40]);
check('markerSizes 欠損は中央値', markerSizes([1, null, 3], 6, 40)[1], 23);
check('fmtAmount 億円', fmtAmount(2.045e11), '2,045億円');
check('fmtAmount 兆円', fmtAmount(1.5e13), '15.0兆円');
check('availableMetrics', availableMetrics({ periods: [{ segments: [{ operating_income: 1 }, { assets: 2 }] }] }), ['operating_income', 'assets']);

console.log(failed ? `\n${failed}/${n} 件失敗` : `\nすべて成功（${n} 件）`);
process.exit(failed ? 1 : 0);
