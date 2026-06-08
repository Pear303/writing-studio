/**
 * 生成唯一 ID
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

import type { WordCountSettings } from '../types';

/**
 * 计算文本字数
 */
export const countWords = (text: string, options?: WordCountSettings): number => {
  if (!text) return 0;

  const plainText = text.replace(/<[^>]*>/g, '');

  const { includePunctuation = false, englishMode = 'word' } = options || {};

  let total = 0;

  // 中文字符
  const chineseChars = (plainText.match(/[\u4e00-\u9fa5]/g) || []).length;
  total += chineseChars;

  // 中文标点（可选）
  if (includePunctuation) {
    const punctuation = (plainText.match(/[\u3000-\u303F\uFF00-\uFFEF]/g) || []).length;
    total += punctuation;
  }

  // 英文
  if (englishMode === 'letter') {
    const letters = (plainText.match(/[a-zA-Z]/g) || []).length;
    total += letters;
  } else {
    const words = (plainText.match(/[a-zA-Z]+/g) || []).length;
    total += words;
  }

  // 数字
  const numbers = (plainText.match(/\d+/g) || []).length;
  total += numbers;

  return total;
};

/**
 * 格式化时间戳为可读字符串
 */
export const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

/**
 * 防抖函数
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

/**
 * 节流函数
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * 全角标点转半角
 */
export const convertFullWidthToHalfWidth = (text: string): string => {
  return text.replace(/[\uFF01-\uFF5E]/g, (char) => {
    return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
  });
};

export const clearExtraBlankLines = (text: string): string => {
  // 将连续的多个空段落合并为一个，而不是全部删除
  // 匹配连续的 <p></p> 或 <p><br></p> 等空段落
  return text.replace(/(<p>\s*(<br\s*\/?>)?\s*<\/p>\s*){2,}/g, '<p><br></p>');
};

export const clearExtraSpaces = (text: string): string => {
  return text.replace(/ {2,}/g, ' ');
};

export const applyParagraphStyles = (
  html: string,
  paragraphSpacing: string | null,
  firstLineIndent: string | null
): string => {
  let indentValue = null;
  if (firstLineIndent) {
    if (firstLineIndent === '0') {
      indentValue = null;
    } else if (firstLineIndent.endsWith('char')) {
      const charCount = parseInt(firstLineIndent);
      if (!isNaN(charCount) && charCount > 0) {
        indentValue = `${charCount}em`;
      }
    } else if (firstLineIndent.endsWith('em')) {
      indentValue = firstLineIndent;
    } else {
      const pixels = parseInt(firstLineIndent);
      if (!isNaN(pixels) && pixels > 0) {
        indentValue = `${pixels}px`;
      }
    }
  }

  const styleParts: string[] = [];
  if (paragraphSpacing && paragraphSpacing !== '0px') {
    styleParts.push(`margin-bottom: ${paragraphSpacing}`);
  }
  if (indentValue) {
    styleParts.push(`text-indent: ${indentValue}`);
  }

  if (styleParts.length === 0) {
    return html;
  }

  const styleString = styleParts.join('; ');

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const paragraphs = tempDiv.querySelectorAll('p, div');

  paragraphs.forEach(p => {
    const existingStyle = p.getAttribute('style') || '';
    
    // 从现有样式中移除排版相关属性（text-indent, margin-bottom），防止叠加
    const cleanedStyle = existingStyle
      .replace(/text-indent:\s*[^;]+;?\s*/g, '')
      .replace(/margin-bottom:\s*[^;]+;?\s*/g, '')
      .replace(/;\s*$/, '')
      .trim();
    
    const combinedStyle = [cleanedStyle, styleString].filter(Boolean).join('; ');
    if (combinedStyle) {
      p.setAttribute('style', combinedStyle);
    }
  });

  return tempDiv.innerHTML;
};

// ─── 大纲 Markdown 互转 ────────────────────────────────────────────

import type { OutlineItemData, Book, Chapter } from '../types';

/** OutlineItemData[] → Markdown 缩进列表（每层2空格） */
export const outlineToMarkdown = (items: OutlineItemData[], depth = 0): string => {
  return items
    .map((item) => {
      const indent = '  '.repeat(depth);
      let line = `${indent}- ${item.content}`;
      if (item.children.length > 0) {
        line += '\n' + outlineToMarkdown(item.children, depth + 1);
      }
      return line;
    })
    .join('\n');
};

/** Markdown 缩进列表 → OutlineItemData[] */
export const markdownToOutline = (text: string): OutlineItemData[] => {
  const lines = text.split('\n');
  const root: OutlineItemData[] = [];
  const stack: { items: OutlineItemData[]; depth: number }[] = [
    { items: root, depth: -1 },
  ];

  for (const line of lines) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('- ')) continue;

    const leadingSpaces = line.length - line.trimStart().length;
    const depth = Math.floor(leadingSpaces / 2);
    const content = trimmed.slice(2).trim();

    const item: OutlineItemData = {
      id: generateId(),
      content,
      children: [],
      collapsed: false,
    };

    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }

    stack[stack.length - 1].items.push(item);
    stack.push({ items: item.children, depth });
  }

  return root;
};

const CHINESE_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CHINESE_UNITS = ['', '十', '百', '千'];
const CHINESE_BIG_UNITS = ['', '万', '亿'];

export const numberToChinese = (num: number): string => {
  if (num <= 0) return '零';
  if (num < 10) return CHINESE_DIGITS[num];
  if (num < 20) return (num === 10 ? '十' : '十' + CHINESE_DIGITS[num - 10]);
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    return CHINESE_DIGITS[tens] + '十' + (ones ? CHINESE_DIGITS[ones] : '');
  }
  if (num < 1000) {
    const hundreds = Math.floor(num / 100);
    const remainder = num % 100;
    if (remainder === 0) return CHINESE_DIGITS[hundreds] + '百';
    const tens = Math.floor(remainder / 10);
    const ones = remainder % 10;
    let result = CHINESE_DIGITS[hundreds] + '百';
    if (tens === 0) {
      result += '零' + CHINESE_DIGITS[ones];
    } else {
      result += CHINESE_DIGITS[tens] + '十' + (ones ? CHINESE_DIGITS[ones] : '');
    }
    return result;
  }
  if (num < 10000) {
    const thousands = Math.floor(num / 1000);
    const remainder = num % 1000;
    if (remainder === 0) return CHINESE_DIGITS[thousands] + '千';
    const hundreds = Math.floor(remainder / 100);
    const rest = remainder % 100;
    let result = CHINESE_DIGITS[thousands] + '千';
    if (hundreds === 0) {
      result += '零' + numberToChinese(rest);
    } else {
      result += numberToChinese(remainder);
    }
    return result;
  }
  if (num < 100000000) {
    const wan = Math.floor(num / 10000);
    const remainder = num % 10000;
    let result = numberToChinese(wan) + '万';
    if (remainder > 0) {
      if (remainder < 1000) result += '零';
      result += numberToChinese(remainder);
    }
    return result;
  }
  return num.toString();
};

export const formatChapterNumber = (index: number, format: 'arabic' | 'chinese'): string => {
  if (format === 'chinese') return numberToChinese(index);
  return index.toString();
};

export const generateAutoNumberPrefix = (index: number, format: 'arabic' | 'chinese'): string => {
  return `第${formatChapterNumber(index, format)}章`;
};

const AUTO_NUMBER_PATTERN = /^第[0-9一二三四五六七八九十百千万零〇两壹贰叁肆伍陆柒捌玖拾佰仟]+章\s*/;

export const stripAutoNumberPrefix = (title: string): string => {
  return title.replace(AUTO_NUMBER_PATTERN, '');
};

export const computeChapterDisplayTitle = (
  chapter: Chapter,
  allChapters: Chapter[],
  book: Book
): string => {
  if (!book.autoNumbering) return chapter.title;
  if (chapter.autoNumberExcluded) return chapter.title;

  const format = book.numberingFormat || 'arabic';
  const scope = book.numberingScope || 'global';

  const sortedChapters = [...allChapters].sort((a, b) => a.createdAt - b.createdAt);

  let relevantChapters: Chapter[];
  if (scope === 'volume') {
    relevantChapters = sortedChapters.filter(c =>
      c.volumeId === chapter.volumeId && !c.autoNumberExcluded
    );
  } else {
    relevantChapters = sortedChapters.filter(c => !c.autoNumberExcluded);
  }

  const index = relevantChapters.findIndex(c => c.id === chapter.id);
  if (index === -1) return chapter.title;

  const prefix = generateAutoNumberPrefix(index + 1, format);
  return `${prefix} ${chapter.title}`;
};
