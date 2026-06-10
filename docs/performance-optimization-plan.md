# 书籍页面加载性能优化计划

> 适用项目：writing-studio-private
> 创建日期：2026-06-10
> 状态：待实施

---

## 1. 问题现象

当一本书章节数量多（数百章）、总字数大（50万+）时，每次进入书籍页面（选中书籍 → 显示大纲树）会出现明显卡顿。卡顿来源并非单一，而是多个性能瓶颈叠加的结果。

---

## 2. 瓶颈定位（按影响程度排序）

### 瓶颈 A：每次保存都全量重算书籍总字数 ⚠️ 最大瓶颈

**影响频率**：每次自动保存（默认 30 秒）+ 每次手动保存

**当前代码**（共 6 处）：

| 位置 | 触发场景 | 代码模式 |
|------|---------|---------|
| `App.tsx:1555-1563` | 手动保存（handleSave） | `allChapters = await db.chapters.where('bookId').equals(...).toArray()` → `reduce` |
| `App.tsx:1209-1212` | Pipeline 录入章节 | 同上 |
| `BookOutlineTree:746-749` | 删除章节/卷后 | `recalcBookTotalWords()` |
| `RecycleBinPanel:60` | 恢复章节 | 同上 |
| `RecycleBinPanel:90` | 恢复卷 | 同上 |
| `App.tsx:730-748` | 计算 volumesWithChapters | `.each()` 遍历全部章节 |

**问题本质**：`db.chapters.where('bookId').equals(id).toArray()` 会将该书 **所有章节的完整记录**（含 content 字段）加载到内存。一本 85 万字、300 章的书，每次保存都要从 IndexedDB 读取约 1-2MB 数据，只为算一个 `sum(wordCount)`。

**特别注意**：`autoSave`（`App.tsx:632-643`）本身已优化为轻量保存，不触发全量重算。但 `handleSave`（手动保存）仍然全量重算。

---

### 瓶颈 B：BookOutlineTree 加载时对所有章节做 HTML→纯文本转换

**位置**：`BookOutlineTree/index.tsx:338-344`

```ts
const lightweightChapters = allChapters.map(ch => {
  const excerpt = ch.content
    ? ch.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 100)
    : '';
  return { ...ch, content: '', _excerpt: excerpt };
});
```

**问题**：
1. 对 **每个章节** 执行 6 次 `replace` + `trim` + `slice`，300 章就是 1800 次正则替换
2. `ch.content` 可能长达数万字符，正则替换大字符串开销显著
3. 即使 `chapterDetailDisplay` 设置为 `nameOnly`（不显示摘要），仍然计算了 `_excerpt`

---

### 瓶颈 C：`getVolumeStats` 递归计算无缓存

**位置**：`BookOutlineTree/index.tsx:395-405`

```ts
const getVolumeStats = (volumeId: string) => {
  const childVols = getChildVolumes(volumeId);
  const directChapters = getVolumeChapters(volumeId);
  let chapterCount = directChapters.length;
  let totalWordCount = directChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);
  for (const child of childVols) {
    const childStats = getVolumeStats(child.id);
    chapterCount += childStats.chapterCount;
    totalWordCount += childStats.totalWordCount;
  }
  return { childVolumeCount: childVols.length, chapterCount, totalWordCount };
};
```

**问题**：
1. 每次渲染卷节点时调用，在 `renderVolumeTree` 中通过 `buildVolumeDetail` 间接调用
2. 递归遍历子卷 + filter 章节，无 memoization
3. 3 层卷嵌套 × 10 个子卷 = 每次渲染调用 30+ 次 `getVolumeChapters`（每次都是 `filter + sort`）

---

### 瓶颈 D：`outlineRefreshTrigger` 触发过多重加载

**位置**：多处

| 触发源 | 频率 |
|--------|------|
| `App.tsx:1477` 字数更新防抖 | 每次编辑 500ms 后 |
| `App.tsx:1212` Pipeline 录入章节 | 每次录入 |
| `App.tsx:748` volumesWithChapters 查询 | 每次 trigger 变化 |
| `BookOutlineTree:327` loadData | 每次 trigger 变化 |

**问题**：`outlineRefreshTrigger` 变化 → 同时触发 `BookOutlineTree.loadData()` + `App.tsx volumesWithChapters` 查询，两者都从 IndexedDB 全量读取章节。

---

### 瓶颈 E：`volumesWithChapters` 冗余查询

**位置**：`App.tsx:730-748`

```ts
await db.chapters
  .where('bookId')
  .equals(currentBook.id)
  .each(chapter => {
    if (chapter.volumeId) volumeIds.add(chapter.volumeId);
  });
```

**问题**：BookOutlineTree 已经加载了所有章节数据，App.tsx 又单独查一次，且 `.each()` 会遍历完整记录（含 content）。

---

## 3. 优化方案

### 方案 A：增量更新书籍总字数（P0 - 最高优先级）

**核心思路**：不再全量扫描所有章节，改为用差值增量更新 `Book.totalWords`。

#### A1. 手动保存改为增量更新

**文件**：`src/App.tsx` — `handleSave` 函数（约 L1540-1577）

**改动**：
```ts
// 之前
const allChapters = await db.chapters.where('bookId').equals(currentBook.id).toArray();
const totalWords = allChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
await db.books.update(currentBook.id, { totalWords, updatedAt: Date.now() });

// 之后
const oldWordCount = currentChapter.wordCount || 0;
const newWordCount = countWords(editorContent, wordCountSettings);
const delta = newWordCount - oldWordCount;
if (delta !== 0) {
  const currentBook = await db.books.get(currentChapter.bookId);
  if (currentBook) {
    await db.books.update(currentChapter.bookId, {
      totalWords: (currentBook.totalWords || 0) + delta,
      updatedAt: Date.now(),
    });
  }
}
```

**注意**：需要在 `handleSave` 开头保存 `currentChapter.wordCount` 的旧值，因为后续 `setCurrentChapter` 会覆盖。

#### A2. Pipeline 录入章节改为增量更新

**文件**：`src/App.tsx` — `handlePipelineAddChapterToVolume`（约 L1178-1221）

**改动**：
```ts
// 之前
const allChapters = await db.chapters.where('bookId').equals(currentBook.id).toArray();
const totalWords = allChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
await db.books.update(currentBook.id, { totalWords, updatedAt: Date.now() });

// 之后
const currentBookData = await db.books.get(currentBook.id);
if (currentBookData) {
  await db.books.update(currentBook.id, {
    totalWords: (currentBookData.totalWords || 0) + wordCount,
    updatedAt: Date.now(),
  });
}
```

#### A3. BookOutlineTree 删除章节/卷改为增量更新

**文件**：`src/components/BookOutlineTree/index.tsx`

**改动**：将 `recalcBookTotalWords` 替换为增量版本：

```ts
// 删除章节时
const decrementBookTotalWords = async (chapterWordCount: number) => {
  const currentBookData = await db.books.get(book.id);
  if (currentBookData) {
    await db.books.update(book.id, {
      totalWords: Math.max(0, (currentBookData.totalWords || 0) - chapterWordCount),
      updatedAt: Date.now(),
    });
  }
};

// 删除卷时
const decrementBookTotalWordsByVolume = async (volumeChapters: Chapter[]) => {
  const delta = volumeChapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
  if (delta === 0) return;
  const currentBookData = await db.books.get(book.id);
  if (currentBookData) {
    await db.books.update(book.id, {
      totalWords: Math.max(0, (currentBookData.totalWords || 0) - delta),
      updatedAt: Date.now(),
    });
  }
};
```

**保留 `recalcBookTotalWords`** 作为校准函数，仅在以下场景调用：
- 数据导入后
- 设置面板中手动校准
- 应用启动时可选校准（防止增量累积误差）

#### A4. RecycleBinPanel 恢复/永久删除改为增量更新

**文件**：`src/components/RecycleBinPanel/index.tsx`

**改动**：
```ts
// 恢复章节：totalWords += chapter.wordCount
// 恢复卷：totalWords += sum(childChapters.wordCount)
// 永久删除：不影响 totalWords（已在删除时减过）
```

#### A5. 提取公共工具函数

**新位置**：`src/utils/bookStats.ts`（或放在 `src/db/index.ts` 中）

```ts
/** 增量更新书籍总字数 */
export async function adjustBookTotalWords(bookId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  const book = await db.books.get(bookId);
  if (!book) return;
  await db.books.update(bookId, {
    totalWords: Math.max(0, (book.totalWords || 0) + delta),
    updatedAt: Date.now(),
  });
}

/** 全量重算书籍总字数（仅用于校准） */
export async function recalcBookTotalWords(bookId: string): Promise<number> {
  // 只取 wordCount 字段，不加载 content
  let totalWords = 0;
  await db.chapters
    .where('bookId')
    .equals(bookId)
    .each(ch => { totalWords += ch.wordCount || 0; });
  await db.books.update(bookId, { totalWords, updatedAt: Date.now() });
  return totalWords;
}
```

---

### 方案 B：BookOutlineTree 渲染优化（P1）

#### B1. 按需计算摘要，跳过不需要的场景

**文件**：`src/components/BookOutlineTree/index.tsx` — `loadData` 函数

**改动**：
```ts
// 之前：对所有章节计算 _excerpt
const lightweightChapters = allChapters.map(ch => {
  const excerpt = ch.content ? ch.content.replace(...)... : '';
  return { ...ch, content: '', _excerpt: excerpt };
});

// 之后：仅在需要显示摘要时计算
const lightweightChapters = allChapters.map(ch => {
  const needExcerpt = chapterDetailDisplay === 'nameAndExcerpt' || chapterDetailDisplay === 'full';
  const excerpt = (needExcerpt && ch.content)
    ? ch.content.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim().slice(0, 100)
    : '';
  return { ...ch, content: '', _excerpt: excerpt };
});
```

#### B2. `getVolumeStats` 使用 useMemo 缓存

**文件**：`src/components/BookOutlineTree/index.tsx`

**改动**：
```ts
// 预计算所有卷的统计数据，缓存
const volumeStatsMap = useMemo(() => {
  const map = new Map<string, { childVolumeCount: number; chapterCount: number; totalWordCount: number }>();

  const computeStats = (volumeId: string): { childVolumeCount: number; chapterCount: number; totalWordCount: number } => {
    if (map.has(volumeId)) return map.get(volumeId)!;

    const childVols = volumes.filter(v => v.parentId === volumeId);
    const directChapters = chapters.filter(c => c.volumeId === volumeId);
    let chapterCount = directChapters.length;
    let totalWordCount = directChapters.reduce((sum, c) => sum + (c.wordCount || 0), 0);

    for (const child of childVols) {
      const childStats = computeStats(child.id);
      chapterCount += childStats.chapterCount;
      totalWordCount += childStats.totalWordCount;
    }

    const result = { childVolumeCount: childVols.length, chapterCount, totalWordCount };
    map.set(volumeId, result);
    return result;
  };

  // 对所有根卷递归计算
  volumes.filter(v => !v.parentId).forEach(v => computeStats(v.id));
  // 也计算有 parentId 的卷（可能作为子卷被跳过）
  volumes.forEach(v => computeStats(v.id));

  return map;
}, [volumes, chapters]);

// 使用时
const getVolumeStats = (volumeId: string) => {
  return volumeStatsMap.get(volumeId) || { childVolumeCount: 0, chapterCount: 0, totalWordCount: 0 };
};
```

#### B3. 虚拟滚动（可选，大章节量时启用）

**条件**：单卷下章节数 > 50 时启用虚拟列表

**方案**：引入 `react-virtuoso`，对展开卷内的章节列表使用 `Virtuoso` 组件渲染。

**影响范围**：`renderVolumeTree` 中章节列表渲染部分

**注意**：此方案改动较大，且与 `@dnd-kit` 拖拽排序可能冲突，建议作为后续优化。当前优先通过 B1+B2 减少计算量。

---

### 方案 C：消除冗余查询（P1）

#### C1. `volumesWithChapters` 从 BookOutlineTree 数据推导

**文件**：`src/App.tsx` — `volumesWithChapters` useEffect（L730-748）

**改动**：不再单独查库，改为从 BookOutlineTree 传递数据，或直接信任已加载的 chapters 数据。

**方案 A（推荐）**：BookOutlineTree 通过回调传递 volumesWithChapters：
```tsx
// BookOutlineTree 新增 prop
onVolumesWithChaptersChange?: (volumeIds: Set<string>) => void;

// loadData 中计算
const volumeIds = new Set<string>();
lightweightChapters.forEach(ch => { if (ch.volumeId) volumeIds.add(ch.volumeId); });
onVolumesWithChaptersChange?.(volumeIds);
```

**方案 B**：App.tsx 中缓存 chapters 数据，直接从中提取：
```ts
// 如果 App.tsx 已有 chapters 引用，直接用
const volumeIds = new Set(chapters.filter(c => c.volumeId).map(c => c.volumeId));
```

#### C2. 减少 `outlineRefreshTrigger` 触发频率

**当前问题**：字数更新防抖 500ms 后触发 `setOutlineRefreshTrigger`，导致 BookOutlineTree 整体重载。

**优化**：字数变化不需要重载整个大纲树，只需更新对应章节的 wordCount 显示。

**方案**：
1. 字数更新时，不触发 `outlineRefreshTrigger`
2. 改为传递一个 `chapterWordCountUpdates: Record<string, number>` prop 给 BookOutlineTree
3. BookOutlineTree 内部合并更新，不重新 loadData

```tsx
// App.tsx
const [chapterWordCountUpdates, setChapterWordCountUpdates] = useState<Record<string, number>>({});

// 字数更新防抖回调中
setChapterWordCountUpdates(prev => ({ ...prev, [currentChapter.id]: newWordCount }));

// BookOutlineTree 内部
useEffect(() => {
  if (Object.keys(chapterWordCountUpdates).length === 0) return;
  setChapters(prev => prev.map(ch => {
    const newWc = chapterWordCountUpdates[ch.id];
    return newWc !== undefined ? { ...ch, wordCount: newWc } : ch;
  }));
}, [chapterWordCountUpdates]);
```

---

### 方案 D：加载流程并行化（P2）

#### D1. volumes 和 chapters 并行加载

**文件**：`src/components/BookOutlineTree/index.tsx` — `loadData`

**改动**：
```ts
// 之前：串行
const allVolumes = await db.volumes.where('bookId').equals(book.id).sortBy('order');
const allChapters = await db.chapters.where('bookId').equals(book.id).toArray();

// 之后：并行
const [allVolumes, allChapters] = await Promise.all([
  db.volumes.where('bookId').equals(book.id).sortBy('order'),
  db.chapters.where('bookId').equals(book.id).toArray(),
]);
```

#### D2. 移除生产环境 console.log

**文件**：`src/components/BookOutlineTree/index.tsx` — `loadData` 中 4 条 `console.log`

**改动**：移除或改为 `if (import.meta.env.DEV) console.log(...)`

---

### 方案 E：Dexie 查询优化（P2）

#### E1. 轻量查询：只取必要字段

**当前**：`db.chapters.where('bookId').equals(id).toArray()` 返回完整记录（含 content）

**优化**：使用 `.each()` 只读取需要的字段：
```ts
// 只需要 wordCount 的场景
let totalWords = 0;
await db.chapters.where('bookId').equals(bookId).each(ch => {
  totalWords += ch.wordCount || 0;
});
```

**注意**：Dexie 的 `.each()` 仍然会从 IndexedDB 读取完整记录，只是不创建中间数组。真正的优化需要方案 A 的增量更新。

#### E2. 考虑新增索引（长期）

如果未来需要按 `wordCount` 排序或过滤，可在 Dexie schema 中添加索引。当前不需要。

---

## 4. 实施计划

### 阶段一：消除最大瓶颈（P0）

| 步骤 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 1 | 创建 `adjustBookTotalWords` / `recalcBookTotalWords` 工具函数 | `src/utils/bookStats.ts`（新建）或 `src/db/index.ts` | 单元测试 |
| 2 | `handleSave` 改为增量更新 | `src/App.tsx` | 保存后检查 Book.totalWords 正确 |
| 3 | `handlePipelineAddChapterToVolume` 改为增量更新 | `src/App.tsx` | 录入章节后 totalWords 正确 |
| 4 | `BookOutlineTree` 删除章节/卷改为增量更新 | `src/components/BookOutlineTree/index.tsx` | 删除后 totalWords 正确 |
| 5 | `RecycleBinPanel` 恢复/永久删除改为增量更新 | `src/components/RecycleBinPanel/index.tsx` | 恢复后 totalWords 正确 |
| 6 | 端到端验证：编辑 → 保存 → 删除 → 恢复，totalWords 始终正确 | — | 手动测试 |

### 阶段二：渲染优化（P1）

| 步骤 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 7 | `loadData` 按需计算 `_excerpt` | `BookOutlineTree/index.tsx` | nameOnly 模式下加载速度提升 |
| 8 | `getVolumeStats` 改为 `useMemo` 缓存 | `BookOutlineTree/index.tsx` | React DevTools Profiler 确认减少重复计算 |
| 9 | `volumesWithChapters` 改为从 BookOutlineTree 回调获取 | `App.tsx` + `BookOutlineTree/index.tsx` | 不再单独查库 |
| 10 | 字数更新改为 prop 传递，不触发 `outlineRefreshTrigger` | `App.tsx` + `BookOutlineTree/index.tsx` | 编辑时大纲树不重载 |

### 阶段三：锦上添花（P2）

| 步骤 | 任务 | 涉及文件 | 验证方式 |
|------|------|---------|---------|
| 11 | `loadData` 中 volumes 和 chapters 并行加载 | `BookOutlineTree/index.tsx` | 首屏加载时间减少 |
| 12 | 移除/条件化 `console.log` | `BookOutlineTree/index.tsx` | 生产环境无冗余日志 |
| 13 | 虚拟滚动（可选） | `BookOutlineTree/index.tsx` | 500+ 章节时滚动流畅 |

---

## 5. 预期效果

| 场景 | 优化前 | 优化后（阶段一） | 优化后（阶段二） |
|------|--------|----------------|----------------|
| 自动保存（30s） | 轻量（已优化） | 不变 | 不变 |
| 手动保存 | 全量扫描所有章节 | 仅读 1 条 Book 记录 + 1 次 update | 同左 |
| 进入书籍页面 | loadData + volumesWithChapters 双重全量查询 | loadData 单次查询 | loadData 单次查询 + 按需摘要 |
| 编辑时字数更新 | 触发 outlineRefresh → 整体重载 | 不变 | 仅更新对应章节 wordCount |
| 删除/恢复章节 | 全量扫描 | 增量更新 | 增量更新 |

**量化预估**（以 300 章、85 万字的书为例）：

| 操作 | 优化前耗时 | 优化后耗时 |
|------|-----------|-----------|
| 手动保存 | ~200-400ms（IndexedDB 全量读取 + JS reduce） | ~5-10ms（单条记录读取 + 加法） |
| 进入书籍页面 | ~300-500ms | ~150-250ms（并行 + 按需摘要） |
| 编辑时字数更新 | ~200-300ms（大纲树重载） | ~0ms（仅 state 更新） |

---

## 6. 风险与注意事项

### 6.1 增量更新的累积误差

**风险**：多次增量更新后，`Book.totalWords` 可能与实际 `sum(Chapter.wordCount)` 不一致。

**缓解措施**：
1. 在应用启动时，对当前打开的书籍执行一次 `recalcBookTotalWords` 校准
2. 在设置面板中提供「校准字数统计」按钮
3. 每次手动保存时，可以异步校验（不阻塞 UI）

### 6.2 并发写入

**风险**：多个标签页同时编辑同一本书时，增量更新可能互相覆盖。

**缓解措施**：当前应用为单窗口 Tauri 应用，此风险极低。如需支持多窗口，需引入乐观锁或版本号机制。

### 6.3 虚拟滚动与拖拽排序冲突

**风险**：`react-virtuoso` 与 `@dnd-kit` 的集成需要额外适配。

**缓解措施**：阶段三再考虑虚拟滚动，优先通过减少计算量解决问题。

---

## 7. 验证清单

优化完成后，需验证以下场景：

- [ ] 新建书籍 → 添加章节 → totalWords 正确
- [ ] 编辑章节内容 → 手动保存 → totalWords 正确增量更新
- [ ] 编辑章节内容 → 自动保存 → totalWords 不变（autoSave 不更新 totalWords）
- [ ] 删除章节 → totalWords 减少
- [ ] 删除卷（含多章节）→ totalWords 减少
- [ ] 恢复章节 → totalWords 增加
- [ ] 恢复卷 → totalWords 增加
- [ ] Pipeline 录入章节 → totalWords 增加
- [ ] 切换书籍 → 大纲树正常加载
- [ ] 编辑时字数变化 → 大纲树不重载，但字数显示更新
- [ ] 300+ 章节的书籍 → 进入页面无明显卡顿
- [ ] dark / light / eye-care 三种主题下 UI 正常
