// 카페24 토큰을 DB에 넣기 전에 AES-256-GCM으로 암호화한다.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export function loadEncryptionKey(base64: string | undefined): Buffer {
  const key = Buffer.from(base64 ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('CAFE24_TOKEN_ENCRYPTION_KEY는 32바이트 base64 문자열이어야 합니다.');
  }
  return key;
}

export function sealJson(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), data.toString('base64url')].join('.');
}

export function openJson<T>(sealed: string, key: Buffer): T {
  const [version, iv, tag, data] = sealed.split('.');
  if (version !== 'v1' || !iv || !tag || !data) throw new Error('TOKEN_FORMAT_INVALID');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  const plain = Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]);
  return JSON.parse(plain.toString('utf8')) as T;
}
