import { createHmac, timingSafeEqual } from 'node:crypto';

const TEST_USERS = [
  {
    id: 'student-001',
    username: 'hskstudent',
    password: 'Hsk@2026',
    displayName: '林晓语',
    role: 'student',
  },
  {
    id: 'teacher-001',
    username: 'hskteacher',
    password: 'Teacher@2026',
    displayName: '周老师',
    role: 'teacher',
  },
];

export function authenticate(username, password) {
  const normalizedUsername = String(username ?? '').trim().toLowerCase();
  const user = TEST_USERS.find((candidate) => (
    candidate.username === normalizedUsername && candidate.password === String(password ?? '')
  ));
  if (!user) return null;
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

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

export function getTestAccountSummary() {
  return TEST_USERS.map(({ password, ...user }) => ({ ...user, password }));
}
