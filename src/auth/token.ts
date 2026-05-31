import { v4 as uuidv4 } from 'uuid';

const TOKEN_KEY = 'auth_token';           // 认证令牌
const REMEMBER_ME_KEY = 'remember_me';    // 记住我标志
const USER_SESSION_KEY = 'user_session';  // 用户会话信息

export interface AuthToken {
  userId: string;
  token: string;
  createdAt: number;
  expiresAt: number;
}

// 保存令牌（登录时）
export const generateToken = (userId: string, expiresIn = 30 * 24 * 60 * 60 * 1000): AuthToken => {
  return {
    userId,
    token: uuidv4(),
    createdAt: Date.now(),
    expiresAt: Date.now() + expiresIn,
  };
};

// 保存 Token 到 localStorage
export const saveToken = (authToken: AuthToken, rememberMe = false): void => {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(authToken));
  if (rememberMe) {
    localStorage.setItem(REMEMBER_ME_KEY, 'true');
  }
};

export const getToken = (): AuthToken | null => {
  const tokenStr = localStorage.getItem(TOKEN_KEY);
  if (!tokenStr) return null;
  
  try {
    const token: AuthToken = JSON.parse(tokenStr);
    // 检查令牌是否过期（30天）
    if (token.expiresAt < Date.now()) {
      removeToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
};

export const removeToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REMEMBER_ME_KEY);
  localStorage.removeItem(USER_SESSION_KEY);
};

export const isRememberMe = (): boolean => {
  return localStorage.getItem(REMEMBER_ME_KEY) === 'true';
};

export const saveUserSession = (userId: string, username: string): void => {
  localStorage.setItem(USER_SESSION_KEY, JSON.stringify({ userId, username }));
};

export const getUserSession = (): { userId: string; username: string } | null => {
  const sessionStr = localStorage.getItem(USER_SESSION_KEY);
  if (!sessionStr) return null;
  
  try {
    return JSON.parse(sessionStr);
  } catch {
    return null;
  }
};