import { processPendingActions } from './importer';

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

export function startWatcher(intervalMs: number = DEFAULT_INTERVAL_MS): void {
  if (watcherTimer) return;

  watcherStatus.running = true;
  watcherStatus.intervalMs = intervalMs;

  watcherTimer = setInterval(async () => {
    try {
      const result = await processPendingActions();
      watcherStatus.lastCheckAt = Date.now();
      watcherStatus.lastResult = result;
      watcherStatus.totalProcessed += result.processed;
      watcherStatus.totalSucceeded += result.succeeded;
      watcherStatus.totalFailed += result.failed;

      if (result.processed > 0 && statusCallback) {
        statusCallback({ ...watcherStatus });
      }
    } catch (err) {
      console.error('[AgentWatcher] 轮询出错:', err);
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
