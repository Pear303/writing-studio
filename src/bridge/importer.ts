import { join } from '@tauri-apps/api/path';
import { readDir, readTextFile, remove, exists } from '@tauri-apps/plugin-fs';
import { db, getCurrentUserId } from '../db';
import { getPendingDir } from './exporter';
import { generateId } from '../utils/helpers';
import { countWords } from '../utils/helpers';
import type { Chapter, Material } from '../types';

function plainTextToHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export interface PendingNewChapter {
  action: 'new_chapter';
  bookId: string;
  volumeId: string;
  title: string;
  content: string;
  detailedOutline?: string;
}

export interface PendingNewMaterial {
  action: 'new_material';
  bookId?: string;
  type: Material['type'];
  name: string;
  description: string;
  fields: Record<string, unknown>;
}

export interface PendingUpdateChapter {
  action: 'update_chapter';
  chapterId: string;
  content?: string;
  title?: string;
  detailedOutline?: string;
}

export type PendingAction = PendingNewChapter | PendingNewMaterial | PendingUpdateChapter;

export async function processPendingActions(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
  errors: string[];
}> {
  const result = { processed: 0, succeeded: 0, failed: 0, errors: [] as string[] };
  const pendingDir = await getPendingDir();

  const dirExists = await exists(pendingDir);
  if (!dirExists) return result;

  const entries = await readDir(pendingDir);
  const jsonFiles = entries.filter(e => e.name?.endsWith('.json'));

  for (const entry of jsonFiles) {
    if (!entry.name) continue;
    result.processed++;

    try {
      const filePath = await join(pendingDir, entry.name);
      const content = await readTextFile(filePath);
      const action = JSON.parse(content) as PendingAction;

      await executeAction(action);
      await remove(filePath);

      result.succeeded++;
    } catch (err) {
      result.failed++;
      result.errors.push(`${entry.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}

async function executeAction(action: PendingAction): Promise<void> {
  switch (action.action) {
    case 'new_chapter':
      await executeNewChapter(action);
      break;
    case 'new_material':
      await executeNewMaterial(action);
      break;
    case 'update_chapter':
      await executeUpdateChapter(action);
      break;
    default:
      throw new Error(`未知的 pending action 类型: ${(action as PendingAction).action}`);
  }
}

async function executeNewChapter(action: PendingNewChapter): Promise<void> {
  const userId = getCurrentUserId();
  const book = await db.books.get(action.bookId);
  if (!book) throw new Error(`书籍不存在: ${action.bookId}`);

  let volumeId = action.volumeId || null;

  if (volumeId) {
    const volume = await db.volumes.get(volumeId);
    if (!volume) {
      const firstVolume = await db.volumes.where('bookId').equals(action.bookId).first();
      if (firstVolume) {
        console.warn(`[Importer] volumeId "${volumeId}" 不存在，自动使用该书第一个卷 "${firstVolume.id}" (${firstVolume.name})`);
        volumeId = firstVolume.id;
      } else {
        console.warn(`[Importer] volumeId "${volumeId}" 不存在且该书无任何卷，章节将不关联卷`);
        volumeId = null;
      }
    }
  } else {
    const firstVolume = await db.volumes.where('bookId').equals(action.bookId).first();
    if (firstVolume) {
      volumeId = firstVolume.id;
    }
  }

  const contentHtml = plainTextToHtml(action.content);
  const wordCount = countWords(action.content);

  const chapter: Chapter = {
    id: generateId(),
    volumeId,
    bookId: action.bookId,
    title: action.title,
    content: contentHtml,
    wordCount,
    detailedOutline: action.detailedOutline,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.chapters.add(chapter);

  const newTotal = (book.totalWords || 0) + wordCount;
  await db.books.update(action.bookId, {
    totalWords: newTotal,
    updatedAt: Date.now(),
  });
}

async function executeNewMaterial(action: PendingNewMaterial): Promise<void> {
  const userId = getCurrentUserId();

  const material: Material = {
    id: generateId(),
    userId: userId || undefined,
    bookId: action.bookId,
    type: action.type,
    name: action.name,
    description: action.description,
    fields: action.fields,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await db.materials.add(material);
}

async function executeUpdateChapter(action: PendingUpdateChapter): Promise<void> {
  const chapter = await db.chapters.get(action.chapterId);
  if (!chapter) throw new Error(`章节不存在: ${action.chapterId}`);

  const updates: Partial<Chapter> = { updatedAt: Date.now() };

  if (action.content !== undefined) {
    updates.content = plainTextToHtml(action.content);
    updates.wordCount = countWords(action.content);
  }
  if (action.title !== undefined) {
    updates.title = action.title;
  }
  if (action.detailedOutline !== undefined) {
    updates.detailedOutline = action.detailedOutline;
  }

  await db.chapters.update(action.chapterId, updates);

  if (action.content !== undefined) {
    const oldWords = chapter.wordCount || 0;
    const newWords = updates.wordCount || 0;
    const diff = newWords - oldWords;

    if (diff !== 0) {
      const book = await db.books.get(chapter.bookId);
      if (book) {
        await db.books.update(chapter.bookId, {
          totalWords: Math.max(0, (book.totalWords || 0) + diff),
          updatedAt: Date.now(),
        });
      }
    }
  }
}
