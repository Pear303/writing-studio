import { db, getCurrentUserId } from '../db';
import { generateId } from '../utils/helpers';

/**
 * 将大纲数据写入书籍的卷/章结构。
 * ImitationService 和 DeconstructionSeeder 共用此模块。
 */
export class BookStructureWriter {
  /**
   * 创建新书并写入章节大纲
   */
  async createBookWithChapters(
    bookName: string,
    chapters: Array<{
      title: string;
      detailedOutline?: string;
      order: number;
      estimatedWordCount?: number;
    }>,
    options?: {
      volumeName?: string;
      volumeOutline?: string;
    },
  ): Promise<string> {
    const userId = await getCurrentUserId();
    const bookId = generateId();

    await db.books.add({
      id: bookId,
      name: bookName,
      userId: userId || 'unknown',
      totalWords: chapters.reduce((sum, ch) => sum + (ch.estimatedWordCount || 0), 0),
      status: 'ongoing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 创建默认卷
    const volumeId = generateId();
    await db.volumes.add({
      id: volumeId,
      bookId,
      name: options?.volumeName || '正文',
      order: 0,
      outline: options?.volumeOutline,
    });

    // 创建章节
    for (const ch of chapters) {
      await db.chapters.add({
        id: generateId(),
        bookId,
        volumeId,
        title: ch.title,
        content: '',
        order: ch.order,
        detailedOutline: ch.detailedOutline,
        wordCount: ch.estimatedWordCount || 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    return bookId;
  }

  /**
   * 将章节大纲写入已有书籍
   */
  async writeChaptersToBook(
    bookId: string,
    chapters: Array<{
      title: string;
      detailedOutline?: string;
      order: number;
      estimatedWordCount?: number;
    }>,
    options?: {
      volumeName?: string;
      volumeOutline?: string;
      overwriteExisting?: boolean;
    },
  ): Promise<string[]> {
    const book = await db.books.get(bookId);
    if (!book) throw new Error(`书籍 ${bookId} 不存在`);

    // 查找或创建卷
    let volumeId: string;
    const existingVolumes = await db.volumes.where('bookId').equals(bookId).toArray();

    if (existingVolumes.length > 0) {
      volumeId = existingVolumes[0].id;
    } else {
      volumeId = generateId();
      await db.volumes.add({
        id: volumeId,
        bookId,
        name: options?.volumeName || '正文',
        order: 0,
        outline: options?.volumeOutline,
      });
    }

    const chapterIds: string[] = [];

    for (const ch of chapters) {
      if (options?.overwriteExisting) {
        const existing = await db.chapters
          .where('bookId')
          .equals(bookId)
          .and(c => c.order === ch.order)
          .first();

        if (existing) {
          await db.chapters.update(existing.id, {
            title: ch.title,
            detailedOutline: ch.detailedOutline || existing.detailedOutline,
          });
          chapterIds.push(existing.id);
          continue;
        }
      }

      const chapterId = generateId();
      await db.chapters.add({
        id: chapterId,
        bookId,
        volumeId,
        title: ch.title,
        content: '',
        order: ch.order,
        detailedOutline: ch.detailedOutline,
        wordCount: ch.estimatedWordCount || 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      chapterIds.push(chapterId);
    }

    return chapterIds;
  }
}

export const bookStructureWriter = new BookStructureWriter();
