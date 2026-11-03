const ENCRYPTION_KEY_PREFIX = 'encryption_key_';
const AES_PREFIX = 'aes:';

// 生成加密密钥
export const generateEncryptionKey = (): string => {
  const keyArray = new Uint8Array(32);
  crypto.getRandomValues(keyArray);
  return Array.from(keyArray, byte => byte.toString(16).padStart(2, '0')).join('');
};

export const saveEncryptionKey = (userId: string, key: string): void => {
  localStorage.setItem(ENCRYPTION_KEY_PREFIX + userId, key);
};

export const getEncryptionKey = (userId: string): string | null => {
  return localStorage.getItem(ENCRYPTION_KEY_PREFIX + userId);
};

export const hasEncryptionKey = (userId: string): boolean => {
  return !!localStorage.getItem(ENCRYPTION_KEY_PREFIX + userId);
};

export const initEncryptionKey = (userId: string): string => {
  let key = getEncryptionKey(userId);
  if (!key) {
    key = generateEncryptionKey();
    saveEncryptionKey(userId, key);
  }
  return key;
};

// 获取当前加密密钥归属用户（从 auth_token 读取，避免与 db/index.ts 循环依赖）
const getSecretOwnerId = (): string => {
  try {
    const tokenStr = localStorage.getItem('auth_token');
    if (!tokenStr) return '';
    const token = JSON.parse(tokenStr);
    return typeof token?.userId === 'string' ? token.userId : '';
  } catch {
    return '';
  }
};

// 二进制 <-> base64（Web Crypto 输出 ArrayBuffer）
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const importAesKey = (rawKey: string, usages: KeyUsage[]): Promise<CryptoKey> => {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(rawKey),
    { name: 'AES-GCM' },
    false,
    usages,
  );
};

// AES-GCM 加密（随机 iv，结果格式：aes:base64(iv):base64(ciphertext)）
// 密钥从当前用户的加密密钥（encryption_key_{userId}）派生，首次使用时自动生成
export const encryptSecret = async (plaintext: string): Promise<string> => {
  if (!plaintext) return '';
  const ownerId = getSecretOwnerId();
  const rawKey = initEncryptionKey(ownerId);
  const key = await importAesKey(rawKey, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return `${AES_PREFIX}${bufferToBase64(iv.buffer)}:${bufferToBase64(ciphertext)}`;
};

// AES-GCM 解密。非 aes: 前缀的旧格式数据（历史明文/base64）原样返回，保证兼容不破坏
export const decryptSecret = async (ciphertext: string): Promise<string> => {
  if (!ciphertext) return '';
  if (!ciphertext.startsWith(AES_PREFIX)) return ciphertext;

  const parts = ciphertext.split(':');
  if (parts.length < 3) return '';

  try {
    const rawKey = getEncryptionKey(getSecretOwnerId());
    if (!rawKey) return '';
    const key = await importAesKey(rawKey, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(parts[1]) },
      key,
      base64ToBuffer(parts.slice(2).join(':')),
    );
    return new TextDecoder().decode(plaintext);
  } catch (err) {
    console.warn('[encryption] AES-GCM 解密失败:', err);
    return '';
  }
};

export const removeEncryptionKey = (userId: string): void => {
  localStorage.removeItem(ENCRYPTION_KEY_PREFIX + userId);
};
