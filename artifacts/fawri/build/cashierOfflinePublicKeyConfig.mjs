// Validate before Vite serializes public environment variables into client code.
// A configuration mistake must never ship private JWK material to the browser.
export function assertCashierOfflinePublicKeyConfig(raw = '{}') {
  const fail = () => { throw new Error('Invalid cashier offline public verification key configuration'); };
  let ring;
  try { ring = JSON.parse(raw || '{}'); } catch { return fail(); }
  if (!ring || typeof ring !== 'object' || Array.isArray(ring)) return fail();
  const coordinate = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  for (const [id, key] of Object.entries(ring)) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !key || typeof key !== 'object' ||
        key.kty !== 'EC' || key.crv !== 'P-256' || !coordinate(key.x) || !coordinate(key.y) ||
        key.d !== undefined || key.k !== undefined || key.p !== undefined || key.q !== undefined ||
        (key.alg !== undefined && key.alg !== 'ES256') ||
        (key.use !== undefined && key.use !== 'sig') ||
        (key.key_ops !== undefined && (!Array.isArray(key.key_ops) || key.key_ops.some(op => op !== 'verify')))) return fail();
  }
  return ring;
}
