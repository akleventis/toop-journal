import { app } from 'electron';
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
 * on first launch. Stored as plain hex (0o600) in userData — no Keychain involved.
 */
export function loadOrCreateEncKey(): Buffer {
  const keyPath = getKeyPath();

  if (fs.existsSync(keyPath)) {
    const hex = fs.readFileSync(keyPath, 'utf-8').trim();
    logger.info('enc-key: loaded existing encryption key');
    return Buffer.from(hex, 'hex');
  }

  // generate key and write as plain hex, owner-readable only
  const key = randomBytes(KEY_BYTES);
  fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
  logger.info('enc-key: generated and stored new encryption key');
  return key;
}
