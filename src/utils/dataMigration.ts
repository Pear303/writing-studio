import { exportAllData, importAllData, getCurrentUserId } from '../db';

export const migrateDataToUserFolder = async (targetUserId: string): Promise<void> => {
  const currentUserId = getCurrentUserId();
  
  if (!currentUserId || currentUserId === targetUserId) {
    return;
  }

  const data = await exportAllData();

  // 纯状态切换（不触发 reload，避免 importAllData 未执行页面就刷新）
  switchCurrentUser(targetUserId);
  
  try {
    await importAllData(data);
  } catch (error) {
    // 导入失败时回滚当前用户状态
    localStorage.setItem('currentUserId', currentUserId);
    console.error('数据迁移失败:', error);
    throw error;
  }

  // 迁移完成后最后再刷新
  window.location.reload();
};

// 纯状态切换：仅更新当前用户 ID，不触发页面刷新
export const switchCurrentUser = (userId: string): void => {
  localStorage.setItem('currentUserId', userId);
};
