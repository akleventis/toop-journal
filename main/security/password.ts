import { pbkdf2Sync, randomBytes } from 'crypto';

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 32;
const HASH_BYTES = 64;

// PBKDF2-SHA512 hash. Generates a random salt if none provided; returns both as hex strings.
export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const saltBuffer = salt ? Buffer.from(salt, 'hex') : randomBytes(SALT_BYTES);
  const hashBuffer = pbkdf2Sync(password, saltBuffer, PBKDF2_ITERATIONS, HASH_BYTES, 'sha512');
  return {
    hash: hashBuffer.toString('hex'),
    salt: saltBuffer.toString('hex')
  };
}

// Returns true if the password matches the stored hash + salt.
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const result = hashPassword(password, salt);
  return result.hash === hash;
}
