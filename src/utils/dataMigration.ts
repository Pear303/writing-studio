import { exportAllData, importAllData } from '../db';
import { getCurrentUserId } from './userDataManager';

export const migrateDataToUserFolder = async (targetUserId: string): Promise<void> => {
  const currentUserId = getCurrentUserId();
  
  if (!currentUserId || currentUserId === targetUserId) {
    return;
  }

  const data = await exportAllData();
  
  await switchCurrentUser(targetUserId);
  
  try {
    await importAllData(data);
  } catch (error) {
    console.error('数据迁移失败:', error);
    throw error;
  }
};

export const switchCurrentUser = async (userId: string): Promise<void> => {
  localStorage.setItem('currentUserId', userId);
  window.location.reload();
};