import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt parameters follow the OWASP Password Storage Cheat Sheet
// (N=2^17, r=8, p=1). They are stored inside each hash, so they can be
// raised later without breaking existing passwords.
const N = 2 ** 17;
const r = 8;
const p = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs about 128 * N * r bytes (128 MiB here); Node's default limit is 32 MiB.
const MAX_MEM = 256 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Returns "scrypt$N$r$p$<salt base64>$<hash base64>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, { N, r, p, maxmem: MAX_MEM });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, rr, pp, saltB64, hashB64] = stored.split('$');
  if (algorithm !== 'scrypt' || !n || !rr || !pp || !saltB64 || !hashB64) return false;

  const expected = Buffer.from(hashB64, 'base64');
  const key = await deriveKey(password, Buffer.from(saltB64, 'base64'), {
    N: Number(n),
    r: Number(rr),
    p: Number(pp),
    maxmem: MAX_MEM,
  });
  // Constant-time comparison so response timing does not leak how many bytes matched.
  return key.length === expected.length && timingSafeEqual(key, expected);
}
