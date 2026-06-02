import React, { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronUp, ChevronDown, Search, BookOpen, FileText } from 'lucide-react';
import type { Editor } from '@tiptap/react';
import type { Chapter } from '../../types';
import { db } from '../../db';

interface MatchInfo {
  total: number;
  current: number;
}

interface BookSearchResult {
  chapterId: string;
  chapterTitle: string;
  count: number;
  snippet: string;
}

type SearchScope = 'chapter' | 'book';

interface FindReplaceProps {
  editor: Editor | null;
  onFind: (searchText: string, caseSensitive?: boolean) => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onReplace: (searchText: string, replaceText: string, caseSensitive?: boolean) => void;
  onReplaceAll: (searchText: string, replaceText: string, caseSensitive?: boolean) => void;
  onClose: () => void;
  initialSearchText: string;
  currentBookId: string | null;
  onNavigateToChapter: (chapterId: string) => void;
  onBookReplaceAll: (searchText: string, replaceText: string, caseSensitive: boolean, chapterIds: string[]) => Promise<number>;
}

function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || '';
}

function getSnippet(text: string, searchTerm: string, caseSensitive: boolean): string {
  const searchIn = caseSensitive ? text : text.toLowerCase();
  const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();
  const idx = searchIn.indexOf(term);
  if (idx === -1) return text.slice(0, 60);
  const start = Math.max(0, idx - 20);
  const end = Math.min(text.length, idx + searchTerm.length + 40);
  let snippet = text.slice(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

export const FindReplace = ({
  editor,
  onFind,
  onFindNext,
  onFindPrevious,
  onReplace,
  onReplaceAll,
  onClose,
  initialSearchText,
  currentBookId,
  onNavigateToChapter,
  onBookReplaceAll,
}: FindReplaceProps) => {
  const [searchText, setSearchText] = useState(initialSearchText);
  const [replaceText, setReplaceText] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null);
  const [scope, setScope] = useState<SearchScope>('chapter');
  const [bookResults, setBookResults] = useState<BookSearchResult[]>([]);
  const [bookSearching, setBookSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const refreshMatchInfo = useCallback(() => {
    if (!editor || scope !== 'chapter') return;
    const storage = editor.storage.searchReplace;
    if (!storage || !storage.matches || storage.matches.length === 0) {
      setMatchInfo(null);
    } else {
      setMatchInfo({
        total: storage.matches.length,
        current: storage.currentIndex + 1,
      });
    }
  }, [editor, scope]);

  useEffect(() => {
    const interval = setInterval(refreshMatchInfo, 100);
    return () => clearInterval(interval);
  }, [refreshMatchInfo]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const doFind = useCallback(() => {
    if (!searchText) return;
    if (scope === 'chapter') {
      onFind(searchText, caseSensitive);
    } else {
      searchInBook(searchText, caseSensitive);
    }
  }, [searchText, caseSensitive, scope, onFind]);

  const searchInBook = useCallback(async (term: string, cs: boolean) => {
    if (!currentBookId || !term) return;
    setBookSearching(true);
    setBookResults([]);
    try {
      const chapters = await db.chapters.where('bookId').equals(currentBookId).toArray();
      const results: BookSearchResult[] = [];
      for (const ch of chapters) {
        const text = stripHtml(ch.content);
        const searchIn = cs ? text : text.toLowerCase();
        const searchTerm = cs ? term : term.toLowerCase();
        let count = 0;
        let idx = 0;
        while ((idx = searchIn.indexOf(searchTerm, idx)) !== -1) {
          count++;
          idx += 1;
        }
        if (count > 0) {
          results.push({
            chapterId: ch.id,
            chapterTitle: ch.title || '无标题',
            count,
            snippet: getSnippet(text, term, cs),
          });
        }
      }
      results.sort((a, b) => b.count - a.count);
      setBookResults(results);
    } finally {
      setBookSearching(false);
    }
  }, [currentBookId]);

  const handleReplace = useCallback(() => {
    if (searchText && replaceText) {
      onReplace(searchText, replaceText, caseSensitive);
    }
  }, [searchText, replaceText, caseSensitive, onReplace]);

  const handleReplaceAll = useCallback(async () => {
    if (!searchText || !replaceText) return;
    if (scope === 'chapter') {
      onReplaceAll(searchText, replaceText, caseSensitive);
    } else {
      if (bookResults.length === 0) return;
      const totalMatches = bookResults.reduce((sum, r) => sum + r.count, 0);
      if (!confirm(`确定要在全书 ${bookResults.length} 个章节中替换 ${totalMatches} 个匹配项吗？`)) return;
      const chapterIds = bookResults.map(r => r.chapterId);
      const count = await onBookReplaceAll(searchText, replaceText, caseSensitive, chapterIds);
      if (count > 0) {
        setBookResults([]);
        searchInBook(searchText, caseSensitive);
      }
    }
  }, [searchText, replaceText, caseSensitive, scope, bookResults, onReplaceAll, onBookReplaceAll, searchInBook]);

  const handleScopeChange = useCallback((newScope: SearchScope) => {
    setScope(newScope);
    setMatchInfo(null);
    setBookResults([]);
    if (newScope === 'chapter' && editor) {
      const cmds = (editor.commands as any);
      cmds.clearSearch?.();
    }
  }, [editor]);

  const totalBookMatches = bookResults.reduce((sum, r) => sum + r.count, 0);

  return (
    <div
      className="absolute top-0 right-0 bg-vscode-sidebar border-b border-l border-vscode-border p-2 z-50"
      style={{ minWidth: '380px', maxHeight: '80vh', overflowY: 'auto' }}
    >
      <div className="flex items-center gap-1 mb-1.5">
        <input
          ref={inputRef}
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (scope === 'chapter') {
                if (e.shiftKey) {
                  onFindPrevious();
                } else if (matchInfo) {
                  onFindNext();
                } else {
                  doFind();
                }
              } else {
                doFind();
              }
            }
          }}
          placeholder="搜索..."
          className="flex-1 px-2 py-1 text-sm text-vscode-text focus:outline-none focus:border-vscode-active input-field"
        />
        <button
          onClick={doFind}
          className="icon-btn p-1"
          title="搜索"
        >
          <Search size={14} />
        </button>
        {scope === 'chapter' && matchInfo && (
          <span
            className="text-xs whitespace-nowrap px-1"
            style={{ color: 'var(--color-vscode-text, #9ca3af)', minWidth: '40px', textAlign: 'center' }}
          >
            {matchInfo.current}/{matchInfo.total}
          </span>
        )}
        {scope === 'chapter' && (
          <>
            <button
              onClick={onFindPrevious}
              className="icon-btn p-1"
              title="上一个 (Shift+Enter)"
            >
              <ChevronUp size={14} />
            </button>
            <button
              onClick={onFindNext}
              className="icon-btn p-1"
              title="下一个 (Enter)"
            >
              <ChevronDown size={14} />
            </button>
          </>
        )}
        <button
          onClick={onClose}
          className="icon-btn p-1"
          title="关闭 (Esc)"
        >
          <X size={14} />
        </button>
      </div>

      {showReplace && (
        <div className="flex items-center gap-1 mb-1.5">
          <input
            type="text"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleReplace();
              }
            }}
            placeholder="替换为..."
            className="flex-1 px-2 py-1 text-sm text-vscode-text focus:outline-none focus:border-vscode-active input-field"
          />
          <button
            onClick={handleReplace}
            className="icon-btn px-2 py-0.5 text-xs whitespace-nowrap rounded"
          >
            替换
          </button>
          <button
            onClick={handleReplaceAll}
            className="icon-btn px-2 py-0.5 text-xs whitespace-nowrap rounded"
          >
            全部
          </button>
        </div>
      )}

      <div className="flex items-center space-x-3">
        <label className="flex items-center text-xs text-vscode-text cursor-pointer">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(e) => setCaseSensitive(e.target.checked)}
            className="mr-1"
          />
          Aa
        </label>
        <button
          onClick={() => setShowReplace(!showReplace)}
          className="text-xs hover:opacity-80 transition-opacity"
          style={{ color: 'var(--color-vscode-active, #007acc)' }}
        >
          {showReplace ? '隐藏替换' : '替换'}
        </button>
        <div className="flex items-center gap-0.5 ml-auto">
          <button
            onClick={() => handleScopeChange('chapter')}
            className="icon-btn p-1"
            title="当前章节"
            style={scope === 'chapter' ? { background: 'var(--color-hover-bg)' } : {}}
          >
            <FileText size={13} />
          </button>
          <button
            onClick={() => handleScopeChange('book')}
            className="icon-btn p-1"
            title="全书"
            style={scope === 'book' ? { background: 'var(--color-hover-bg)' } : {}}
          >
            <BookOpen size={13} />
          </button>
        </div>
      </div>

      {scope === 'book' && bookSearching && (
        <div className="text-xs mt-1.5" style={{ color: 'var(--color-vscode-text, #9ca3af)' }}>
          搜索中...
        </div>
      )}

      {scope === 'book' && !bookSearching && bookResults.length > 0 && (
        <div className="mt-1.5">
          <div className="text-xs mb-1" style={{ color: 'var(--color-vscode-text, #9ca3af)' }}>
            {bookResults.length} 个章节，共 {totalBookMatches} 处匹配
          </div>
          <div className="space-y-0.5" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {bookResults.map((result) => (
              <button
                key={result.chapterId}
                onClick={() => onNavigateToChapter(result.chapterId)}
                className="w-full text-left px-2 py-1 rounded text-xs hover:opacity-80 transition-opacity"
                style={{
                  backgroundColor: 'var(--color-hover-bg, rgba(255,255,255,0.05))',
                  color: 'var(--color-vscode-text)',
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium truncate" style={{ maxWidth: '70%' }}>{result.chapterTitle}</span>
                  <span style={{ color: 'var(--color-vscode-active, #007acc)' }}>{result.count} 处</span>
                </div>
                <div className="truncate mt-0.5 opacity-60" style={{ fontSize: '11px' }}>
                  {result.snippet}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {scope === 'book' && !bookSearching && searchText && bookResults.length === 0 && (
        <div className="text-xs mt-1.5" style={{ color: 'var(--color-vscode-text, #9ca3af)' }}>
          未找到匹配项
        </div>
      )}
    </div>
  );
};
