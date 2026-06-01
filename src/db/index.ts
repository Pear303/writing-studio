import Dexie, { Table } from 'dexie';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import type { Book, Volume, Chapter, Material, AIConversation, ChapterVersion, LLMConfig, QARecord, FullExportData, ImportResult, FormattingSettings, WritingGoal, PomodoroState, Theme, PipelineSession, VibePreset } from '../types';
import { DEFAULT_VIBE_PRESETS } from '../types';
export type { LLMConfig };

// bcrypt 盐值轮数（cost factor）
// 数值越大越安全但计算越慢，推荐范围 10-12
const SALT_ROUNDS = 12;

// 用户信息
export interface User {
  id: string;
  username: string;
  email?: string;
  passwordHash: string;
  avatar?: string;
  nickname?: string;
  createdAt: number;
  updatedAt: number;
}

// 用户设置
export interface UserSettings {
  userId: string;
  theme: 'light' | 'dark' | 'eye-care';
  formattingSettings: any;  // 或应改成 FormattingSettings
  writingGoal?: any;
  smtpConfig?: SMTPConfig;
  encryptionKey?: string;
  updatedAt: number;
}

// 登录日志
export interface LoginLog {
  id: string;
  userId: string;
  loginTime: number;
  deviceInfo?: string;
  ipAddress?: string;
  success: boolean;
}

// SMTP 配置
export interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromEmail: string;
}

// 邮箱验证码
export interface EmailVerification {
  id: string;
  email: string;
  code: string;
  userId: string;
  purpose: 'email_change' | 'password_reset';
  expiresAt: number;
  createdAt: number;
}

export class NovelIDEDatabase extends Dexie {
  books!: Table<Book>;
  volumes!: Table<Volume>;
  chapters!: Table<Chapter>;
  materials!: Table<Material>;
  aiConversations!: Table<AIConversation>;
  chapterVersions!: Table<ChapterVersion>;
  llmConfigs!: Table<LLMConfig>;
  users!: Table<User>;
  userSettings!: Table<UserSettings>;
  loginLogs!: Table<LoginLog>;
  emailVerifications!: Table<EmailVerification>;
  qaRecords!: Table<QARecord>;
  pipelineSessions!: Table<PipelineSession>;
  vibePresets!: Table<VibePreset>;

  constructor() {
    super('NovelIDE');

    this.version(5).stores({
      books: 'id, createdAt, updatedAt',
      volumes: 'id, bookId, order',
      chapters: 'id, volumeId, bookId, createdAt, updatedAt',
      materials: 'id, type, createdAt, updatedAt',
      aiConversations: 'id, createdAt',
      chapterVersions: 'id, chapterId, createdAt',
      llmConfigs: 'id, provider, isDefault, createdAt',
      users: 'id, username, email, createdAt',
      userSettings: 'userId',
      loginLogs: 'id, userId, loginTime',
    });

    this.version(6).stores({
      emailVerifications: 'id, email, userId, expiresAt',
    });

    this.version(7).stores({
      qaRecords: 'id, bookId, chapterId, createdAt',
    });

    this.version(8).stores({
      books: 'id, userId, createdAt, updatedAt',
      materials: 'id, userId, type, createdAt, updatedAt',
    });

    this.version(9).stores({
      pipelineSessions: 'id, bookId, volumeId, updatedAt',
    });

    this.version(10).stores({
      materials: 'id, userId, bookId, type, createdAt, updatedAt',
    });

    this.version(11).stores({
      vibePresets: 'id, userId, enabled, order',
    });

    /*
    -- 类似的 SQL 语句
    CREATE TABLE users (
        id TEXT PRIMARY KEY,        -- 主键
        username TEXT INDEXED,      -- 索引字段
        email TEXT INDEXED,         -- 索引字段
        createdAt NUMBER INDEXED    -- 索引字段
    );
    // users: 'id, username, email'
    //         ^^ 第 1 个字段是主键（自动唯一、不可重复）
    */
  }
  /*
  // 没有索引：全表扫描，速度慢
  const chapters = await db.chapters.filter(c => c.bookId === 'xxx').toArray()

  // 有索引：直接使用索引查询，速度快
  const chapters = await db.chapters.where('bookId').equals('xxx').toArray()
  */
}

// 获取当前登录用户 ID（从 token 中读取）
export const getCurrentUserId = (): string | null => {
  try {
    const tokenStr = localStorage.getItem('auth_token');
    if (!tokenStr) return null;
    const token = JSON.parse(tokenStr);
    return token?.userId || null;
  } catch {
    return null;
  }
};

// 迁移旧数据：将无 userId 的旧数据归属到当前用户（仅执行一次）
export const migrateLegacyData = async (userId: string): Promise<void> => {
  try {
    // 迁移无主书籍
    const unownedBooks = await db.books.filter(b => !b.userId).toArray();
    for (const book of unownedBooks) {
      await db.books.update(book.id, { userId } as any);
    }
    // 迁移无主素材
    const unownedMaterials = await db.materials.filter(m => !m.userId).toArray();
    for (const material of unownedMaterials) {
      await db.materials.update(material.id, { userId } as any);
    }
    if (unownedBooks.length > 0 || unownedMaterials.length > 0) {
      console.log(`[数据迁移] 已将 ${unownedBooks.length} 本书和 ${unownedMaterials.length} 个素材归属到用户 ${userId}`);
    }
  } catch (err) {
    console.warn('[数据迁移] 迁移旧数据失败:', err);
  }
};

// 导出单例实例
export const db = new NovelIDEDatabase();

// 辅助函数：保存章节版本
export const saveChapterVersion = async (chapterId: string, content: string, wordCount: number): Promise<string> => {
  const versionId = `${chapterId}_${Date.now()}`;
  
  await db.chapterVersions.add({
    id: versionId,
    chapterId,
    content,
    wordCount,
    createdAt: Date.now(),
  });

  return versionId;
};

// 辅助函数：获取章节的所有版本
export const getChapterVersions = async (chapterId: string): Promise<ChapterVersion[]> => {
  return await db.chapterVersions
    .where('chapterId')
    .equals(chapterId)
    .sortBy('createdAt');
};

// 辅助函数：恢复到指定版本
export const restoreChapterVersion = async (versionId: string): Promise<void> => {
  const version = await db.chapterVersions.get(versionId);
  if (!version) throw new Error('版本不存在');

  // 更新章节内容
  await db.chapters.update(version.chapterId, {
    content: version.content,
    wordCount: version.wordCount,
    updatedAt: Date.now(),
  });
};

// 辅助函数：删除旧版本（保留最近 N 个）
export const cleanupOldVersions = async (chapterId: string, keepCount: number = 10): Promise<void> => {
  const versions = await db.chapterVersions
    .where('chapterId')
    .equals(chapterId)
    .reverse()
    .sortBy('createdAt');

  if (versions.length > keepCount) {
    const toDelete = versions.slice(keepCount);
    await db.chapterVersions.bulkDelete(toDelete.map(v => v.id));
  }
};

// 本地设置键前缀
const FORMATTING_SETTINGS_PREFIX = 'formattingSettings_';
const WRITING_GOAL_KEY = 'writingGoal';
const POMODORO_KEY = 'pomodoroState';
const THEME_KEY = 'theme';
const LAST_EXPORT_PATH_KEY = 'lastExportPath';
const LAST_IMPORT_PATH_KEY = 'lastImportPath';

// 导出所有本地设置
export const exportLocalSettings = (): Record<string, any> => {
  const result: Record<string, FormattingSettings> = {};
  const keys = Object.keys(localStorage);
  
  for (const key of keys) {
    if (key.startsWith(FORMATTING_SETTINGS_PREFIX)) {
      const bookId = key.replace(FORMATTING_SETTINGS_PREFIX, '');
      try {
        result[bookId] = JSON.parse(localStorage.getItem(key) || '{}');
      } catch {}
    }
  }
  
  return result;
};

// 导出完整数据
export const exportAllData = async (): Promise<string> => {
  const books = await db.books.toArray();
  const volumes = await db.volumes.toArray();
  const chapters = await db.chapters.toArray();
  const materials = await db.materials.toArray();
  const aiConversations = await db.aiConversations.toArray();
  const chapterVersions = await db.chapterVersions.toArray();
  const llmConfigs = await db.llmConfigs.toArray();
  const qaRecords = await db.qaRecords.toArray();
  const users = await db.users.toArray();
  const userSettings = await db.userSettings.toArray();
  
  const formattingSettings = exportLocalSettings();
  
  const writingGoalStr = localStorage.getItem(WRITING_GOAL_KEY);
  const writingGoal: WritingGoal | null = writingGoalStr ? JSON.parse(writingGoalStr) : null;
  
  const pomodoroStr = localStorage.getItem(POMODORO_KEY);
  const pomodoro: PomodoroState | null = pomodoroStr ? JSON.parse(pomodoroStr) : null;
  
  const theme = (localStorage.getItem(THEME_KEY) || 'light') as Theme;
  const lastExportPath = localStorage.getItem(LAST_EXPORT_PATH_KEY);
  const lastImportPath = localStorage.getItem(LAST_IMPORT_PATH_KEY);
  
  const data: FullExportData = {
    version: '2.0',
    exportedAt: Date.now(),
    books,
    volumes,
    chapters,
    materials,
    aiConversations,
    chapterVersions,
    llmConfigs,
    qaRecords,
    users,
    userSettings,
    formattingSettings,
    writingGoal,
    pomodoro,
    theme,
    metadata: {
      lastExportPath,
      lastImportPath,
    },
  };
  
  return JSON.stringify(data, null, 2);
};

// 合并式导入数据
export const importAllData = async (jsonData: string, mergeMode: boolean = true): Promise<ImportResult> => {
  const data: FullExportData = JSON.parse(jsonData);
  const result: ImportResult = { added: 0, updated: 0, skipped: 0, errors: [] };
  
  const importUserId = getCurrentUserId() || undefined;

  if (!mergeMode) {
    await db.transaction('rw', 
      [db.books, db.volumes, db.chapters, db.materials, db.aiConversations, db.chapterVersions, db.llmConfigs, db.qaRecords, db.users, db.userSettings],
      async () => {
        await db.books.clear();
        await db.volumes.clear();
        await db.chapters.clear();
        await db.materials.clear();
        await db.aiConversations.clear();
        await db.chapterVersions.clear();
        await db.llmConfigs.clear();
        await db.qaRecords.clear();
        await db.users.clear();
        await db.userSettings.clear();
        
        if (data.books?.length) {
          await db.books.bulkAdd(data.books.map(b => ({ ...b, userId: b.userId || importUserId })));
        }
        if (data.volumes?.length) await db.volumes.bulkAdd(data.volumes);
        if (data.chapters?.length) await db.chapters.bulkAdd(data.chapters);
        if (data.materials?.length) {
          await db.materials.bulkAdd(data.materials.map(m => ({ ...m, userId: m.userId || importUserId })));
        }
        if (data.aiConversations?.length) await db.aiConversations.bulkAdd(data.aiConversations);
        if (data.chapterVersions?.length) await db.chapterVersions.bulkAdd(data.chapterVersions);
        if (data.llmConfigs?.length) await db.llmConfigs.bulkAdd(data.llmConfigs);
        if (data.qaRecords?.length) await db.qaRecords.bulkAdd(data.qaRecords);
        if (data.users?.length) await db.users.bulkAdd(data.users);
        if (data.userSettings?.length) await db.userSettings.bulkAdd(data.userSettings);
      }
    );
    
    for (const bookId of Object.keys(data.formattingSettings || {})) {
      localStorage.setItem(FORMATTING_SETTINGS_PREFIX + bookId, JSON.stringify(data.formattingSettings[bookId]));
    }
    if (data.writingGoal) localStorage.setItem(WRITING_GOAL_KEY, JSON.stringify(data.writingGoal));
    if (data.pomodoro) localStorage.setItem(POMODORO_KEY, JSON.stringify(data.pomodoro));
    if (data.theme) localStorage.setItem(THEME_KEY, data.theme);
    if (data.metadata?.lastExportPath) localStorage.setItem(LAST_EXPORT_PATH_KEY, data.metadata.lastExportPath);
    if (data.metadata?.lastImportPath) localStorage.setItem(LAST_IMPORT_PATH_KEY, data.metadata.lastImportPath);
    
    return result;
  }
  
  await db.transaction('rw', 
    [db.books, db.volumes, db.chapters, db.materials, db.aiConversations, db.chapterVersions, db.llmConfigs, db.qaRecords, db.users, db.userSettings],
    async () => {
      const existingBookIds = new Set((await db.books.toArray()).map(b => b.id));
      const existingVolumeIds = new Set((await db.volumes.toArray()).map(v => v.id));
      const existingChapterIds = new Set((await db.chapters.toArray()).map(c => c.id));
      
      for (const user of data.users || []) {
        const exists = await db.users.get(user.id);
        if (exists) {
          await db.users.update(user.id, user);
          result.updated++;
        } else {
          await db.users.add(user);
          result.added++;
        }
      }
      
      for (const settings of data.userSettings || []) {
        const exists = await db.userSettings.get(settings.userId);
        if (exists) {
          await db.userSettings.update(settings.userId, settings);
          result.updated++;
        } else {
          await db.userSettings.add(settings);
          result.added++;
        }
      }
      
      for (const book of data.books || []) {
        const bookWithUserId = { ...book, userId: book.userId || importUserId };
        if (existingBookIds.has(book.id)) {
          await db.books.update(book.id, bookWithUserId);
          result.updated++;
        } else {
          await db.books.add(bookWithUserId);
          result.added++;
        }
      }
      
      for (const volume of data.volumes || []) {
        if (existingVolumeIds.has(volume.id)) {
          await db.volumes.update(volume.id, volume);
          result.updated++;
        } else {
          await db.volumes.add(volume);
          result.added++;
        }
      }
      
      for (const chapter of data.chapters || []) {
        if (existingChapterIds.has(chapter.id)) {
          await db.chapters.update(chapter.id, chapter);
          result.updated++;
        } else {
          await db.chapters.add(chapter);
          result.added++;
        }
      }
      
      for (const material of data.materials || []) {
        await db.materials.put({ ...material, userId: material.userId || importUserId });
        result.added++;
      }
      
      for (const conv of data.aiConversations || []) {
        await db.aiConversations.put(conv);
        result.added++;
      }
      
      for (const version of data.chapterVersions || []) {
        const exists = await db.chapterVersions.get(version.id);
        if (exists) {
          await db.chapterVersions.update(version.id, version);
          result.updated++;
        } else {
          await db.chapterVersions.add(version);
          result.added++;
        }
      }
      
      for (const config of data.llmConfigs || []) {
        const exists = await db.llmConfigs.get(config.id);
        if (exists) {
          await db.llmConfigs.update(config.id, config);
          result.updated++;
        } else {
          await db.llmConfigs.add(config);
          result.added++;
        }
      }
      
      for (const record of data.qaRecords || []) {
        await db.qaRecords.put(record);
        result.added++;
      }
    }
  );
  
  for (const bookId of Object.keys(data.formattingSettings || {})) {
    const existing = localStorage.getItem(FORMATTING_SETTINGS_PREFIX + bookId);
    if (existing) {
      const existingSettings: FormattingSettings = JSON.parse(existing);
      const newSettings = data.formattingSettings[bookId];
      localStorage.setItem(FORMATTING_SETTINGS_PREFIX + bookId, JSON.stringify({ ...existingSettings, ...newSettings }));
    } else {
      localStorage.setItem(FORMATTING_SETTINGS_PREFIX + bookId, JSON.stringify(data.formattingSettings[bookId]));
    }
  }
  
  if (data.writingGoal) {
    const existingGoal = localStorage.getItem(WRITING_GOAL_KEY);
    if (existingGoal) {
      const existing: WritingGoal = JSON.parse(existingGoal);
      localStorage.setItem(WRITING_GOAL_KEY, JSON.stringify({ ...existing, ...data.writingGoal }));
    } else {
      localStorage.setItem(WRITING_GOAL_KEY, JSON.stringify(data.writingGoal));
    }
  }
  
  if (data.pomodoro) {
    const existingPomodoro = localStorage.getItem(POMODORO_KEY);
    if (existingPomodoro) {
      const existing: PomodoroState = JSON.parse(existingPomodoro);
      localStorage.setItem(POMODORO_KEY, JSON.stringify({ ...existing, ...data.pomodoro }));
    } else {
      localStorage.setItem(POMODORO_KEY, JSON.stringify(data.pomodoro));
    }
  }
  
  if (data.theme) localStorage.setItem(THEME_KEY, data.theme);
  if (data.metadata?.lastExportPath) localStorage.setItem(LAST_EXPORT_PATH_KEY, data.metadata.lastExportPath);
  
  return result;
};

// LLM 配置辅助函数
export const saveLLMConfig = async (config: LLMConfig): Promise<string> => {
  const now = Date.now();
  const newConfig: LLMConfig = {
    ...config,
    id: config.id || `llm_${now}`,
    createdAt: config.createdAt || now,
    updatedAt: now,
  };
  
  // 如果设为默认，先清除其他默认
  if (newConfig.isDefault) {
    const allConfigs = await db.llmConfigs.toArray();
    for (const c of allConfigs) {
      if (c.isDefault && c.id !== newConfig.id) {
        await db.llmConfigs.update(c.id, { isDefault: false, updatedAt: now });
      }
    }
  }
  
  await db.llmConfigs.put(newConfig);
  return newConfig.id;
};

export const getAllLLMConfigs = async (): Promise<LLMConfig[]> => {
  return await db.llmConfigs.orderBy('createdAt').toArray();
};

export const getDefaultLLMConfig = async (): Promise<LLMConfig | undefined> => {
  const allConfigs = await db.llmConfigs.toArray();
  return allConfigs.find(c => c.isDefault === true);
};

export const deleteLLMConfig = async (id: string): Promise<void> => {
  await db.llmConfigs.delete(id);
};

export const setDefaultLLMConfig = async (id: string): Promise<void> => {
  const now = Date.now();
  const allConfigs = await db.llmConfigs.toArray();
  
  await db.transaction('rw', db.llmConfigs, async () => {
    for (const c of allConfigs) {
      if (c.id === id) {
        await db.llmConfigs.update(id, { isDefault: true, updatedAt: now });
      } else if (c.isDefault) {
        await db.llmConfigs.update(c.id, { isDefault: false, updatedAt: now });
      }
    }
  });
};

export const encodeApiKey = (apiKey: string): string => btoa(apiKey);

export const decodeApiKey = (encoded: string): string => {
  try {
    return atob(encoded);
  } catch {
    return encoded;
  }
};

// 密码哈希
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

// 验证密码
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  // 自动提取盐值，使用正确的盐值重新哈希password，然后才比较
  return bcrypt.compare(password, hash);
};

// 创建用户
export const createUser = async (
  username: string,
  password: string,
  email?: string
): Promise<User> => {
  // 检查用户名是否已存在
  const existingUser = await getUserByUsername(username);
  if (existingUser) {
    throw new Error('用户名已被使用');
  }
  // 检查邮箱是否已使用（如果提供）
  if (email) {
    const existingEmail = await getUserByEmail(email);
    if (existingEmail) {
      throw new Error('邮箱已被使用');
    }
  }
  
  const now = Date.now();
  const passwordHash = await hashPassword(password);
  
  const user: User = {
    id: uuidv4(),
    username,
    email,
    passwordHash,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.users.add(user);
  return user;
};

export const getUserByUsername = async (username: string): Promise<User | undefined> => {
  return await db.users.where('username').equals(username).first();
};

export const getUserByEmail = async (email: string): Promise<User | undefined> => {
  return await db.users.where('email').equals(email).first();
};

export const getUserById = async (id: string): Promise<User | undefined> => {
  return await db.users.get(id);
};

export const updateUser = async (id: string, updates: Partial<User>): Promise<void> => {
  await db.users.update(id, { ...updates, updatedAt: Date.now() });
};

export const deleteUser = async (id: string): Promise<void> => {
  await db.users.delete(id);
};

// 用户设置辅助函数
export const getUserSettings = async (userId: string): Promise<UserSettings | undefined> => {
  return await db.userSettings.get(userId);
};

export const saveUserSettings = async (settings: UserSettings): Promise<void> => {
  await db.userSettings.put({
    ...settings,
    updatedAt: Date.now(),
  });
};

// 登录日志辅助函数
export const addLoginLog = async (
  userId: string,
  success: boolean,
  deviceInfo?: string
): Promise<void> => {
  const log: LoginLog = {
    id: uuidv4(),
    userId,
    loginTime: Date.now(),
    deviceInfo,
    success,
  };
  await db.loginLogs.add(log);
};

export const getLoginLogs = async (userId: string, limit = 20): Promise<LoginLog[]> => {
  return await db.loginLogs
    .where('userId')
    .equals(userId)
    .reverse()
    .sortBy('loginTime')
    .then(logs => logs.slice(0, limit));
};

const VERIFY_CODE_EXPIRE_MINUTES = 15;

function generateVerifyCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const createEmailVerification = async (
  email: string,
  userId: string,
  purpose: EmailVerification['purpose'] = 'email_change'
): Promise<string> => {
  const code = generateVerifyCode();
  const now = Date.now();
  const verification: EmailVerification = {
    id: uuidv4(),
    email,
    code,
    userId,
    purpose,
    expiresAt: now + VERIFY_CODE_EXPIRE_MINUTES * 60 * 1000,
    createdAt: now,
  };
  await db.emailVerifications.add(verification);
  return code;
};

export const verifyEmailCode = async (email: string, code: string): Promise<boolean> => {
  const verification = await db.emailVerifications
    .where('email')
    .equals(email)
    .and(v => v.code === code && v.expiresAt > Date.now())
    .first();
  
  if (verification) {
    await db.emailVerifications.delete(verification.id);
    return true;
  }
  return false;
};

export const checkEmailCodeValid = async (email: string, code: string): Promise<boolean> => {
  const verification = await db.emailVerifications
    .where('email')
    .equals(email)
    .and(v => v.code === code && v.expiresAt > Date.now())
    .first();
  
  return !!verification;
};

// 辅助函数：更新章节标题
export const updateChapterTitle = async (chapterId: string, title: string): Promise<void> => {
  await db.chapters.update(chapterId, {
    title,
    updatedAt: Date.now(),
  });
};

// 辅助函数：更新卷名称
export const updateVolumeName = async (volumeId: string, name: string): Promise<void> => {
  await db.volumes.update(volumeId, {
    name,
  });
};

// ===== VibePreset 辅助函数 =====

const VIBE_PRESET_PREFIX = 'vibePresets_';

// 获取指定用户的所有 Vibe 预设
export const getVibePresets = async (userId: string): Promise<VibePreset[]> => {
  return await db.vibePresets
    .where('userId')
    .equals(userId)
    .sortBy('order');
};

// 确保默认预设存在（首次使用时初始化）
export const ensureDefaultVibePresets = async (userId: string): Promise<void> => {
  // 检查是否存在本地缓存标记（避免重复检查 DB）
  const cacheKey = VIBE_PRESET_PREFIX + userId;
  if (localStorage.getItem(cacheKey)) return;

  const existing = await db.vibePresets.where('userId').equals(userId).count();
  if (existing > 0) {
    localStorage.setItem(cacheKey, '1');
    return;
  }

  const now = Date.now();
  const defaults: VibePreset[] = DEFAULT_VIBE_PRESETS.map((p, i) => ({
    id: `vibe_default_${i}_${userId}`,
    userId,
    name: p.name,
    content: p.content,
    enabled: false,
    builtIn: true,
    order: p.order,
    createdAt: now,
    updatedAt: now,
  }));

  await db.vibePresets.bulkAdd(defaults);
  localStorage.setItem(cacheKey, '1');
};

// 切换预设的启用/禁用状态
export const toggleVibePreset = async (presetId: string, enabled: boolean): Promise<void> => {
  await db.vibePresets.update(presetId, { enabled, updatedAt: Date.now() });
};

// 添加自定义预设
export const addCustomVibePreset = async (
  userId: string,
  name: string,
  content: string,
): Promise<string> => {
  const allPresets = await db.vibePresets.where('userId').equals(userId).sortBy('order');
  const maxOrder = allPresets.length > 0 ? allPresets[allPresets.length - 1].order : 0;
  const now = Date.now();
  const preset: VibePreset = {
    id: `vibe_custom_${now}_${userId}`,
    userId,
    name,
    content,
    enabled: true,
    builtIn: false,
    order: maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.vibePresets.add(preset);
  return preset.id;
};

// 删除自定义预设（内置预设不可删除）
export const deleteVibePreset = async (presetId: string): Promise<void> => {
  const preset = await db.vibePresets.get(presetId);
  if (preset?.builtIn) {
    throw new Error('内置预设不可删除');
  }
  await db.vibePresets.delete(presetId);
};

// 更新自定义预设
export const updateVibePreset = async (
  presetId: string,
  updates: { name?: string; content?: string },
): Promise<void> => {
  await db.vibePresets.update(presetId, { ...updates, updatedAt: Date.now() });
};
