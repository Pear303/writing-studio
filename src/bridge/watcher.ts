import { join } from '@tauri-apps/api/path';
import { readDir, readTextFile, exists } from '@tauri-apps/plugin-fs';
import { processPendingActions, type PendingAction } from './importer';
import { exportCurrentBookForAgent, getPendingDir } from './exporter';
import { db, getCurrentUserId } from '../db';

export interface WatcherStatus {
  running: boolean;
  intervalMs: number;
  lastCheckAt: number | null;
  lastResult: {
    processed: number;
    succeeded: number;
    failed: number;
    errors: string[];
  } | null;
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
}

const DEFAULT_INTERVAL_MS = 3000;

let watcherTimer: ReturnType<typeof setInterval> | null = null;
let watcherStatus: WatcherStatus = {
  running: false,
  intervalMs: DEFAULT_INTERVAL_MS,
  lastCheckAt: null,
  lastResult: null,
  totalProcessed: 0,
  totalSucceeded: 0,
  totalFailed: 0,
};

type WatcherCallback = (status: WatcherStatus) => void;
let statusCallback: WatcherCallback | null = null;

// 轮询处理中标志：防止上一次处理未结束时下一次 tick 重入
let processing = false;

// 从 pending action 文件中提取实际受影响的 bookId 集合
async function getAffectedBookIds(): Promise<string[]> {
  try {
    const pendingDir = await getPendingDir();
    if (!(await exists(pendingDir))) return [];

    const entries = await readDir(pendingDir);
    const jsonFiles = entries.filter(e => e.name?.endsWith('.json'));

    const bookIds = new Set<string>();
    const currentUserId = getCurrentUserId();

    for (const entry of jsonFiles) {
      if (!entry.name) continue;
      try {
        const filePath = await join(pendingDir, entry.name);
        const content = await readTextFile(filePath);
        const action = JSON.parse(content) as PendingAction;

        let bookId: string | null = null;
        if (action.action === 'new_chapter') {
          bookId = action.bookId;
        } else if (action.action === 'new_material') {
          bookId = action.bookId || null;
        } else if (action.action === 'update_chapter') {
          const chapter = await db.chapters.get(action.chapterId);
          bookId = chapter?.bookId || null;
        }

        if (bookId) {
          // 校验书籍归属，仅重导当前用户的书
          const book = await db.books.get(bookId);
          if (book && (!currentUserId || !book.userId || book.userId === currentUserId)) {
            bookIds.add(bookId);
          }
        }
      } catch {
        // 单个文件解析失败不影响其它文件
      }
    }

    return [...bookIds];
  } catch {
    return [];
  }
}

export function startWatcher(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (watcherTimer) return;

  watcherStatus.running = true;
  watcherStatus.intervalMs = intervalMs;

  watcherTimer = setInterval(async () => {
    if (processing) return;
    processing = true;
    try {
      const result = await processPendingActions();
      watcherStatus.lastCheckAt = Date.now();
      watcherStatus.lastResult = result;
      watcherStatus.totalProcessed += result.processed;
      watcherStatus.totalSucceeded += result.succeeded;
      watcherStatus.totalFailed += result.failed;

      if (result.succeeded > 0) {
        try {
          const affectedBookIds = await getAffectedBookIds();
          for (const bookId of affectedBookIds) {
            await exportCurrentBookForAgent(bookId);
          }
        } catch (exportErr) {
          console.error('[AgentWatcher] 重新导出数据失败:', exportErr);
        }
      }

      if (result.processed > 0 && statusCallback) {
        statusCallback({ ...watcherStatus });
      }
    } catch (err) {
      console.error('[AgentWatcher] 轮询出错:', err);
    } finally {
      processing = false;
    }
  }, intervalMs);
}

export function stopWatcher(): void {
  if (watcherTimer) {
    clearInterval(watcherTimer);
    watcherTimer = null;
  }
  watcherStatus.running = false;
}

export function getWatcherStatus(): WatcherStatus {
  return { ...watcherStatus };
}

export function onWatcherUpdate(callback: WatcherCallback): void {
  statusCallback = callback;
}

export async function checkNow(): Promise<WatcherStatus> {
  const result = await processPendingActions();
  watcherStatus.lastCheckAt = Date.now();
  watcherStatus.lastResult = result;
  watcherStatus.totalProcessed += result.processed;
  watcherStatus.totalSucceeded += result.succeeded;
  watcherStatus.totalFailed += result.failed;

  if (statusCallback) {
    statusCallback({ ...watcherStatus });
  }

  return { ...watcherStatus };
}
