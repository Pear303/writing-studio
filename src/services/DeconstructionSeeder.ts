import type { BookDeconstructionResult } from '../types/book-deconstruction';
import { db, getCurrentUserId } from '../db';
import { bookStructureWriter } from './BookStructureWriter';

/**
 * 将拆书结果作为种子数据导入到 Pipeline 中，
 * 创建对应的书籍、卷、章节结构，并将骨架/细拆数据写入大纲。
 */
export class DeconstructionSeeder {
  /**
   * 将拆书结果导入为可用的书籍结构
   */
  async seed(result: BookDeconstructionResult): Promise<string> {
    const bookId = result.bookId;

    // 检查书籍是否已存在
    const existingBook = await db.books.get(bookId);
    if (existingBook) {
      await this.enrichExistingBook(result);
      return bookId;
    }

    // 创建新书籍 + 卷 + 章节（复用 BookStructureWriter）
    const title = result.skeleton?.meta.title || result.sourceFileName;
    const skeleton = result.skeleton;

    const chapters = skeleton
      ? skeleton.chapterSkeletons.map((cs, i) => {
          const facts = result.chapterFacts.find(
            (f) => f.chapterIndex === cs.index,
          );
          return {
            title: cs.title,
            detailedOutline: facts?.summary || cs.oneLineSummary,
            order: i,
            estimatedWordCount: cs.estimatedWordCount || 0,
          };
        })
      : [];

    const newBookId = await bookStructureWriter.createBookWithChapters(
      title,
      chapters,
      {
        volumeName: '正文',
        volumeOutline: skeleton ? this.buildOutlineFromSkeleton(skeleton) : undefined,
      },
    );

    // 使用 result.bookId 作为书籍 ID（保持兼容）
    // 在事务中完成主键替换，避免中间崩溃导致数据丢失
    if (newBookId !== bookId) {
      await db.transaction('rw', [db.books, db.volumes, db.chapters, db.chapterStateCommits], async () => {
        const oldBook = await db.books.get(newBookId);
        if (oldBook) {
          const newBook = { ...oldBook, id: bookId };
          await db.books.delete(newBookId);
          await db.books.add(newBook);
        }
        const volumes = await db.volumes.where('bookId').equals(newBookId).toArray();
        for (const vol of volumes) {
          await db.volumes.update(vol.id, { bookId });
        }
        const chs = await db.chapters.where('bookId').equals(newBookId).toArray();
        for (const ch of chs) {
          await db.chapters.update(ch.id, { bookId });
        }
        const commits = await db.chapterStateCommits.where('bookId').equals(newBookId).toArray();
        for (const commit of commits) {
          await db.chapterStateCommits.update(commit.id, { bookId });
        }
      });
    }

    return bookId;
  }

  private async enrichExistingBook(result: BookDeconstructionResult): Promise<void> {
    const bookId = result.bookId;

    // 将骨架大纲写入对应卷
    if (result.skeleton) {
      const volumes = await db.volumes.where('bookId').equals(bookId).toArray();

      for (const vol of volumes) {
        if (vol.outline) continue;

        const outlineParts: string[] = [];
        outlineParts.push(`# ${vol.name}\n`);

        for (const cs of result.skeleton.chapterSkeletons) {
          outlineParts.push(`## ${cs.title}\n${cs.oneLineSummary}\n`);
        }

        await db.volumes.update(vol.id, {
          outline: outlineParts.join('\n'),
        });
      }
    }

    // 将事实数据写入章节
    const allChapters = await db.chapters
      .where('bookId')
      .equals(bookId)
      .toArray();

    for (const facts of result.chapterFacts) {
      const chapterIdx = facts.chapterIndex;
      if (chapterIdx == null) continue;

      const chapter = allChapters.find((ch) => ch.order === chapterIdx);
      if (chapter && !chapter.detailedOutline) {
        await db.chapters.update(chapter.id, {
          detailedOutline: facts.summary,
        });
      }
    }
  }

  private buildOutlineFromSkeleton(skeleton: import('../types/book-deconstruction').BookSkeleton): string {
    const parts: string[] = [];
    parts.push(`# ${skeleton.meta.title}\n`);
    parts.push(`**类型**：${skeleton.meta.genre}（${skeleton.meta.subGenres.join('、')}）`);
    parts.push(`**核心冲突**：${skeleton.coreConflict}`);
    parts.push(`**主题**：${skeleton.themes.join('、')}`);
    parts.push(`**结构**：${skeleton.structureType} — ${skeleton.structureDescription}\n`);

    for (const cs of skeleton.chapterSkeletons) {
      parts.push(`## 第${cs.index + 1}章：${cs.title}`);
      parts.push(cs.oneLineSummary);
      parts.push(`角色：${cs.role} | 类型：${cs.chapterType} | 关键人物：${cs.majorCharacters.join('、')}`);
      parts.push(`关键事件：${cs.keyEvent}\n`);
    }

    if (skeleton.suspenseLines.length > 0) {
      parts.push(`---\n## 悬念线`);
      for (const sl of skeleton.suspenseLines) {
        parts.push(`- [${sl.type === 'main' ? '主线' : '副线'}] ${sl.description}（第${sl.raisedInChapter + 1}章提出${sl.resolvedInChapter != null ? `，第${sl.resolvedInChapter + 1}章解决` : '，未解决'}）`);
      }
    }

    return parts.join('\n');
  }
}

export const deconstructionSeeder = new DeconstructionSeeder();
