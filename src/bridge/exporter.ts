import { join } from '@tauri-apps/api/path';
import { invoke } from '@tauri-apps/api/core';
import { mkdir, exists, writeTextFile, readTextFile, readDir, remove } from '@tauri-apps/plugin-fs';
import type { Book, Volume, Chapter, Material, OutlineItemData } from '../types';
import { db, getCurrentUserId } from '../db';
import { outlineToMarkdown } from '../utils/helpers';

export interface ExportManifest {
  exportedAt: number;
  userId: string | null;
  books: Array<{
    id: string;
    name: string;
    status: string;
    totalWords: number;
    volumeCount: number;
    chapterCount: number;
  }>;
}

const PENDING_DIR_NAME = 'pending';

let _cachedStudioDataDir: string | null = null;

export async function getStudioDataDir(): Promise<string> {
  if (_cachedStudioDataDir) return _cachedStudioDataDir;
  const projectRoot = await invoke<string>('get_project_root');
  _cachedStudioDataDir = await join(projectRoot, 'agent-by-langchain', 'studio-data');
  return _cachedStudioDataDir;
}

export async function getPendingDir(): Promise<string> {
  const dataDir = await getStudioDataDir();
  return await join(dataDir, PENDING_DIR_NAME);
}

async function ensureDir(dirPath: string): Promise<void> {
  const dirExists = await exists(dirPath);
  if (!dirExists) {
    await mkdir(dirPath, { recursive: true });
  }
}

async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeTextFile(filePath, JSON.stringify(data, null, 2));
}

async function writeMd(filePath: string, content: string): Promise<void> {
  await writeTextFile(filePath, content);
}

function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = String(item[key]);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

export async function exportBookForAgent(bookId: string, targetDir?: string): Promise<string> {
  const dataDir = targetDir || await getStudioDataDir();
  const book = await db.books.get(bookId);
  if (!book) throw new Error(`书籍不存在: ${bookId}`);

  const userId = getCurrentUserId();
  const volumes = await db.volumes.where('bookId').equals(bookId).toArray();
  const chapters = await db.chapters.where('bookId').equals(bookId).toArray();
  const materials = await db.materials
    .filter(m => m.userId === userId && (!m.bookId || m.bookId === bookId))
    .toArray();

  const bookDir = await join(dataDir, 'books', bookId);
  const chaptersDir = await join(bookDir, 'chapters');
  const outlinesDir = await join(bookDir, 'detailed_outlines');
  const materialsDir = await join(bookDir, 'materials');

  await ensureDir(bookDir);
  await ensureDir(chaptersDir);
  await ensureDir(outlinesDir);
  await ensureDir(materialsDir);

  await writeJson(await join(bookDir, 'book.json'), book);
  await writeJson(await join(bookDir, 'volumes.json'), volumes);

  for (const vol of volumes) {
    if (vol.outline) {
      try {
        const outlineData = JSON.parse(vol.outline) as OutlineItemData[];
        const md = outlineToMarkdown(outlineData);
        await writeMd(await join(bookDir, `outline_${vol.id}.md`), md);
      } catch {
        await writeMd(await join(bookDir, `outline_${vol.id}.md`), vol.outline);
      }
    }
  }

  for (const ch of chapters) {
    const chapterMd = `# ${ch.title}\n\n${ch.content}`;
    await writeMd(await join(chaptersDir, `chapter_${ch.id}.md`), chapterMd);

    if (ch.detailedOutline) {
      await writeMd(await join(outlinesDir, `chapter_${ch.id}_outline.md`), ch.detailedOutline);
    }
  }

  const materialsByType = groupBy(materials, 'type');
  for (const [type, items] of Object.entries(materialsByType)) {
    await writeJson(await join(materialsDir, `${type}s.json`), items);
  }

  return bookDir;
}

export async function exportAllBooksForAgent(targetDir?: string): Promise<string> {
  const dataDir = targetDir || await getStudioDataDir();
  const userId = getCurrentUserId();

  await ensureDir(dataDir);
  await ensureDir(await join(dataDir, 'books'));
  await ensureDir(await getPendingDir());

  let books = await db.books.toArray();
  if (userId) {
    books = books.filter(b => b.userId === userId);
  }

  const manifest: ExportManifest = {
    exportedAt: Date.now(),
    userId,
    books: [],
  };

  for (const book of books) {
    const volumes = await db.volumes.where('bookId').equals(book.id).toArray();
    const chapters = await db.chapters.where('bookId').equals(book.id).toArray();

    manifest.books.push({
      id: book.id,
      name: book.name,
      status: book.status,
      totalWords: book.totalWords,
      volumeCount: volumes.length,
      chapterCount: chapters.length,
    });

    await exportBookForAgent(book.id, dataDir);
  }

  await writeJson(await join(dataDir, 'manifest.json'), manifest);

  return dataDir;
}

export async function exportCurrentBookForAgent(bookId: string | null): Promise<string | null> {
  if (!bookId) return null;
  const dataDir = await getStudioDataDir();
  await ensureDir(dataDir);
  await ensureDir(await join(dataDir, 'books'));
  await ensureDir(await getPendingDir());

  await exportBookForAgent(bookId, dataDir);

  const userId = getCurrentUserId();
  const book = await db.books.get(bookId);
  if (!book) return null;

  const volumes = await db.volumes.where('bookId').equals(bookId).toArray();
  const chapters = await db.chapters.where('bookId').equals(bookId).toArray();

  const manifest: ExportManifest = {
    exportedAt: Date.now(),
    userId,
    books: [{
      id: book.id,
      name: book.name,
      status: book.status,
      totalWords: book.totalWords,
      volumeCount: volumes.length,
      chapterCount: chapters.length,
    }],
  };

  await writeJson(await join(dataDir, 'manifest.json'), manifest);

  return dataDir;
}
