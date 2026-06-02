import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile, readFile } from '@tauri-apps/plugin-fs';
import { db, getCurrentUserId } from '../db';
import { generateId, countWords } from '../utils/helpers';
import type { Book, Volume, Chapter } from '../types';

const DEFAULT_API_URL = 'http://localhost:8000';
const MAX_SAMPLE_CHARS = 25000;
const FALLBACK_CHAPTER_MAX_CHARS = 30000;

export interface NovelStructureAnalysis {
  success: boolean;
  has_volume_structure: boolean;
  volume_pattern: string | null;
  chapter_pattern: string | null;
  volume_chapter_relation: 'nested' | 'flat';
  identified_volumes: Array<{ title: string; position: number }>;
  identified_chapters: Array<{ title: string; position: number }>;
  confidence: 'high' | 'medium' | 'low';
  analysis_note: string;
  error?: string;
}

export interface SplitChapter {
  title: string;
  content: string;
  volumeTitle: string | null;
  order: number;
}

export interface SplitResult {
  volumes: Array<{
    title: string;
    chapters: SplitChapter[];
  }>;
  unassignedChapters: SplitChapter[];
  totalChapters: number;
  totalChars: number;
  strategy: 'regex' | 'fallback';
}

export interface ImportResult {
  bookId: string;
  bookName: string;
  volumeCount: number;
  chapterCount: number;
  totalWords: number;
}

function getApiUrl(): string {
  return localStorage.getItem('agentApiUrl') || DEFAULT_API_URL;
}

export async function selectNovelFile(): Promise<{ path: string; name: string } | null> {
  const selected = await open({
    multiple: false,
    filters: [{
      name: '小说文本',
      extensions: ['txt', 'json', 'md'],
    }],
  });

  if (!selected) return null;

  const path = typeof selected === 'string' ? selected : selected;
  const name = path.split(/[\\/]/).pop() || 'unknown';
  return { path, name };
}

export async function readNovelFile(filePath: string): Promise<string> {
  try {
    const text = await readTextFile(filePath);
    if (text && text.charCodeAt(0) !== 0xFFFD && !text.includes('\uFFFD')) {
      return text;
    }
  } catch (e) {
    console.warn('[novelImport] readTextFile failed, trying readFile with GBK:', e);
  }

  try {
    const uint8Array = await readFile(filePath);
    const decoder = new TextDecoder('utf-8');
    let text = decoder.decode(uint8Array);

    if (!text || text.charCodeAt(0) === 0xFFFD || text.includes('\uFFFD')) {
      const decoderGB = new TextDecoder('gbk');
      text = decoderGB.decode(uint8Array);
    }

    return text;
  } catch (e) {
    console.error('[novelImport] readFile also failed:', e);
    throw new Error('无法读取文件，请检查文件路径和权限');
  }
}

export function extractTextSample(fullText: string, maxChars: number = MAX_SAMPLE_CHARS): string {
  if (fullText.length <= maxChars) return fullText;
  return fullText.slice(0, maxChars);
}

export function extractTextFromJson(jsonText: string): string {
  try {
    const data = JSON.parse(jsonText);

    if (Array.isArray(data)) {
      return extractTextFromJsonArray(data);
    }

    if (typeof data === 'object' && data !== null) {
      const parts: string[] = [];

      if (data.name || data.title) {
        parts.push(`# ${data.name || data.title}`);
      }

      const chapterArrays = ['chapters', 'volumes', 'sections', 'parts', 'contents'];
      for (const key of chapterArrays) {
        if (Array.isArray(data[key])) {
          parts.push(extractTextFromJsonArray(data[key]));
        }
      }

      if (data.content && typeof data.content === 'string') {
        parts.push(data.content);
      }

      if (data.text && typeof data.text === 'string') {
        parts.push(data.text);
      }

      if (data.body && typeof data.body === 'string') {
        parts.push(data.body);
      }

      if (parts.length > 0) {
        return parts.filter(Boolean).join('\n\n');
      }

      return flattenJsonToString(data);
    }

    return jsonText;
  } catch {
    return jsonText;
  }
}

function extractTextFromJsonArray(arr: unknown[]): string {
  const parts: string[] = [];
  for (const item of arr) {
    if (typeof item === 'string') {
      parts.push(item);
    } else if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      const title = obj.title || obj.name || obj.chapter_title || '';
      const content = obj.content || obj.text || obj.body || obj.chapter_content || '';

      if (title && typeof title === 'string') {
        parts.push(title);
      }
      if (content && typeof content === 'string') {
        parts.push(content);
      }
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

function flattenJsonToString(obj: unknown, depth: number = 0): string {
  if (depth > 3) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj !== 'object' || obj === null) return '';

  const parts: string[] = [];
  const record = obj as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (typeof value === 'string' && value.length > 20) {
      parts.push(value);
    } else if (typeof value === 'object' && value !== null) {
      const sub = flattenJsonToString(value, depth + 1);
      if (sub) parts.push(sub);
    }
  }

  return parts.join('\n\n');
}

export async function analyzeNovelStructure(
  textSample: string,
  filename: string,
  textLength: number
): Promise<NovelStructureAnalysis> {
  const apiUrl = getApiUrl();
  const url = `${apiUrl}/api/novel-import/analyze`;

  console.log(`[novelImport] Calling Agent API: ${url}`);
  console.log(`[novelImport] Sample length: ${textSample.length}, Text length: ${textLength}, Filename: ${filename}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text_sample: textSample,
        filename,
        text_length: textLength,
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.error(`[novelImport] API returned ${res.status}: ${errorText}`);
      throw new Error(`API请求失败(${res.status}): ${errorText || res.statusText}`);
    }

    const data = await res.json();
    console.log(`[novelImport] Agent analysis result:`, {
      success: data.success,
      has_volume: data.has_volume_structure,
      chapter_pattern: data.chapter_pattern,
      confidence: data.confidence,
      note: data.analysis_note,
      error: data.error,
    });

    return data;
  } catch (err) {
    console.error(`[novelImport] analyzeNovelStructure failed:`, err);
    return {
      success: false,
      has_volume_structure: false,
      volume_pattern: null,
      chapter_pattern: null,
      volume_chapter_relation: 'flat',
      identified_volumes: [],
      identified_chapters: [],
      confidence: 'low',
      analysis_note: '',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function splitNovelText(
  fullText: string,
  analysis: NovelStructureAnalysis
): SplitResult {
  const totalChars = fullText.length;

  if (
    analysis.success &&
    analysis.chapter_pattern
  ) {
    const result = splitByRegex(fullText, analysis);
    if (result.totalChapters > 0) {
      return result;
    }
  }

  return splitByFallback(fullText);
}

function splitByRegex(fullText: string, analysis: NovelStructureAnalysis): SplitResult {
  const totalChars = fullText.length;
  const volumes: Array<{ title: string; chapters: SplitChapter[] }> = [];
  const unassignedChapters: SplitChapter[] = [];
  let totalChapters = 0;

  let volumeRegex: RegExp | null = null;
  let chapterRegex: RegExp | null = null;

  try {
    if (analysis.volume_pattern) {
      const pattern = analysis.volume_pattern.replace(/\(\?P<(\w+)>/g, '(?<$1>');
      volumeRegex = new RegExp(pattern, 'gm');
    }
  } catch {
    volumeRegex = null;
  }

  try {
    if (analysis.chapter_pattern) {
      const pattern = analysis.chapter_pattern.replace(/\(\?P<(\w+)>/g, '(?<$1>');
      chapterRegex = new RegExp(pattern, 'gm');
    }
  } catch {
    chapterRegex = null;
  }

  if (!chapterRegex) {
    return { volumes: [], unassignedChapters: [], totalChapters: 0, totalChars: fullText.length, strategy: 'regex' };
  }

  const volumeMatches = volumeRegex ? findAllMatches(fullText, volumeRegex) : [];
  const chapterMatches = findAllMatches(fullText, chapterRegex);

  if (chapterMatches.length === 0) {
    return { volumes: [], unassignedChapters: [], totalChapters: 0, totalChars: fullText.length, strategy: 'regex' };
  }

  if (volumeMatches.length > 0 && analysis.has_volume_structure) {
    const isNested = analysis.volume_chapter_relation === 'nested';

    for (let vi = 0; vi < volumeMatches.length; vi++) {
      const volMatch = volumeMatches[vi];
      const volStart = volMatch.index + volMatch.match.length;
      const volEnd = vi < volumeMatches.length - 1 ? volumeMatches[vi + 1].index : fullText.length;
      const volTitle = volMatch.title;

      const volChapters: SplitChapter[] = [];

      if (isNested) {
        for (const chMatch of chapterMatches) {
          if (chMatch.index >= volMatch.index && chMatch.index < volEnd) {
            const chStart = chMatch.index + chMatch.match.length;
            let chEnd = fullText.length;

            const nextChInVol = chapterMatches.find(
              c => c.index > chMatch.index && c.index < volEnd
            );
            if (nextChInVol) {
              chEnd = nextChInVol.index;
            } else {
              chEnd = volEnd;
            }

            const content = fullText.slice(chStart, chEnd).trim();
            volChapters.push({
              title: chMatch.title,
              content,
              volumeTitle: volTitle,
              order: volChapters.length,
            });
          }
        }
      } else {
        for (const chMatch of chapterMatches) {
          if (chMatch.index >= volMatch.index && chMatch.index < volEnd) {
            const chStart = chMatch.index + chMatch.match.length;
            let chEnd = fullText.length;

            const nextCh = chapterMatches.find(c => c.index > chMatch.index);
            if (nextCh && nextCh.index < volEnd) {
              chEnd = nextCh.index;
            } else {
              chEnd = volEnd;
            }

            const content = fullText.slice(chStart, chEnd).trim();
            volChapters.push({
              title: chMatch.title,
              content,
              volumeTitle: volTitle,
              order: volChapters.length,
            });
          }
        }
      }

      volumes.push({ title: volTitle, chapters: volChapters });
      totalChapters += volChapters.length;
    }

    const assignedChapterIndices = new Set<number>();
    for (const vol of volumes) {
      for (const ch of vol.chapters) {
        const idx = chapterMatches.findIndex(m => m.title === ch.title);
        if (idx >= 0) assignedChapterIndices.add(idx);
      }
    }

    for (let i = 0; i < chapterMatches.length; i++) {
      if (!assignedChapterIndices.has(i)) {
        const chMatch = chapterMatches[i];
        const chStart = chMatch.index + chMatch.match.length;
        const chEnd = i < chapterMatches.length - 1 ? chapterMatches[i + 1].index : fullText.length;
        const content = fullText.slice(chStart, chEnd).trim();
        unassignedChapters.push({
          title: chMatch.title,
          content,
          volumeTitle: null,
          order: unassignedChapters.length,
        });
        totalChapters++;
      }
    }
  } else {
    for (let i = 0; i < chapterMatches.length; i++) {
      const chMatch = chapterMatches[i];
      const chStart = chMatch.index + chMatch.match.length;
      const chEnd = i < chapterMatches.length - 1 ? chapterMatches[i + 1].index : fullText.length;
      const content = fullText.slice(chStart, chEnd).trim();
      unassignedChapters.push({
        title: chMatch.title,
        content,
        volumeTitle: null,
        order: i,
      });
    }
    totalChapters = unassignedChapters.length;
  }

  return {
    volumes,
    unassignedChapters,
    totalChapters,
    totalChars,
    strategy: 'regex',
  };
}

interface MatchResult {
  index: number;
  match: string;
  title: string;
}

function findAllMatches(text: string, regex: RegExp): MatchResult[] {
  const results: MatchResult[] = [];
  let match: RegExpExecArray | null;

  const re = new RegExp(regex.source, regex.flags);

  while ((match = re.exec(text)) !== null) {
    const title = match.groups?.title || match[1] || match[0].trim();
    results.push({
      index: match.index,
      match: match[0],
      title: title.trim(),
    });

    if (match.index + match[0].length >= text.length) break;
  }

  return results;
}

function splitByFallback(fullText: string): SplitResult {
  const unassignedChapters: SplitChapter[] = [];
  const paragraphs = fullText.split(/\n{2,}/);
  let currentContent = '';
  let chapterIndex = 0;

  for (const para of paragraphs) {
    if (currentContent.length + para.length + 2 > FALLBACK_CHAPTER_MAX_CHARS && currentContent.length > 0) {
      unassignedChapters.push({
        title: `第${chapterIndex + 1}章`,
        content: currentContent.trim(),
        volumeTitle: null,
        order: chapterIndex,
      });
      chapterIndex++;
      currentContent = para;
    } else {
      currentContent += (currentContent ? '\n\n' : '') + para;
    }
  }

  if (currentContent.trim()) {
    unassignedChapters.push({
      title: `第${chapterIndex + 1}章`,
      content: currentContent.trim(),
      volumeTitle: null,
      order: chapterIndex,
    });
  }

  return {
    volumes: [],
    unassignedChapters,
    totalChapters: unassignedChapters.length,
    totalChars: fullText.length,
    strategy: 'fallback',
  };
}

function plainTextToHtml(text: string): string {
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text
    .split(/\n{2,}/)
    .map(para => `<p>${para.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
}

export async function importSplitResult(
  splitResult: SplitResult,
  bookName: string,
  bookDescription?: string
): Promise<ImportResult> {
  const userId = getCurrentUserId() || undefined;
  const now = Date.now();

  const book: Book = {
    id: generateId(),
    userId,
    name: bookName,
    description: bookDescription || '',
    totalWords: 0,
    status: 'ongoing',
    createdAt: now,
    updatedAt: now,
  };

  await db.books.add(book);

  let totalWords = 0;
  let chapterOrder = 0;
  const volumeIdMap = new Map<string, string>();

  for (const vol of splitResult.volumes) {
    const volumeId = generateId();
    volumeIdMap.set(vol.title, volumeId);

    const volume: Volume = {
      id: volumeId,
      bookId: book.id,
      parentId: null,
      name: vol.title,
      order: splitResult.volumes.indexOf(vol),
    };

    await db.volumes.add(volume);

    for (const ch of vol.chapters) {
      const contentHtml = plainTextToHtml(ch.content);
      const wordCount = countWords(ch.content);

      const chapter: Chapter = {
        id: generateId(),
        volumeId,
        bookId: book.id,
        title: ch.title,
        content: contentHtml,
        wordCount,
        order: chapterOrder++,
        createdAt: now,
        updatedAt: now,
      };

      await db.chapters.add(chapter);
      totalWords += wordCount;
    }
  }

  if (splitResult.unassignedChapters.length > 0) {
    let defaultVolumeId: string | null = null;

    if (splitResult.volumes.length === 0 && splitResult.unassignedChapters.length > 1) {
      defaultVolumeId = generateId();
      const defaultVolume: Volume = {
        id: defaultVolumeId,
        bookId: book.id,
        parentId: null,
        name: '正文',
        order: splitResult.volumes.length,
      };
      await db.volumes.add(defaultVolume);
    }

    for (const ch of splitResult.unassignedChapters) {
      const contentHtml = plainTextToHtml(ch.content);
      const wordCount = countWords(ch.content);

      const chapter: Chapter = {
        id: generateId(),
        volumeId: defaultVolumeId,
        bookId: book.id,
        title: ch.title,
        content: contentHtml,
        wordCount,
        order: chapterOrder++,
        createdAt: now,
        updatedAt: now,
      };

      await db.chapters.add(chapter);
      totalWords += wordCount;
    }
  }

  await db.books.update(book.id, {
    totalWords,
    updatedAt: Date.now(),
  });

  const volumeCount = splitResult.volumes.length + (splitResult.unassignedChapters.length > 0 && splitResult.volumes.length === 0 ? 1 : 0);

  return {
    bookId: book.id,
    bookName: book.name,
    volumeCount,
    chapterCount: splitResult.totalChapters,
    totalWords,
  };
}

export function generatePreviewText(splitResult: SplitResult): string {
  const lines: string[] = [];

  if (splitResult.strategy === 'fallback') {
    lines.push(`⚠️ 未能识别章节结构，采用兜底策略（每章上限${FALLBACK_CHAPTER_MAX_CHARS / 1000}万字 + 段落切分）`);
  } else {
    lines.push('✅ 已识别章节结构');
  }

  lines.push(`📊 共 ${splitResult.totalChapters} 章，${splitResult.totalChars} 字`);
  lines.push('');

  if (splitResult.volumes.length > 0) {
    for (const vol of splitResult.volumes) {
      lines.push(`📖 ${vol.title}（${vol.chapters.length} 章）`);
      for (const ch of vol.chapters.slice(0, 5)) {
        lines.push(`   · ${ch.title}（${ch.content.length} 字）`);
      }
      if (vol.chapters.length > 5) {
        lines.push(`   ... 还有 ${vol.chapters.length - 5} 章`);
      }
      lines.push('');
    }
  }

  if (splitResult.unassignedChapters.length > 0) {
    lines.push(`📝 未归卷章节（${splitResult.unassignedChapters.length} 章）`);
    for (const ch of splitResult.unassignedChapters.slice(0, 10)) {
      lines.push(`   · ${ch.title}（${ch.content.length} 字）`);
    }
    if (splitResult.unassignedChapters.length > 10) {
      lines.push(`   ... 还有 ${splitResult.unassignedChapters.length - 10} 章`);
    }
  }

  return lines.join('\n');
}
