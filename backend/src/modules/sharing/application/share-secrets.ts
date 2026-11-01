import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const stretch = promisify(scrypt);
const KEY_BYTES = 32;

/** Too long to guess, so a plain hash is enough to keep it from being read back. */
export const newToken = () => randomBytes(KEY_BYTES).toString('base64url');

export const hashOf = (secret: string) => createHash('sha256').update(secret).digest('hex');

async function stretched(password: string, salt: Buffer): Promise<Buffer> {
  const key = await stretch(password, salt, KEY_BYTES);
  return Buffer.isBuffer(key) ? key : Buffer.from(String(key));
}

/** A person's password is short enough to guess, so it is stretched and salted. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await stretched(password, salt)).toString('hex')}`;
}

export async function passwordMatches(password: string, stored: string): Promise<boolean> {
  const [salt = '', key = ''] = stored.split(':');
  return timingSafeEqual(await stretched(password, Buffer.from(salt, 'hex')), Buffer.from(key, 'hex'));
}
