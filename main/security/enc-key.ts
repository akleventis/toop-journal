import { app, safeStorage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { logger } from '../logger';

const KEY_FILE = 'enc.key';
const KEY_BYTES = 32; // 256-bit key for AES-256-GCM

function getKeyPath(): string {
  return path.join(app.getPath('userData'), KEY_FILE);
}

/**
 * Loads the AES-256 encryption key from disk, or generates and stores a new one
 * on first launch. The key is protected at rest by Electron's safeStorage API,
 * which delegates to the macOS Keychain on macOS.
 *
 * The raw key is never written to disk in plaintext — only the safeStorage-encrypted
 * form is persisted in userData/enc.key.
 */
export function loadOrCreateEncKey(): Buffer {
  const keyPath = getKeyPath();

  if (fs.existsSync(keyPath)) {
    const encrypted = fs.readFileSync(keyPath);
    const hex = safeStorage.decryptString(encrypted);
    logger.info('enc-key: loaded existing encryption key');
    return Buffer.from(hex, 'hex');
  }

  const key = randomBytes(KEY_BYTES);
  const encrypted = safeStorage.encryptString(key.toString('hex'));
  fs.writeFileSync(keyPath, encrypted);
  logger.info('enc-key: generated and stored new encryption key');
  return key;
}
