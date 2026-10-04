// 図のデータ処理（Treemap・セグメント推移・外れ値の範囲）のテスト。
//   node tests/charts.test.mjs
// 期待値 tests/expected_charts.json は、Python の基準実装から作る（tests/make_expected_charts.py）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  portfolioItem, segmentSeries, clipBounds, markerSizes, availableMetrics, fmtAmount,
  trendData, indexSeries, hasValues, standardChange, compareValues, bestIndexes, TREEMAP_COLORS, readableText, contrastRatio, mergeChartOption,
} from '../docs/assets/lib/chartdata.js';
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

// 財務の推移（会社ごとの時系列）。浮動小数点は、相対 1e-6 までの誤差を許す（JSON の丸めのため）
const closeNum = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b)));
let tOk = 0;
for (const [k, want] of Object.entries(expected.trend)) {
  const [ed, nn] = k.split(':');
  const got = trendData(data.byCompany.get(ed), nn === 'null' || nn === 'None' ? null : Number(nn));
  const problems = [];
  if (JSON.stringify(got.fys) !== JSON.stringify(want.fys)) problems.push('fys');
  if (JSON.stringify(got.std) !== JSON.stringify(want.std)) problems.push('std');
  if (JSON.stringify(got.revSrc) !== JSON.stringify(want.revSrc)) problems.push('revSrc');
  for (const [m, vals] of Object.entries(want.series)) {
    const g = got.series[m];
    if (!g || g.length !== vals.length || !vals.every((v, i) => closeNum(g[i], v))) problems.push(m);
  }
  n++;
  if (problems.length) { failed++; console.log(`FAIL 推移 ${k}: ${problems.join(',')}`); } else tOk++;
}
console.log(`財務の推移: ${tOk}/${Object.keys(expected.trend).length} 件が一致`);

// 単体
check('indexSeries', indexSeries([null, 50, 100, 25]), [null, 100, 200, 50]);
check('indexSeries 最初が負（赤字）でも、改善すれば100を上回る', indexSeries([-10, -5, -20]), [100, 150, 0]);
check('indexSeries 最初が0', indexSeries([0, 5]), [null, null]);
check('hasValues', [hasValues([null, null]), hasValues([null, 0])], [false, true]);
check('standardChange', standardChange(['2020-03-31', '2021-03-31', '2022-03-31'], ['JP', 'JP', 'IFRS']), 'JP → IFRS（2022/03 から）');
check('standardChange なし', standardChange(['2020-03-31', '2021-03-31'], ['JP', 'JP']), null);
// 会社の比較
const cv = compareValues([{ fy: '2025-03-31', std: 'JP', cons: true, pattern: 'X', net_sales: 200, operating_income: 20, net_income: 10, operating_cf: 5, investing_cf: -8, roe: 0.1 }, { fy: '2024-03-31', net_sales: 100 }]);
check('compare 比率', [cv.values.rev, cv.values.op_margin, cv.values.net_margin, cv.values.rev_growth, cv.values.fcf, cv.values.per], [200, 0.1, 0.05, 1, -3, null]);
check('compare 前期なし', compareValues([{ fy: '2025-03-31', net_sales: 200 }]).values.rev_growth, null);
check('compare 前期の収益区分が違うと前期比なし', compareValues([{ fy: '2025-03-31', net_sales: 200 }, { fy: '2024-03-31', ordinary_revenue: 100 }]).values.rev_growth, null);
check('compare 金融は経常収益', compareValues([{ fy: '2025-03-31', ordinary_revenue: 50, operating_income: 5 }]).revSrc, '経常収益');
check('bestIndexes', [bestIndexes([1, 3, null, 3], 'high'), bestIndexes([5], 'high'), bestIndexes([1, 2], null)], [[1, 3], [], []]);
// Treemap のタイルの文字色: どのタイル色でも、文字とのコントラストが 4.5:1 以上
check('Treemap 文字色 全タイルで4.5:1以上', TREEMAP_COLORS.map((c) => contrastRatio(c, readableText(c)) >= 4.5), TREEMAP_COLORS.map(() => true));
check('readableText 薄い色は濃い文字・濃い色は白', [readableText('#fac858'), readableText('#5470c6'), readableText('#ffffff'), readableText('#000000')], ['#111111', '#ffffff', '#111111', '#ffffff']);
check('contrastRatio 白黒は21', Math.round(contrastRatio('#ffffff', '#000000')), 21);
// 図の設定の重ね方: ページが tooltip・legend の一部だけ指定しても、共通の色が残る
const baseOpt = { tooltip: { confine: true, backgroundColor: '#222', textStyle: { color: '#eee', fontSize: 12 } }, legend: { pageTextStyle: { color: '#aaa' }, pageIconColor: '#fff' }, animation: false };
const mo = mergeChartOption(baseOpt, { tooltip: { trigger: 'axis', formatter: 'f' }, legend: { type: 'scroll', top: 0 }, series: [] });
check('mergeChartOption tooltip', [mo.tooltip.trigger, mo.tooltip.backgroundColor, mo.tooltip.textStyle.color, mo.tooltip.confine], ['axis', '#222', '#eee', true]);
check('mergeChartOption legend', [mo.legend.type, mo.legend.pageTextStyle.color, mo.legend.pageIconColor], ['scroll', '#aaa', '#fff']);
const mo2 = mergeChartOption(baseOpt, { tooltip: { textStyle: { color: '#f00' } }, legend: { pageTextStyle: { color: '#0f0' } } });
check('mergeChartOption ページ側の指定が優先', [mo2.tooltip.textStyle.color, mo2.tooltip.textStyle.fontSize, mo2.legend.pageTextStyle.color], ['#f00', 12, '#0f0']);
check('mergeChartOption ページに legend がなければ、凡例を作らない', mergeChartOption(baseOpt, { series: [] }).legend, undefined);
check('markerSizes 一定', markerSizes([5, 5, 5]), [10, 10, 10]);
check('markerSizes 範囲', markerSizes([1, 2, 3], 6, 40), [6, 23, 40]);
check('markerSizes 欠損は中央値', markerSizes([1, null, 3], 6, 40)[1], 23);
check('fmtAmount 億円', fmtAmount(2.045e11), '2,045億円');
check('fmtAmount 兆円', fmtAmount(1.5e13), '15.0兆円');
check('availableMetrics', availableMetrics({ periods: [{ segments: [{ operating_income: 1 }, { assets: 2 }] }] }), ['operating_income', 'assets']);

console.log(failed ? `\n${failed}/${n} 件失敗` : `\nすべて成功（${n} 件）`);
process.exit(failed ? 1 : 0);
