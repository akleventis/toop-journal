import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

const PBKDF2_ITERATIONS = 100000;
const SALT_BYTES = 32;
const HASH_BYTES = 64;

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const saltBuffer = salt ? Buffer.from(salt, "hex") : randomBytes(SALT_BYTES);
  const hashBuffer = pbkdf2Sync(password, saltBuffer, PBKDF2_ITERATIONS, HASH_BYTES, "sha512");
  return {
    hash: hashBuffer.toString("hex"),
    salt: saltBuffer.toString("hex"),
  };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const result = hashPassword(password, salt);
  return timingSafeEqual(Buffer.from(result.hash, "hex"), Buffer.from(hash, "hex"));
}
