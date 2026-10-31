import { createHmac } from 'node:crypto';
export function privacySubjectHash(
  key: Buffer,
  issuer: string,
  subject: string,
) {
  return createHmac('sha256', key)
    .update('deckforge-privacy-v1\0' + issuer + '\0' + subject)
    .digest('hex');
}
