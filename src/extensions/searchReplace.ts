import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/core';

export interface SearchMatch {
  from: number;
  to: number;
}

interface SearchReplaceMeta {
  searchTerm: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentIndex: number;
}

export { type SearchReplaceMeta };

export const searchReplacePluginKey = new PluginKey<DecorationSet>('searchReplace');

interface SearchReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
  caseSensitive: boolean;
  matches: SearchMatch[];
  currentIndex: number;
}

export interface SearchReplaceCommands {
  searchInDocument(searchTerm: string, caseSensitive?: boolean): number;
  nextSearchMatch(): boolean;
  previousSearchMatch(): boolean;
  replaceSearchMatch(replaceTerm: string): boolean;
  replaceAllSearchMatches(replaceTerm: string): number;
  clearSearch(): boolean;
}

export function getSearchReplaceCommands(
  editor: Editor | null,
): SearchReplaceCommands | undefined {
  if (!editor) return undefined;
  const cmds = editor.commands as any;
  return {
    searchInDocument: (term, cs) => (cmds.searchInDocument?.(term, cs) as number) ?? 0,
    nextSearchMatch: () => (cmds.nextSearchMatch?.() as boolean) ?? false,
    previousSearchMatch: () => (cmds.previousSearchMatch?.() as boolean) ?? false,
    replaceSearchMatch: (t) => (cmds.replaceSearchMatch?.(t) as boolean) ?? false,
    replaceAllSearchMatches: (t) => (cmds.replaceAllSearchMatches?.(t) as number) ?? 0,
    clearSearch: () => (cmds.clearSearch?.() as boolean) ?? false,
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    searchInDocument: (searchTerm: string, caseSensitive?: boolean) => ReturnType;
    nextSearchMatch: () => ReturnType;
    previousSearchMatch: () => ReturnType;
    replaceSearchMatch: (replaceTerm: string) => ReturnType;
    replaceAllSearchMatches: (replaceTerm: string) => ReturnType;
    clearSearch: () => ReturnType;
  }

  interface Storage {
    searchReplace: SearchReplaceStorage;
  }
}

function findAllMatches(
  doc: ProseMirrorNode,
  searchTerm: string,
  caseSensitive: boolean,
): SearchMatch[] {
  const matches: SearchMatch[] = [];
  if (!searchTerm) return matches;

  const term = caseSensitive ? searchTerm : searchTerm.toLowerCase();

  doc.descendants((node, pos) => {
    if (node.isText) {
      const text = node.text || '';
      const searchIn = caseSensitive ? text : text.toLowerCase();
      let idx = 0;
      while ((idx = searchIn.indexOf(term, idx)) !== -1) {
        matches.push({ from: pos + idx, to: pos + idx + searchTerm.length });
        idx += searchTerm.length;
      }
    }
    return true;
  });

  return matches;
}

function computeDecorations(doc: ProseMirrorNode, meta: SearchReplaceMeta): DecorationSet {
  if (!meta.searchTerm || meta.matches.length === 0) {
    return DecorationSet.empty;
  }

  const docSize = doc.content.size;

  const decos: Decoration[] = [];
  for (let i = 0; i < meta.matches.length; i++) {
    const match = meta.matches[i];
    if (match.from < 0 || match.to > docSize || match.from >= match.to) {
      continue;
    }
    const isCurrent = i === meta.currentIndex;
    decos.push(
      Decoration.inline(match.from, match.to, {
        class: isCurrent ? 'search-match-current' : 'search-match',
      }),
    );
  }

  try {
    return DecorationSet.create(doc, decos);
  } catch {
    return DecorationSet.empty;
  }
}

export const SearchReplaceExtension = Extension.create({
  name: 'searchReplace',

  addStorage(): SearchReplaceStorage {
    return {
      searchTerm: '',
      replaceTerm: '',
      caseSensitive: false,
      matches: [],
      currentIndex: -1,
    };
  },

  addCommands() {
    const pluginKey = searchReplacePluginKey;

    return {
      searchInDocument:
        (searchTerm: string, caseSensitive: boolean = false) =>
        ({ editor }: { editor: Editor }) => {
          const { doc } = editor.state;
          const matches = findAllMatches(doc, searchTerm, caseSensitive);
          const currentIndex = matches.length > 0 ? 0 : -1;

          const storage = editor.storage.searchReplace;
          storage.searchTerm = searchTerm;
          storage.caseSensitive = caseSensitive;
          storage.matches = matches;
          storage.currentIndex = currentIndex;

          editor.view.dispatch(
            editor.state.tr.setMeta(pluginKey, {
              searchTerm,
              caseSensitive,
              matches,
              currentIndex,
            }),
          );

          if (currentIndex >= 0 && matches.length > 0) {
            editor.commands.setTextSelection(matches[0].from);
            editor.commands.scrollIntoView();
            requestAnimationFrame(() => {
              editor.view.focus();
            });
          }

          return matches.length;
        },

      nextSearchMatch:
        () =>
        ({ editor }: { editor: Editor }) => {
          const { currentIndex, searchTerm, caseSensitive } =
            editor.storage.searchReplace;

          const matches = findAllMatches(editor.state.doc, searchTerm, caseSensitive);
          if (matches.length === 0) return false;

          const safeCurrentIndex = currentIndex >= 0 && currentIndex < matches.length ? currentIndex : 0;
          const nextIndex = (safeCurrentIndex + 1) % matches.length;

          editor.storage.searchReplace.matches = matches;
          editor.storage.searchReplace.currentIndex = nextIndex;

          const match = matches[nextIndex];

          let txn = editor.state.tr;
          txn = txn.setMeta(pluginKey, {
            searchTerm,
            caseSensitive,
            matches,
            currentIndex: nextIndex,
          });
          txn = txn.setSelection(TextSelection.create(txn.doc, match.from, match.to));
          txn = txn.scrollIntoView();
          editor.view.dispatch(txn);

          requestAnimationFrame(() => {
            editor.view.focus();
          });

          return true;
        },

      previousSearchMatch:
        () =>
        ({ editor }: { editor: Editor }) => {
          const { currentIndex, searchTerm, caseSensitive } =
            editor.storage.searchReplace;

          const matches = findAllMatches(editor.state.doc, searchTerm, caseSensitive);
          if (matches.length === 0) return false;

          const safeCurrentIndex = currentIndex >= 0 && currentIndex < matches.length ? currentIndex : 0;
          const prevIndex = (safeCurrentIndex - 1 + matches.length) % matches.length;

          editor.storage.searchReplace.matches = matches;
          editor.storage.searchReplace.currentIndex = prevIndex;

          const match = matches[prevIndex];

          let txn = editor.state.tr;
          txn = txn.setMeta(pluginKey, {
            searchTerm,
            caseSensitive,
            matches,
            currentIndex: prevIndex,
          });
          txn = txn.setSelection(TextSelection.create(txn.doc, match.from, match.to));
          txn = txn.scrollIntoView();
          editor.view.dispatch(txn);

          requestAnimationFrame(() => {
            editor.view.focus();
          });

          return true;
        },

      replaceSearchMatch:
        (replaceTerm: string) =>
        ({ editor }: { editor: Editor }) => {
          const { currentIndex, searchTerm, caseSensitive } = editor.storage.searchReplace;

          // 从当前文档重新计算匹配（用户可能在搜索后编辑了内容）
          const currentMatches = findAllMatches(editor.state.doc, searchTerm, caseSensitive);
          if (currentMatches.length === 0 || currentIndex < 0 || currentIndex >= currentMatches.length)
            return false;

          const match = currentMatches[currentIndex];

          const tr = editor.state.tr.replaceWith(
            match.from,
            match.to,
            editor.schema.text(replaceTerm),
          );
          editor.view.dispatch(tr);

          const newDoc = editor.state.doc;
          const newMatches = findAllMatches(newDoc, searchTerm, caseSensitive);
          const newIndex =
            newMatches.length > 0 ? Math.min(currentIndex, newMatches.length - 1) : -1;

          editor.storage.searchReplace.matches = newMatches;
          editor.storage.searchReplace.currentIndex = newIndex;

          const metaTr = editor.state.tr.setMeta(pluginKey, {
            searchTerm,
            caseSensitive,
            matches: newMatches,
            currentIndex: newIndex,
          });
          editor.view.dispatch(metaTr);

          if (newIndex >= 0 && newMatches.length > 0) {
            try {
              editor
                .chain()
                .setTextSelection({
                  from: newMatches[newIndex].from,
                  to: newMatches[newIndex].to,
                })
                .scrollIntoView()
                .run();
            } catch {
              // position 可能已失效
            }
          }

          return true;
        },

      replaceAllSearchMatches:
        (replaceTerm: string) =>
        ({ editor }: { editor: Editor }) => {
          const { searchTerm, caseSensitive } = editor.storage.searchReplace;

          const matches = findAllMatches(editor.state.doc, searchTerm, caseSensitive);
          if (matches.length === 0) return 0;

          const count = matches.length;
          const sortedDesc = [...matches].sort((a, b) => b.from - a.from);
          let tr = editor.state.tr;
          for (const m of sortedDesc) {
            tr = tr.replaceWith(m.from, m.to, editor.schema.text(replaceTerm));
          }
          editor.view.dispatch(tr);

          const newMatches = findAllMatches(editor.state.doc, searchTerm, caseSensitive);
          const newIndex = newMatches.length > 0 ? 0 : -1;

          editor.storage.searchReplace.matches = newMatches;
          editor.storage.searchReplace.currentIndex = newIndex;

          editor.view.dispatch(
            editor.state.tr.setMeta(pluginKey, {
              searchTerm,
              caseSensitive,
              matches: newMatches,
              currentIndex: newIndex,
            }),
          );

          return count;
        },

      clearSearch:
        () =>
        ({ editor }: { editor: Editor }) => {
          editor.storage.searchReplace.searchTerm = '';
          editor.storage.searchReplace.replaceTerm = '';
          editor.storage.searchReplace.matches = [];
          editor.storage.searchReplace.currentIndex = -1;

          editor.view.dispatch(
            editor.state.tr.setMeta(pluginKey, {
              searchTerm: '',
              caseSensitive: false,
              matches: [],
              currentIndex: -1,
            }),
          );

          return true;
        },
    } as any;
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: searchReplacePluginKey,

        state: {
          init(): DecorationSet {
            return DecorationSet.empty;
          },

          apply(tr, oldDecos): DecorationSet {
            try {
              const meta = tr.getMeta(searchReplacePluginKey) as
                | SearchReplaceMeta
                | undefined;
              if (meta) {
                return computeDecorations(tr.doc, meta);
              }
              if (tr.docChanged) {
                return oldDecos.map(tr.mapping, tr.doc);
              }
              return oldDecos;
            } catch {
              return DecorationSet.empty;
            }
          },
        },

        props: {
          decorations(state) {
            try {
              return this.getState(state) || DecorationSet.empty;
            } catch {
              return DecorationSet.empty;
            }
          },
        },
      }),
    ];
  },
});
