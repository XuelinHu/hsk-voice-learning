import { createRemoteJWKSet, jwtVerify } from 'jose';

export function createOidcVerifier({ issuer, clientIds = [] }) {
  if (!issuer || !clientIds.length) return null;
  const normalizedIssuer = issuer.replace(/\/$/, '');
  const jwks = createRemoteJWKSet(new URL(`${normalizedIssuer}/protocol/openid-connect/certs`));

  return async (token) => {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: normalizedIssuer,
      audience: 'account',
      algorithms: ['RS256'],
    });
    if (!payload.sub || !payload.preferred_username || !clientIds.includes(payload.azp)) {
      throw new Error('OIDC_CLAIMS_INVALID');
    }
    return {
      subject: String(payload.sub),
      username: String(payload.preferred_username).trim().toLowerCase(),
      displayName: String(payload.name || payload.preferred_username).slice(0, 160),
    };
  };
}
