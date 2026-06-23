/**
 * Credentials Reader/Writer
 *
 * Credentials are stored project-locally in .arch/credentials.json so each
 * project directory can authenticate to a different platform URL (prod, staging, dev).
 *
 * Resolution order (read):
 *   1. Walk up from CWD looking for .arch/credentials.json
 *   2. Fall back to ~/.config/kore-platform/credentials.json (global, backward compat)
 *
 * Write target: .arch/credentials.json in the current working directory.
 * The .arch/ directory is gitignored by convention.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';

export interface StoredCredentials {
  token: string;
  refreshToken?: string;
  expiresAt: string;
  email?: string;
}

const LOCAL_CREDS_FILE = path.join('.arch', 'credentials.json');

/** Global fallback path: ~/.config/kore-platform/credentials.json */
function globalCredentialsPath(): string {
  const configDir = process.env['XDG_CONFIG_HOME'] ?? path.join(os.homedir(), '.config');
  return path.join(configDir, 'kore-platform', 'credentials.json');
}

/**
 * Walk up from CWD looking for an existing .arch/credentials.json.
 * Returns the path if found, null otherwise.
 */
function findLocalCredentialsPath(): string | null {
  let dir = process.cwd();
  while (true) {
    const candidate = path.join(dir, LOCAL_CREDS_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Path to write new credentials — always .arch/credentials.json in CWD. */
function localCredentialsWritePath(): string {
  return path.join(process.cwd(), LOCAL_CREDS_FILE);
}

/**
 * Decrypt a Conf-encrypted file.
 * Conf uses AES-256-CBC with the encryption key as password.
 */
function decryptConf(encryptedData: string, encryptionKey: string): string {
  // Conf stores: hex(iv) + encrypted_data
  // The encryption key is hashed to create the actual key
  const key = crypto.createHash('sha256').update(encryptionKey).digest();

  try {
    // Try to parse as JSON first (unencrypted fallback)
    JSON.parse(encryptedData);
    return encryptedData;
  } catch {
    // It's encrypted — Conf uses a specific format
  }

  // Conf format: base64-encoded encrypted data with IV prepended
  const data = Buffer.from(encryptedData, 'hex');
  const iv = data.subarray(0, 16);
  const encrypted = data.subarray(16);

  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, undefined, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Parse a credentials file at the given path.
 * Returns null if the file is missing, unreadable, or malformed.
 */
function parseCredentialsFile(credPath: string): StoredCredentials | null {
  try {
    if (!fs.existsSync(credPath)) return null;
    const raw = fs.readFileSync(credPath, 'utf-8').trim();
    if (!raw) return null;

    let data: Record<string, unknown>;
    try {
      const decrypted = decryptConf(raw, 'kore-platform-cli-v1');
      data = JSON.parse(decrypted);
    } catch {
      try {
        data = JSON.parse(raw);
      } catch {
        return null;
      }
    }

    const token = data['token'] as string | undefined;
    const expiresAt = data['expiresAt'] as string | undefined;
    if (!token || !expiresAt) return null;

    return {
      token,
      refreshToken: (data['refreshToken'] as string) || undefined,
      expiresAt,
      email: (data['email'] as string) || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Read stored credentials.
 * Checks .arch/credentials.json in the project tree first, then the global fallback.
 */
export function readStoredCredentials(): StoredCredentials | null {
  const localPath = findLocalCredentialsPath();
  if (localPath) {
    const creds = parseCredentialsFile(localPath);
    if (creds) return creds;
  }
  return parseCredentialsFile(globalCredentialsPath());
}

/**
 * Write credentials to .arch/credentials.json in the current working directory.
 * Creates .arch/ if it doesn't exist. File is written with 0600 permissions.
 */
export function writeStoredCredentials(creds: StoredCredentials): void {
  const credPath = localCredentialsWritePath();
  fs.mkdirSync(path.dirname(credPath), { recursive: true });
  fs.writeFileSync(credPath, JSON.stringify(creds, null, 2), { mode: 0o600 });
}

/**
 * Check if stored credentials have a valid (non-expired) access token.
 */
export function hasValidToken(creds: StoredCredentials): boolean {
  return new Date(creds.expiresAt) > new Date();
}

/**
 * Check if stored credentials have a refresh token for renewal.
 */
export function hasRefreshToken(creds: StoredCredentials): boolean {
  return !!creds.refreshToken;
}
