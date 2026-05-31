/**
 * 文本搜索和替换工具函数
 */

export interface SearchResult {
  index: number;
  length: number;
  text: string;
}

/**
 * 在文本中搜索匹配项
 */
export const findMatches = (
  text: string,
  searchText: string,
  caseSensitive: boolean = false
): SearchResult[] => {
  if (!searchText) return [];

  const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
  const textToSearch = caseSensitive ? text : text.toLowerCase();
  const matches: SearchResult[] = [];
  
  let index = 0;
  while (true) {
    const foundIndex = textToSearch.indexOf(searchLower, index);
    if (foundIndex === -1) break;
    
    matches.push({
      index: foundIndex,
      length: searchText.length,
      text: text.substring(foundIndex, foundIndex + searchText.length),
    });
    
    index = foundIndex + 1;
  }
  
  return matches;
};

/**
 * 替换第一个匹配项
 */
export const replaceFirst = (
  text: string,
  searchText: string,
  replaceText: string,
  caseSensitive: boolean = false
): string => {
  if (!searchText) return text;

  const searchLower = caseSensitive ? searchText : searchText.toLowerCase();
  const textToSearch = caseSensitive ? text : text.toLowerCase();
  const foundIndex = textToSearch.indexOf(searchLower);
  
  if (foundIndex === -1) return text;
  
  return (
    text.substring(0, foundIndex) +
    replaceText +
    text.substring(foundIndex + searchText.length)
  );
};

/**
 * 替换所有匹配项
 */
export const replaceAll = (
  text: string,
  searchText: string,
  replaceText: string,
  caseSensitive: boolean = false
): string => {
  if (!searchText) return text;

  if (caseSensitive) {
    return text.split(searchText).join(replaceText);
  } else {
    // 不区分大小写的替换
    const regex = new RegExp(escapeRegExp(searchText), 'gi');
    return text.replace(regex, replaceText);
  }
};

/**
 * 转义正则表达式特殊字符
 */
const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};
