const ENCRYPTION_KEY_PREFIX = 'encryption_key_';

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

// XOR 加密
export const simpleEncrypt = (text: string, key: string): string => {
  const encoded: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    encoded.push(String.fromCharCode(charCode));
  }
  return btoa(encoded.join(''));
};

// XOR 解密
export const simpleDecrypt = (encrypted: string, key: string): string => {
  try {
    const decoded = atob(encrypted);
    const plaintext: string[] = [];
    for (let i = 0; i < decoded.length; i++) {
      const charCode = decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length);
      plaintext.push(String.fromCharCode(charCode));
    }
    return plaintext.join('');
  } catch {
    return '';
  }
};

export const removeEncryptionKey = (userId: string): void => {
  localStorage.removeItem(ENCRYPTION_KEY_PREFIX + userId);
};