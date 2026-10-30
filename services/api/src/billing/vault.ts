import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
/** Server-only AEAD evidence storage. Keys are operator secrets, never Expo/public config. */
export function sealBilling(value: unknown, key: Buffer, aad: string) {
  if (key.length !== 32) throw new Error('BILLING_KEY_REQUIRED');
  const iv = randomBytes(12),
    cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([
    cipher.update(JSON.stringify(value), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), data]
    .map((v) => v.toString('base64url'))
    .join('.');
}
export function openBilling(box: string, key: Buffer, aad: string): unknown {
  if (key.length !== 32) throw new Error('BILLING_KEY_REQUIRED');
  const parts = box.split('.');
  if (parts.length !== 3) throw new Error('INVALID_BILLING_EVIDENCE');
  const [iv, tag, data] = parts.map((v) => Buffer.from(v, 'base64url'));
  if (iv!.length !== 12 || tag!.length !== 16)
    throw new Error('INVALID_BILLING_EVIDENCE');
  const decipher = createDecipheriv('aes-256-gcm', key, iv!);
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(tag!);
  return JSON.parse(
    Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8'),
  ) as unknown;
}
