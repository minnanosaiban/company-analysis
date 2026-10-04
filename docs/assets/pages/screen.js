// 企業を探す（スクリーニング）: 条件で絞り込み、結果を表で見る。
import { FIELD, RANGE_KEYS, esc, fmtValue, isNum, parseRange, splitCsv } from '../lib/fields.js?v=0063ac2e1d';
import { periodRows } from '../lib/data.js?v=0063ac2e1d';
import { applyFilters, sortRows, hasActiveFilters, STANDARDS, STANDARD_LABEL, CF_SIGN_KEYS } from '../lib/filters.js?v=0063ac2e1d';
import { PATTERNS, PATTERN_COLOR } from '../lib/cf.js?v=0063ac2e1d';
import { renderSelector } from '../lib/selector_ui.js?v=0063ac2e1d';

const PAGE_SIZE = 50;
const PERIOD_LABELS = ['最新期', '1期前', '2期前', '3期前', '4期前'];
// 結果の表の列（会社名・業種・基準・FY は固定）
const COLUMNS = ['roe', 'per', 'equity_ratio', 'net_sales', 'net_income', 'total_assets', 'operating_cf'];

const median = (arr) => {
  const a = arr.filter(isNum).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export async function render(root, ctx) {
  const { data, params } = ctx;
  const offset = Math.min(4, Math.max(0, parseInt(params.get('p') || '0', 10) || 0));

  root.innerHTML = `
    <h1 class="page-title">企業を探す</h1>
    <p class="page-lead">東証の主要企業（約500社）の有価証券報告書をもとに、業種や財務指標の条件で、会社を絞り込めます。
      結果の URL をそのまま共有できます。</p>
    <div id="selector"></div>
    <details class="panel" id="cond" open>
      <summary>条件を指定する</summary>
      <div class="panel-body" id="cond-body"></div>
    </details>
    <div id="results"></div>`;

  // ── 対象の会社
  const sel = renderSelector(root.querySelector('#selector'), ctx, { defaultMode: 'all' });
  const targetSet = new Set(sel.list.map((c) => c.e));

  // ── 条件の欄
  renderConditions(root.querySelector('#cond-body'), ctx, offset);

  // ── 結果
  const rows = periodRows(data, offset).filter((r) => targetSet.has(r.e));
  const filtered = applyFilters(rows, params);
  renderResults(root.querySelector('#results'), ctx, filtered, rows.length, offset);
}

function renderConditions(el, ctx, offset) {
  const { params } = ctx;
  const stds = new Set(splitCsv(params.get('std')));
  const pats = new Set(splitCsv(params.get('pat')));

  const rangeInputs = RANGE_KEYS.map((k) => {
    const f = FIELD[k];
    const r = parseRange(params.get(k));
    return `<div>
      <label>${esc(f.label)}（${esc(f.unit)}）</label>
      <div class="row">
        <input type="number" step="any" inputmode="decimal" data-range="${k}" data-side="min" value="${r && r[0] !== null ? r[0] : ''}" placeholder="下限" aria-label="${esc(f.label)} 下限">
        <span class="muted">〜</span>
        <input type="number" step="any" inputmode="decimal" data-range="${k}" data-side="max" value="${r && r[1] !== null ? r[1] : ''}" placeholder="上限" aria-label="${esc(f.label)} 上限">
      </div>
    </div>`;
  }).join('');

  const signSel = CF_SIGN_KEYS.map((s) => `<div>
      <label>${esc(s.label)}の符号</label>
      <select data-sign="${s.param}">
        <option value="">指定なし</option>
        <option value="pos" ${params.get(s.param) === 'pos' ? 'selected' : ''}>プラス（＋）</option>
        <option value="neg" ${params.get(s.param) === 'neg' ? 'selected' : ''}>マイナス（－）</option>
      </select>
    </div>`).join('');

  el.innerHTML = `
    <div class="grid">
      <div>
        <label>会計基準</label>
        ${STANDARDS.map((s) => `<label class="check"><input type="checkbox" data-std="${s}" ${stds.has(s) ? 'checked' : ''}>${STANDARD_LABEL[s]}</label>`).join('')}
      </div>
      <div>
        <label for="f-cons">連結・個別</label>
        <select id="f-cons">
          <option value="">すべて</option>
          <option value="1" ${params.get('cons') === '1' ? 'selected' : ''}>連結のみ</option>
          <option value="0" ${params.get('cons') === '0' ? 'selected' : ''}>個別財務諸表のみ</option>
        </select>
      </div>
      <div>
        <label for="f-period">期</label>
        <select id="f-period">${PERIOD_LABELS.map((l, i) => `<option value="${i}" ${i === offset ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
    </div>
    <h3 class="bar-title" style="margin-top:1.6rem">数値の範囲</h3>
    <div class="grid">${rangeInputs}</div>
    <h3 class="bar-title" style="margin-top:1.6rem">キャッシュフロー</h3>
    <div class="grid">${signSel}</div>
    <div style="margin-top:.9rem">
      <label>CFパターン（営業・投資・財務CFの符号の組み合わせ）</label>
      ${PATTERNS.map((p) => `<label class="check" title="${esc(p.desc)}"><input type="checkbox" data-pat="${esc(p.name)}" ${pats.has(p.name) ? 'checked' : ''}><span class="dot" style="background:${p.color}"></span>${esc(p.name)}</label>`).join('')}
    </div>
    <p style="margin-top:1rem"><button class="btn" id="f-reset" type="button" ${hasActiveFilters(params) ? '' : 'disabled'}>条件をクリア</button></p>`;

  // ── イベント
  el.querySelectorAll('[data-std]').forEach((cb) => cb.addEventListener('change', () => {
    const s = new Set(splitCsv(ctx.params.get('std')));
    if (cb.checked) s.add(cb.dataset.std); else s.delete(cb.dataset.std);
    ctx.update({ std: STANDARDS.filter((x) => s.has(x)).join(','), pg: '' });
  }));
  el.querySelector('#f-cons').addEventListener('change', (e) => ctx.update({ cons: e.target.value, pg: '' }));
  el.querySelector('#f-period').addEventListener('change', (e) => ctx.update({ p: e.target.value === '0' ? '' : e.target.value, pg: '' }));
  el.querySelectorAll('[data-range]').forEach((inp) => inp.addEventListener('change', () => {
    const k = inp.dataset.range;
    const lo = el.querySelector(`[data-range="${k}"][data-side="min"]`).value.trim();
    const hi = el.querySelector(`[data-range="${k}"][data-side="max"]`).value.trim();
    ctx.update({ [k]: lo === '' && hi === '' ? '' : `${lo}..${hi}`, pg: '' });
  }));
  el.querySelectorAll('[data-sign]').forEach((s) => s.addEventListener('change', () => ctx.update({ [s.dataset.sign]: s.value, pg: '' })));
  el.querySelectorAll('[data-pat]').forEach((cb) => cb.addEventListener('change', () => {
    const s = new Set(splitCsv(ctx.params.get('pat')));
    if (cb.checked) s.add(cb.dataset.pat); else s.delete(cb.dataset.pat);
    ctx.update({ pat: PATTERNS.map((p) => p.name).filter((n) => s.has(n)).join(','), pg: '' });
  }));
  el.querySelector('#f-reset').addEventListener('click', () => {
    const patch = { std: '', cons: '', pat: '', pg: '', p: '' };
    RANGE_KEYS.forEach((k) => { patch[k] = ''; });
    CF_SIGN_KEYS.forEach((s) => { patch[s.param] = ''; });
    ctx.update(patch);
  });
}

function renderResults(el, ctx, filtered, targetCount, offset) {
  const { params } = ctx;
  const sortKey = params.get('sort') || 'sec';
  const dir = params.get('dir') || (sortKey === 'sec' || sortKey === 'name' || sortKey === 'industry' ? 'asc' : 'desc');
  const sorted = sortRows(filtered, sortKey, dir);
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pg = Math.min(pages, Math.max(1, parseInt(params.get('pg') || '1', 10) || 1));
  const slice = sorted.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);

  const mRoe = median(filtered.map((r) => r.roe));
  const mPer = median(filtered.map((r) => r.per));
  const arrow = (key) => (sortKey === key ? `<span class="arrow">${dir === 'asc' ? '▲' : '▼'}</span>` : '');
  const th = (key, label, cls = '') => `<th class="${cls}" data-sort="${key}" scope="col">${esc(label)}${arrow(key)}</th>`;

  const head = `<tr>
    ${th('name', '会社', 'l sticky-col')}${th('industry', '業種', 'l')}${th('std', '基準', 'l')}${th('fy', 'FY', 'l')}
    ${COLUMNS.map((k) => th(k, `${FIELD[k].label}（${FIELD[k].unit}）`)).join('')}${th('pattern', 'CFパターン', 'l')}
  </tr>`;

  const body = slice.map((r) => {
    const cell = (k) => {
      const v = r[k];
      return `<td class="${isNum(v) && v < 0 ? 'neg' : ''}">${fmtValue(k, v)}</td>`;
    };
    const pat = r.pattern
      ? `<span class="dot" style="background:${PATTERN_COLOR[r.pattern]}"></span> ${esc(r.pattern)}`
      : '<span class="muted">—</span>';
    return `<tr>
      <td class="l name sticky-col">${esc(r.name)}<span class="sec">${esc(r.sec)}</span>${r.cons ? '' : ' <span class="pill" title="連結財務諸表を作成しない会社">個別</span>'}</td>
      <td class="l">${esc(r.industry)}</td><td class="l">${esc(r.std)}</td><td class="l">${esc((r.fy || '').slice(0, 7))}</td>
      ${COLUMNS.map(cell).join('')}<td class="l">${pat}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="summary">
      <span><span class="num">${filtered.length.toLocaleString()}</span> 社が該当
        <span class="muted small">（対象 ${targetCount.toLocaleString()}社中・${PERIOD_LABELS[offset]}）</span></span>
      ${isNum(mRoe) ? `<span class="muted small">ROE 中央値 ${fmtValue('roe', mRoe)}%</span>` : ''}
      ${isNum(mPer) ? `<span class="muted small">PER 中央値 ${fmtValue('per', mPer)}倍</span>` : ''}
      <span style="flex:1"></span>
      ${filtered.length ? `<span class="muted small">この結果を図で見る：</span>
        <a class="btn" href="${ctx.link('valuation', {}, { withFilters: true })}">散布図で見る →</a>
        <a class="btn" href="${ctx.link('cashflow', {}, { withFilters: true })}">CFパターンで見る →</a>
        <a class="btn" href="${ctx.link('portfolio', {}, { withFilters: true })}">セグメント構成で見る →</a>
        <a class="btn" href="${ctx.link('compare', { cc: sorted.slice(0, 5).map((r) => r.e).join(',') })}">${sorted.length > 5 ? '先頭の5社' : '表示中の会社'}を比べる →</a>` : ''}
      <button class="btn" id="csv" type="button" ${filtered.length ? '' : 'disabled'}>この結果を CSV で保存</button>
    </div>
    ${filtered.length ? `
      <div class="table-wrap"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>
      <div class="pager">
        <button class="btn" data-pg="${pg - 1}" ${pg <= 1 ? 'disabled' : ''}>← 前へ</button>
        <span class="muted small">${((pg - 1) * PAGE_SIZE + 1).toLocaleString()}〜${Math.min(pg * PAGE_SIZE, sorted.length).toLocaleString()}件 ／ ${sorted.length.toLocaleString()}件（${pg}/${pages}ページ）</span>
        <button class="btn" data-pg="${pg + 1}" ${pg >= pages ? 'disabled' : ''}>次へ →</button>
      </div>
      <p class="muted small">「売上」は、売上高・売上収益・営業収益のいずれかです。売上を持たない業種（銀行・保険・証券など）では空欄です。「個別」は、連結財務諸表を作らない会社で、連結の会社とは基準が異なります。
        見出しをクリックすると並べ替えられます。</p>`
      : '<div class="empty">条件に合う会社がありません。数値の範囲をゆるめるか、上の「条件をクリア」で、最初からやり直してください。</div>'}`;

  el.querySelectorAll('[data-sort]').forEach((h) => h.addEventListener('click', () => {
    const k = h.dataset.sort;
    const textual = ['name', 'industry', 'std', 'fy', 'pattern'].includes(k);
    const next = sortKey === k ? (dir === 'asc' ? 'desc' : 'asc') : (textual ? 'asc' : 'desc');
    ctx.update({ sort: k, dir: next, pg: '' });
  }));
  el.querySelectorAll('[data-pg]').forEach((b) => b.addEventListener('click', () => ctx.update({ pg: b.dataset.pg === '1' ? '' : b.dataset.pg })));
  const csvBtn = el.querySelector('#csv');
  if (csvBtn) csvBtn.addEventListener('click', () => downloadCsv(sorted, offset));
}

function downloadCsv(rows, offset) {
  const head = ['証券コード', '会社名', '業種', '会計基準', '連結', 'FY', ...COLUMNS.map((k) => `${FIELD[k].label}(${FIELD[k].unit})`), 'CFパターン'];
  const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [head.map(q).join(',')];
  rows.forEach((r) => {
    lines.push([
      q(r.sec), q(r.name), q(r.industry), q(r.std), r.cons ? '連結' : '個別', q(r.fy),
      ...COLUMNS.map((k) => (isNum(r[k]) ? (r[k] * FIELD[k].scale).toFixed(FIELD[k].digits) : '')),
      q(r.pattern || ''),
    ].join(','));
  });
  lines.push('', q('出典: EDINET閲覧（提出）サイト、公共データ利用規約（第1.0版）。minnanosaiban が加工。'));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `companies_${PERIOD_LABELS[offset]}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
