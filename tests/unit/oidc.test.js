import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

import { createOidcVerifier } from '../../server/oidc.js';

test('OIDC verifier checks issuer, signature, and native client identity', async () => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = await exportJWK(publicKey);
  jwk.kid = 'test-key';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const issuerServer = createServer((request, response) => {
    if (request.url !== '/realms/test/protocol/openid-connect/certs') {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise((resolve) => issuerServer.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${issuerServer.address().port}/realms/test`;
  const verifier = createOidcVerifier({ issuer, clientIds: ['hsk-app'] });
  const token = (claims) => new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(claims.iss || issuer)
    .setSubject('subject-1')
    .setExpirationTime('5m')
    .sign(privateKey);

  try {
    const valid = await token({ preferred_username: 'Learner', name: '中文用户', azp: 'hsk-app', aud: 'account' });
    assert.deepEqual(await verifier(valid), {
      subject: 'subject-1', username: 'learner', displayName: '中文用户',
    });
    const wrongClient = await token({ preferred_username: 'learner', azp: 'other-app', aud: 'account' });
    await assert.rejects(() => verifier(wrongClient), /OIDC_CLIENT_NOT_ALLOWED/);
    const wrongIssuer = await token({ iss: `${issuer}/wrong`, preferred_username: 'learner', azp: 'hsk-app', aud: 'account' });
    await assert.rejects(() => verifier(wrongIssuer));
    const idToken = await token({ preferred_username: 'learner', azp: 'hsk-app', aud: 'hsk-app' });
    await assert.rejects(() => verifier(idToken));
  } finally {
    await new Promise((resolve) => issuerServer.close(resolve));
  }
});
