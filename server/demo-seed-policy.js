const SAFE_DATABASE_SUFFIX = /_(dev|test|demo)$/i;

export function assertDemoSeedTarget({ nodeEnv, allowDemoSeed, databaseName, expectedDatabase }) {
  if (String(nodeEnv ?? '').toLowerCase() === 'production') {
    throw new Error('Demo seeding is disabled in production.');
  }
  if (allowDemoSeed !== '1') {
    throw new Error('Set ALLOW_DEMO_SEED=1 to explicitly enable demo account seeding.');
  }
  if (!databaseName || !expectedDatabase) {
    throw new Error('DB_NAME and DEMO_SEED_DATABASE are required for demo seeding.');
  }
  if (databaseName !== expectedDatabase) {
    throw new Error('DEMO_SEED_DATABASE must exactly match DB_NAME.');
  }
  if (!SAFE_DATABASE_SUFFIX.test(databaseName)) {
    throw new Error('Demo seeding is limited to databases ending in _dev, _test, or _demo.');
  }
  return databaseName;
}

export function validateDemoPasswords(users) {
  for (const { username, password } of users) {
    if (typeof password !== 'string' || password.length < 16) {
      throw new Error(`Demo password for ${username} must be at least 16 characters.`);
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new Error(`Demo password for ${username} must contain letters and digits.`);
    }
    if (password.toLowerCase().includes(username.toLowerCase())) {
      throw new Error(`Demo password for ${username} must not contain the username.`);
    }
  }
}
