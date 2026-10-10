import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);

export async function hashPassword(password, salt = randomBytes(16)) {
  const normalizedSalt = Buffer.isBuffer(salt) ? salt : Buffer.from(salt, 'base64');
  const derivedKey = await scrypt(String(password), normalizedSalt, 64);
  return {
    salt: normalizedSalt.toString('base64'),
    hash: Buffer.from(derivedKey).toString('base64'),
  };
}

export async function verifyPassword(password, record) {
  try {
    const expected = Buffer.from(record.hash, 'base64');
    const actual = Buffer.from(await scrypt(
      String(password),
      Buffer.from(record.salt, 'base64'),
      expected.length,
    ));
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
