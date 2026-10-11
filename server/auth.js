import { createHmac, timingSafeEqual } from 'node:crypto';

function sign(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

export function issueToken(user, secret, ttlMs = 12 * 60 * 60 * 1000) {
  const payload = Buffer.from(JSON.stringify({
    sub: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    exp: Date.now() + ttlMs,
  })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token, secret) {
  try {
    const [payload, signature, extra] = String(token ?? '').split('.');
    if (!payload || !signature || extra) return null;
    const expected = Buffer.from(sign(payload, secret));
    const received = Buffer.from(signature);
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
