// ハッシュ（#/valuation?x=roe）の読み書き。サーバー側の設定なしで、直接リンクが効く。

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const i = raw.indexOf('?');
  const path = i < 0 ? raw : raw.slice(0, i);
  const params = new URLSearchParams(i < 0 ? '' : raw.slice(i + 1));
  return { path, params };
}

export function buildHash(path, params) {
  const qs = params.toString();
  return '#/' + path + (qs ? '?' + qs : '');
}

/** params に patch（null や空文字は削除）を当てた新しい URLSearchParams。 */
export function patched(params, patch) {
  const p = new URLSearchParams(params);
  Object.entries(patch).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') p.delete(k);
    else p.set(k, String(v));
  });
  return p;
}
