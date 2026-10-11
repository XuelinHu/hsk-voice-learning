import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash } from 'node:crypto';

import pg from 'pg';

const issuer = (process.env.OIDC_ISSUER || 'https://192.168.1.9:8042/realms/front').replace(/\/$/, '');
const keycloak = issuer.replace(/\/realms\/[^/]+$/, '');
const api = (process.env.HSK_API_URL || 'https://192.168.1.9:8040').replace(/\/$/, '');
const clientId = process.env.OIDC_TEST_CLIENT_ID || 'hsk-dialogue-android';
const redirectUri = process.env.OIDC_TEST_REDIRECT_URI || 'hskdialoguestudio:/oauth2redirect';
const username = `oidc-smoke-${randomBytes(5).toString('hex')}`;
const password = `Smoke-${randomBytes(5).toString('hex')}9`;
const state = randomBytes(24).toString('base64url');
const nonce = randomBytes(24).toString('base64url');
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const { Pool } = pg;
const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const cookies = new Map();
function addCookies(response) {
  for (const value of response.headers.getSetCookie()) {
    const [pair] = value.split(';', 1);
    const splitAt = pair.indexOf('=');
    if (splitAt > 0) cookies.set(pair.slice(0, splitAt), pair.slice(splitAt + 1));
  }
}

function cookieHeader() {
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function getFollowingRedirects(url, limit = 8) {
  let current = url;
  for (let index = 0; index < limit; index += 1) {
    const response = await fetch(current, {
      redirect: 'manual',
      headers: cookies.size ? { cookie: cookieHeader() } : {},
    });
    addCookies(response);
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    if (!location) throw new Error('Identity provider returned an empty redirect');
    current = new URL(location, current).toString();
  }
  throw new Error('Identity provider redirect limit exceeded');
}

async function adminToken() {
  const form = new URLSearchParams({
    grant_type: 'password',
    client_id: 'admin-cli',
    username: process.env.KC_BOOTSTRAP_ADMIN_USERNAME || '',
    password: process.env.KC_BOOTSTRAP_ADMIN_PASSWORD || '',
  });
  const response = await fetch(`${keycloak}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
  });
  if (!response.ok) throw new Error('Could not authenticate the Keycloak admin API');
  return (await response.json()).access_token;
}

let idpUserId;
let appUserId;
let adminAccessToken;
let testUserCreated = false;
try {
  assert.ok(process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME,
    'HSK database environment is required');
  assert.ok(process.env.KC_BOOTSTRAP_ADMIN_USERNAME && process.env.KC_BOOTSTRAP_ADMIN_PASSWORD,
    'Keycloak bootstrap admin environment is required');

  adminAccessToken = await adminToken();
  const adminHeaders = {
    authorization: `Bearer ${adminAccessToken}`,
    'content-type': 'application/json',
  };
  const createResponse = await fetch(`${keycloak}/admin/realms/front/users`, {
    method: 'POST',
    headers: adminHeaders,
    body: JSON.stringify({
      username,
      email: `${username}@example.invalid`,
      enabled: true,
      emailVerified: true,
      firstName: 'OIDC',
      lastName: 'Smoke Test',
      credentials: [{ type: 'password', value: password, temporary: false }],
    }),
  });
  if (createResponse.status !== 201) throw new Error('Could not create the temporary Keycloak test user');
  testUserCreated = true;
  const userListResponse = await fetch(`${keycloak}/admin/realms/front/users?username=${encodeURIComponent(username)}&exact=true`, {
    headers: adminHeaders,
  });
  const foundUsers = await userListResponse.json();
  idpUserId = foundUsers.find((user) => user.username === username)?.id;
  assert.ok(idpUserId, 'Temporary Keycloak test user was not found');

  const authorizationUrl = new URL(`${issuer}/protocol/openid-connect/auth`);
  authorizationUrl.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  const loginPage = await getFollowingRedirects(authorizationUrl);
  const loginHtml = await loginPage.text();
  if (loginPage.status !== 200) {
    const message = loginHtml
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 360);
    throw new Error(`Keycloak authorization page failed (HTTP ${loginPage.status}): ${message}`);
  }
  const formTag = loginHtml.match(/<form\b[^>]*id="kc-form-login"[^>]*>/i)?.[0];
  const actionRaw = formTag?.match(/\baction="([^"]+)"/i)?.[1];
  assert.ok(actionRaw, 'Keycloak login form action was not found');
  const action = actionRaw
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'");
  const loginResponse = await fetch(new URL(action, loginPage.url), {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie: cookieHeader(),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ username, password, credentialId: '' }),
  });
  addCookies(loginResponse);
  const callback = loginResponse.headers.get('location');
  assert.ok(callback, 'Keycloak did not redirect after test-user login');
  const callbackUrl = new URL(callback);
  if (callbackUrl.protocol !== new URL(redirectUri).protocol) {
    const followUp = await getFollowingRedirects(callbackUrl);
    const page = await followUp.text();
    const message = page
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 360);
    throw new Error(`Keycloak login stopped at ${callbackUrl.host}${callbackUrl.pathname} (HTTP ${followUp.status}): ${message}`);
  }
  assert.equal(callbackUrl.searchParams.get('state'), state);
  const code = callbackUrl.searchParams.get('code');
  assert.ok(code, 'Keycloak authorization code was missing');

  const tokenResponse = await fetch(`${issuer}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      redirect_uri: redirectUri,
      code,
      code_verifier: verifier,
    }),
  });
  assert.equal(tokenResponse.status, 200, 'Keycloak code exchange failed');
  const accessToken = (await tokenResponse.json()).access_token;
  assert.ok(accessToken, 'Keycloak did not return an access token');

  const loginResponseFromApi = await fetch(`${api}/api/auth/oidc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessToken, appId: 'com.hskvoice.hsk_dialogue_studio' }),
  });
  assert.equal(loginResponseFromApi.status, 200, 'HSK rejected the valid Keycloak access token');
  const session = await loginResponseFromApi.json();
  assert.equal(session.user.username, username);
  assert.equal(session.user.role, 'student');
  appUserId = session.user.id;

  const chatResponse = await fetch(`${api}/api/chat`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      level: 3,
      scenario: '点餐',
      appId: 'com.hskvoice.hsk_dialogue_studio',
      messages: [{ role: 'user', content: '我想点一碗面。' }],
    }),
  });
  assert.equal(chatResponse.status, 200, 'HSK text conversation failed');
  const chat = await chatResponse.json();
  assert.ok(chat.reply?.trim());
  assert.ok(chat.conversationId);

  const historyResponse = await fetch(
    `${api}/api/history/latest?appId=com.hskvoice.hsk_dialogue_studio`,
    { headers: { authorization: `Bearer ${session.token}` } },
  );
  assert.equal(historyResponse.status, 200, 'HSK conversation history failed');
  const history = await historyResponse.json();
  assert.equal(history.conversationId, chat.conversationId);
  assert.ok(history.messages.some((message) => message.content === '我想点一碗面。'));
  console.log('OIDC live smoke passed: auth code + PKCE, HSK login, text chat, and persisted history.');
} finally {
  try {
    await pool.query('DELETE FROM login_events WHERE attempted_username = $1', [username]);
    await pool.query('DELETE FROM app_users WHERE username = $1', [username]);
    if (testUserCreated && adminAccessToken) {
      if (!idpUserId) {
        const response = await fetch(`${keycloak}/admin/realms/front/users?username=${encodeURIComponent(username)}&exact=true`, {
          headers: { authorization: `Bearer ${adminAccessToken}` },
        });
        idpUserId = (await response.json()).find((user) => user.username === username)?.id;
      }
      if (idpUserId) {
        await fetch(`${keycloak}/admin/realms/front/users/${idpUserId}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${adminAccessToken}` },
        });
      }
    }
  } finally {
    await pool.end();
  }
}
