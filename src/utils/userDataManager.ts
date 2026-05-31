import { join, appDataDir } from '@tauri-apps/api/path';
import { mkdir, exists, remove } from '@tauri-apps/plugin-fs';

// 用户数据结构定义
export interface UserDataStructure {
    userId: string;
    // 用户数据的子文件夹路径
    folders: {
        books: string;
        chapters: string;
        materials: string;
        settings: string;
        backups: string;
    };
}

// 获取用户数据路径
export const getUserDataPath = async (userId: string): Promise<string> => {
  const appData = await appDataDir();
  return await join(appData, 'users', userId);
};

// 创建用户数据文件夹
export const createUserFolders = async (userId: string): Promise<UserDataStructure> => {
  const basePath = await getUserDataPath(userId);
  
  const folders = {
    books: await join(basePath, 'books'),
    chapters: await join(basePath, 'chapters'),
    materials: await join(basePath, 'materials'),
    settings: await join(basePath, 'settings'),
    backups: await join(basePath, 'backups'),
  };

  for (const folder of Object.values(folders)) {
    const folderExists = await exists(folder);
    if (!folderExists) {
      await mkdir(folder, { recursive: true });
    }
  }

  return { userId, folders };
};

export const switchUserFolder = async(userId: string): Promise<void> => { 
    localStorage.setItem('currentUserId', userId);
}

// 获取当前用户ID
export const getCurrentUserId = (): string | null => {
  return localStorage.getItem('currentUserId');
}

export const deleteUserFolders = async (userId: string): Promise<void> => {
  const basePath = await getUserDataPath(userId);
  const folderExists = await exists(basePath);
  if (folderExists) {
    await remove(basePath, { recursive: true });
  }
};