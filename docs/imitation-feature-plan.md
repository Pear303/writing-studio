# 仿写功能开发方案 v2

> 基于「拆书分析」结果，提供结构化仿写能力。用户输入新角色/冲突/设定，系统基于原书结构规律生成新故事大纲。
>
> v2 修订：整合 24 条 review 反馈（16 条用户 + 8 条补充），修正数据模型、状态管理、容错策略、Prompt 设计。

---

## 0. Review 问题追踪表

| # | 优先级 | 问题 | 解决方案 | 对应章节 |
|---|--------|------|---------|---------|
| 1 | P0 | JSON-in-column 存储限制未来扩展 | v1 明确"整体读写"边界；数据模型增加 partialResult 支持中间持久化 | §2.2, §3.1 |
| 2 | P0 | 强度矩阵的 LLM 约束是伪精确 | 改为语义化描述 + 示例引导，删除数字约束 | §2.3, §8 |
| 3 | P0 | 3 个 state 不够表达 5 阶段状态机 | 改用 useReducer + ImitationPhase 枚举 | §6.1 |
| 4 | P0 | 两步 LLM 无容错 | 增加重试策略 + 中间持久化 + partialResult | §3.1 |
| 5 | P0 | title 来源不明 | 配置面板增加"新书名"输入框（可选，默认 LLM 生成） | §5.2 |
| 6 | P0 | FullExportData 类型遗漏 | 明确列入 A4 任务 | §7 |
| 7 | P1 | 对应原书角色数据源 | 通过 props 传入原书角色列表，下拉选择 | §5.2 |
| 8 | P1 | 节奏对比图前提不成立 | weak 模式不显示对比；其他模式按章节 index 对齐 | §5.3 |
| 9 | P1 | 组件树缺 ImitationSuspenseTab | 补全组件树 | §5.1 |
| 10 | P1 | 缺少纯文本导出 | 增加"导出 Markdown"按钮 | §5.3 |
| 11 | P2 | 配置草稿保存 | localStorage 缓存仿写配置 | §5.2 |
| 12 | P2 | 输入验证 | 必填字段非空校验 + 提交前提示 | §5.2 |
| 13 | P2 | 配角动态表单复杂度 | v1 简化为文本列表，v2 再做动态表单 | §5.2 |
| 14 | P2 | onProgress 没有具体方案 | 定义进度协议：Step1=0~0.6, Step2=0.6~1.0 | §3.1 |
| 15 | P2 | structureReference 冗余 | 删除，通过 deconstructionId 追溯 | §2.2 |
| 16 | P3 | 多书融合架构预留 | deconstructionId 改为 deconstructionRefs 数组 | §2.2 |
| 17 | P0 | importToBook 与 DeconstructionSeeder 重叠 | 抽取 BookStructureWriter 公共模块 | §3.3 |
| 18 | P0 | Step 2 输入过大 | Step 1 输出摘要化后再喂给 Step 2 | §3.1 |
| 19 | P0 | bookId 语义不清 | 删除 bookId，改为 sourceBookId（原书） | §2.2 |
| 20 | P1 | 编辑能力缺失 | v1 明确标注"只读预览"，编辑列入 v2 | §5.3 |
| 21 | P1 | 没有加载已有配置的路径 | 增加"上次配置"快捷入口 | §5.2 |
| 22 | P1 | 没有重新生成入口 | 预览面板增加"调整配置重新生成"按钮 | §5.3 |
| 23 | P2 | 类型重复定义 | 用 extends 复用原书类型 | §2.2 |
| 24 | P2 | 强度滑块 UX 表述 | 改为语义化标签 | §5.2 |

---

## 1. 功能概述

### 1.1 核心定位

拆书提取的是 **"怎么讲"**（结构、节奏、悬念布局），仿写替换的是 **"讲什么"**（人物、设定、具体事件）。用户掌控新内容，系统负责让新故事遵循原书的结构节奏。

### 1.2 用户流程

```
拆书完成 → 点击"仿写" → 填写仿写配置 → 生成仿写大纲 → 只读预览 → 导入书籍
```

**v1 边界**：
- 仿写大纲为**只读预览**，不支持在线编辑（#20）
- 仿写结果为**整体读写**，不支持部分重新生成（#1）
- 配角设定为**简化文本列表**，不做动态表单（#13）

### 1.3 与现有功能的关系

| 功能 | 关系 |
|------|------|
| 拆书分析 | 仿写的数据源，提供结构规律 |
| Pipeline/Vibe Writing | 仿写大纲导入后，逐章扩写复用 Vibe Writing |
| 书籍管理 | 仿写结果可导入现有书籍或创建新书 |
| DeconstructionSeeder | 导入逻辑复用，抽取公共 BookStructureWriter |

---

## 2. 数据模型

### 2.1 仿写配置

```typescript
// src/types/imitation.ts

import type { ChapterRole, CharacterArc, PacingPoint, ChapterSkeleton } from './book-deconstruction';

/** 仿写强度 — 语义化标签 */
export type ImitationStrength = 'strict' | 'rhythmic' | 'loose';

/** 仿写强度的用户可见标签 */
export const STRENGTH_LABELS: Record<ImitationStrength, { label: string; desc: string }> = {
  strict: { label: '严格复刻', desc: '章节角色和悬念布局尽量靠近原书' },
  rhythmic: { label: '参考节奏', desc: '保留整体节奏走势，内容自由发挥' },
  loose: { label: '自由发挥', desc: '只参考原书的结构类型和叙事手法' },
};

/** 节奏偏好 */
export type PacingPreference = 'tighter' | 'same' | 'looser';

/** 仿写配角设定 — v1 简化版 */
export interface ImitationCharacter {
  name: string;           // 角色名
  role: string;           // 角色定位（如"导师""对手""恋人"）
  description: string;    // 人设描述
  correspondsTo?: string; // 对应原书中的哪个角色（可选，下拉选择）
}

/** 仿写配置 — 用户输入 */
export interface ImitationConfig {
  // 必填
  protagonistName: string;        // 新主角姓名
  protagonistDescription: string; // 新主角人设
  coreConflict: string;           // 新核心冲突
  genre: string;                  // 新题材/世界观

  // 推荐
  characters: ImitationCharacter[];  // 配角设定
  customPlotHint?: string;           // 自定义剧情走向

  // 可选
  title?: string;                     // 新书名（可选，不填则 LLM 生成）
  strength: ImitationStrength;         // 仿写强度，默认 'rhythmic'
  pacingPreference: PacingPreference;  // 节奏偏好，默认 'same'
}
```

### 2.2 仿写大纲

**设计决策**：
- **JSON-in-column 模式**（#1）：v1 采用整体读写，ImitationOutline 作为单条记录存储。明确边界：v1 不支持部分编辑/部分重新生成。如需编辑，用户需删除后重新生成。
- **删除 structureReference**（#15）：通过 deconstructionId 追溯原书信息，不冗余存储。
- **删除 bookId**（#19）：改为 sourceBookId 明确语义（原书 ID），导入目标书 ID 在导入时确定。
- **多书融合预留**（#16）：deconstructionId 改为 deconstructionRefs 数组。
- **类型复用**（#23）：ImitationChapter extends ChapterSkeleton，只增加追溯字段。

```typescript
/** 仿写章节大纲 — 复用原书 ChapterSkeleton，增加追溯字段 */
export interface ImitationChapter extends ChapterSkeleton {
  correspondsToChapter: number;  // 对应原书第几章（用于追溯）
}

/** 仿写悬念线 — 复用原书 SuspenseLine，增加追溯字段 */
export interface ImitationSuspenseLine extends import('./book-deconstruction').SuspenseLine {
  correspondsToSuspenseId?: string;  // 对应原书悬念线 ID
}

/** 仿写角色弧线 — 复用原书 CharacterArc */
export type ImitationCharacterArc = CharacterArc;

/** 仿写节奏点 — 复用原书 PacingPoint */
export type ImitationPacingPoint = PacingPoint;

/** 仿写大纲 — 完整结果 */
export interface ImitationOutline {
  id: string;

  /** 关联的拆书结果 — 数组设计预留多书融合 (#16) */
  deconstructionRefs: Array<{
    deconstructionId: string;
    sourceBookId: string;        // 原书 ID（#19 明确语义）
    sourceBookTitle: string;    // 原书标题（用于 UI 展示，避免频繁查询）
  }>;

  config: ImitationConfig;       // 用户输入的配置

  // 生成结果
  title: string;                  // 新书标题（#5：用户可选填，不填则 LLM 生成）
  genre: string;                  // 新题材
  coreConflict: string;           // 新核心冲突
  themes: string[];               // 新主题词

  chapters: ImitationChapter[];
  suspenseLines: ImitationSuspenseLine[];
  characterArcs: ImitationCharacterArc[];
  pacingCurve: ImitationPacingPoint[];

  status: ImitationStatus;
  error?: string;

  /** Step 1 中间结果 — Step 2 失败时可从此恢复 (#4) */
  partialResult?: {
    chapters: ImitationChapter[];
    suspenseLines: ImitationSuspenseLine[];
    characterArcs: ImitationCharacterArc[];
  };

  createdAt: number;
  updatedAt: number;
}

export type ImitationStatus = 'generating' | 'completed' | 'failed';
```

### 2.3 仿写强度行为矩阵（语义化修订 #2）

> 不再用数字约束（如"±2"），改为语义化描述。LLM 不是编译器，无法精确遵循数字约束。

| 维度 | strict（严格复刻） | rhythmic（参考节奏，默认） | loose（自由发挥） |
|------|-------------------|--------------------------|-----------------|
| 章节角色 | 尽量与原书对应章节一致 | 保留整体节奏走势，允许微调 | 只保证起承转合 |
| 节奏曲线 | 整体走势与原书相似 | 参考原书起伏趋势 | 自由 |
| 悬念线 | 数量和布局尽量靠近原书 | 保留核心悬念结构 | 自由 |
| 人物弧线 | 弧线类型与原书对应角色相似 | 保留主要角色的弧线变化 | 自由 |
| 伏笔映射 | 伏笔-回收模式与原书相似 | 保留伏笔意识 | 自由 |
| 关系网络 | 核心关系类型与原书相似 | 保留核心关系 | 自由 |

**Prompt 引导策略**（替代数字约束）：
- **strict**：给出原书每章的结构作为"模板"，要求"新故事每章的叙事功能应与模板对应"
- **rhythmic**：给出原书的节奏走势图，要求"新故事的整体紧张度走势应与此相似"
- **loose**：只给出原书的结构类型（如"三幕式"），要求"用类似的结构类型组织新故事"

---

## 3. 服务层设计

### 3.1 ImitationOutlineGenerator

**职责**：基于拆书结果 + 用户配置，调用 LLM 生成仿写大纲。

**文件**：`src/services/ImitationOutlineGenerator.ts`

```typescript
interface GenerateProgress {
  step: 'chapters' | 'pacing';  // 当前步骤
  progress: number;              // 0.0 ~ 1.0，整体进度
  detail: string;                // 进度描述
}

class ImitationOutlineGenerator {
  /** 最大重试次数 */
  private static MAX_RETRIES = 2;

  async generate(
    deconstruction: BookDeconstructionResult,
    config: ImitationConfig,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: (progress: GenerateProgress) => void,
  ): Promise<ImitationOutline> {
    // Step 1: 生成章节大纲 + 悬念线 + 角色弧线（权重 60%）
    const step1Result = await this.withRetry(
      () => this.generateStep1(deconstruction, config, llmCall),
      ImitationOutlineGenerator.MAX_RETRIES,
    );
    onProgress?.({ step: 'chapters', progress: 0.6, detail: '章节大纲已生成' });

    // 立即持久化 Step 1 中间结果 (#4)
    // （由调用方 ImitationService 负责）

    // Step 2: 生成节奏曲线（权重 40%）
    // 输入摘要化，避免过大 (#18)
    const step2Result = await this.withRetry(
      () => this.generateStep2(deconstruction, step1Result, config, llmCall),
      ImitationOutlineGenerator.MAX_RETRIES,
    );
    onProgress?.({ step: 'pacing', progress: 1.0, detail: '节奏曲线已生成' });

    return this.assembleResult(deconstruction, config, step1Result, step2Result);
  }

  /** 带重试的 LLM 调用 (#4) */
  private async withRetry<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < maxRetries) {
          // 指数退避：1s, 2s
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    }
    throw lastError;
  }

  /** Step 1 输出摘要化，控制 Step 2 输入大小 (#18) */
  private summarizeStep1ForStep2(step1: Step1Result): string {
    // 只保留每章的 title + role + keyEvent，不传完整描述
    return step1.chapters.map(ch =>
      `第${ch.index + 1}章[${ch.role}]: ${ch.title} — ${ch.keyEvent}`
    ).join('\n');
  }
}
```

**生成流程**（两步 LLM 调用）：

1. **Step 1 — 生成章节大纲 + 悬念线 + 角色弧线**（进度 0% → 60%）
   - 输入：原书骨架摘要 + 用户配置
   - 输出：`ImitationChapter[]` + `ImitationSuspenseLine[]` + `ImitationCharacterArc[]`
   - 完成后立即持久化到 `partialResult` 字段

2. **Step 2 — 生成节奏曲线**（进度 60% → 100%）
   - 输入：Step 1 **摘要化**输出 + 原书 `pacingCurve` + 节奏偏好
   - 输出：`ImitationPacingPoint[]`
   - 如果 Step 2 失败，Step 1 结果已保存在 `partialResult` 中，可从断点恢复

**进度协议**（#14）：
- `progress` 范围 0.0 ~ 1.0
- Step 1 占 0.0 ~ 0.6
- Step 2 占 0.6 ~ 1.0
- `step` 字段标识当前步骤，UI 可据此显示不同文案

### 3.2 ImitationService

**职责**：仿写项目的 CRUD、状态管理、导入书籍。

**文件**：`src/services/ImitationService.ts`

```typescript
class ImitationService {
  /** 创建仿写项目（仅创建记录，不启动生成） */
  async create(deconstructionId: string, config: ImitationConfig): Promise<ImitationOutline>

  /** 启动生成 — 每步完成后立即持久化 (#4) */
  async startGenerate(
    imitationId: string,
    deconstruction: BookDeconstructionResult,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: (progress: GenerateProgress) => void,
  ): Promise<ImitationOutline> {
    // Step 1 完成后立即更新 DB（partialResult）
    // Step 2 完成后更新 DB（完整结果）
    // 任何一步失败，更新 status='failed'，保留 partialResult
  }

  /** 从断点恢复 — 如果有 partialResult，跳过 Step 1 (#4) */
  async resumeGenerate(
    imitationId: string,
    deconstruction: BookDeconstructionResult,
    llmCall: (prompt: string) => Promise<string>,
    onProgress?: (progress: GenerateProgress) => void,
  ): Promise<ImitationOutline>

  /** 加载 */
  async load(imitationId: string): Promise<ImitationOutline>
  async listByDeconstructionId(deconstructionId: string): Promise<ImitationOutline[]>

  /** 导入到书籍 — 复用 BookStructureWriter (#17) */
  async importToBook(imitationId: string, targetBookId?: string): Promise<string>

  /** 删除 */
  async delete(imitationId: string): Promise<void>
}
```

### 3.3 BookStructureWriter（公共模块 #17）

**职责**：将大纲数据写入书籍的卷/章结构。从 DeconstructionSeeder 中抽取，ImitationService 和 DeconstructionSeeder 共用。

**文件**：`src/services/BookStructureWriter.ts`

```typescript
class BookStructureWriter {
  /**
   * 将章节大纲写入书籍结构
   * @param bookId 目标书籍 ID（已存在）
   * @param chapters 章节大纲列表
   * @param options 配置选项
   */
  async writeChapters(
    bookId: string,
    chapters: Array<{
      title: string;
      content?: string;
      detailedOutline?: string;
      order: number;
      estimatedWordCount?: number;
    }>,
    options?: {
      volumeName?: string;     // 卷名，默认"正文"
      overwriteExisting?: boolean; // 是否覆盖已有章节
    },
  ): Promise<string[]>  // 返回章节 ID 列表

  /**
   * 创建新书并写入章节大纲
   */
  async createBookWithChapters(
    bookName: string,
    userId: string,
    chapters: Array<{
      title: string;
      detailedOutline?: string;
      order: number;
      estimatedWordCount?: number;
    }>,
  ): Promise<string>  // 返回 bookId
}
```

---

## 4. 数据库扩展

### 4.1 新增表

在 `db/index.ts` 的 version(18) 中新增：

```typescript
this.version(18).stores({
  imitationOutlines: 'id, deconstructionRefs, status, createdAt, updatedAt',
});
```

> 注意：`deconstructionRefs` 是 JSON 数组，IndexedDB 无法直接索引数组内的元素。
> 如需按 deconstructionId 查询，使用 `filter()` 过滤（数据量小，性能可接受）。

### 4.2 表定义

```typescript
imitationOutlines!: Table<ImitationOutline>;
```

### 4.3 FullExportData 类型更新（#6）

在 `src/types/index.ts` 的 `FullExportData` 接口中增加：

```typescript
export interface FullExportData {
  // ...existing fields
  bookDeconstructions: BookDeconstructionResult[];
  imitationOutlines: ImitationOutline[];  // ← 新增
  // ...
}
```

### 4.4 数据导出/导入

在 `exportAllData` / `importAllData` 中增加 `imitationOutlines` 字段。

---

## 5. UI 层设计

### 5.1 组件树（#9 补全）

```
BookDeconstruction/
  DeconstructionResult.tsx          ← 增加"仿写"按钮
  ImitationConfigPanel.tsx          ← 仿写配置表单（新建）
  ImitationOutlinePreview.tsx       ← 仿写大纲预览（新建，v1 只读 #20）
  tabs/
    ImitationChaptersTab.tsx        ← 仿写章节列表（新建）
    ImitationPacingTab.tsx          ← 仿写节奏曲线（新建）
    ImitationArcsTab.tsx            ← 仿写角色弧线（新建）
    ImitationSuspenseTab.tsx        ← 仿写悬念线（新建）
```

### 5.2 仿写配置面板 (ImitationConfigPanel)

**入口**：DeconstructionResult 头部增加"仿写"按钮（仅 status=completed 时显示）

**布局**：

```
┌─ 仿写配置 ─────────────────────────────────────┐
│                                                 │
│  基于《{原书名}》的拆书结果                       │
│                                                 │
│  仿写强度：  ○ 严格复刻  ● 参考节奏  ○ 自由发挥   │
│              ↑ 结构尽量靠近  ↑ 保留节奏  ↑ 只参考手法│
│                                                 │
│  ── 必填 * ─────────────────────────────────     │
│  新书名：    [________________________]（可选）   │
│  主角姓名*： [________________________]          │
│  主角人设*： [________________________]          │
│  核心冲突*： [________________________]          │
│  题材/世界观*：[________________________]        │
│                                                 │
│  ── 推荐 ──────────────────────────────────     │
│  配角设定（每行一个，格式：角色名 | 定位 | 人设） │
│  [________________________________________]     │
│  [________________________________________]     │
│  [+ 添加一行]                                    │
│                                                 │
│  对应原书角色（可选）：                           │
│  [下拉选择原书角色 ▼]                            │
│                                                 │
│  自定义剧情走向：[________________________]      │
│                                                 │
│  ── 可选 ──────────────────────────────────     │
│  节奏偏好：  ○ 更紧凑  ● 不变  ○ 更舒缓         │
│                                                 │
│  [使用上次配置]          [取消]  [生成仿写大纲]   │
└─────────────────────────────────────────────────┘
```

**交互细节**：

- **仿写强度**（#24 语义化标签）：3 个 radio，标签为"严格复刻 / 参考节奏 / 自由发挥"，默认"参考节奏"
- **新书名**（#5）：可选输入框，不填则 LLM 生成，placeholder 提示"不填则自动生成"
- **输入验证**（#12）：主角姓名、人设、核心冲突、题材为必填（标 *），提交前校验非空
- **配角设定**（#13 v1 简化）：文本列表形式，每行一个配角，格式"角色名 | 定位 | 人设"，降低动态表单复杂度
- **对应原书角色**（#7）：下拉选择框，选项来自 `deconstructionResult.skeleton?.chapterSkeletons.flatMap(ch => ch.majorCharacters)` 去重后，通过 props 传入
- **使用上次配置**（#21）：从 localStorage 读取上次保存的配置，一键填充
- **草稿保存**（#11）：配置变更时自动写入 `localStorage.setItem('imitationConfigDraft', JSON.stringify(config))`

### 5.3 仿写大纲预览 (ImitationOutlinePreview)（v1 只读 #20）

**布局**：

```
┌─ 仿写大纲：《{新书名}》 ────────────────────────┐
│                                                 │
│  [章节] [节奏] [角色弧线] [悬念线]              │
│  ─────────────────────────────────────────      │
│                                                 │
│  （Tab 内容区）                                  │
│                                                 │
│  ─────────────────────────────────────────      │
│  [调整配置重新生成]  [导出JSON] [导出Markdown]  │
│  [导入到现有书籍]  [创建新书]                    │
└─────────────────────────────────────────────────┘
```

**Tab 说明**：

| Tab | 内容 | 可视化 | 节奏对比说明 |
|-----|------|--------|------------|
| 章节 | 仿写章节列表，每行：序号、标题、摘要、角色、对应原书章节 | 表格 | — |
| 节奏 | 仿写节奏曲线 | Recharts | strict/rhythmic 模式显示原书对比线；loose 模式只显示新书曲线（#8） |
| 角色弧线 | 新角色弧线详情 | 时间线 | — |
| 悬念线 | 新悬念线列表 | 列表卡片 | — |

**操作按钮**：

- **调整配置重新生成**（#22）：回到配置面板，保留当前配置，用户可修改后重新生成
- **导出 JSON**：完整 ImitationOutline JSON 下载
- **导出 Markdown**（#10）：纯文本 Markdown 格式，适合外部使用
- **导入到现有书籍**：弹出书籍选择器
- **创建新书**：自动创建新书 + 默认卷 + 所有章节

### 5.4 DeconstructionResult 改动

在头部按钮区增加"仿写"按钮：

```tsx
{result.status === 'completed' && onImitate && (
  <button onClick={onImitate} className="...">
    <Copy size={14} />
    仿写
  </button>
)}
```

---

## 6. App.tsx 集成

### 6.1 状态管理（#3 改用 useReducer）

```typescript
type ImitationPhase = 'idle' | 'configuring' | 'generating' | 'previewing' | 'importing';

interface ImitationState {
  phase: ImitationPhase;
  config: ImitationConfig | null;
  outline: ImitationOutline | null;
  error: string | null;
}

type ImitationAction =
  | { type: 'START_CONFIG' }
  | { type: 'SET_CONFIG'; config: ImitationConfig }
  | { type: 'START_GENERATE'; config: ImitationConfig }
  | { type: 'GENERATE_PROGRESS'; /* progress info */ }
  | { type: 'GENERATE_SUCCESS'; outline: ImitationOutline }
  | { type: 'GENERATE_FAIL'; error: string }
  | { type: 'REGENERATE' }  // #22 回到配置阶段
  | { type: 'START_IMPORT' }
  | { type: 'IMPORT_SUCCESS' }
  | { type: 'RESET' };

const imitationReducer = (state: ImitationState, action: ImitationAction): ImitationState => {
  switch (action.type) {
    case 'START_CONFIG':
      return { phase: 'configuring', config: null, outline: null, error: null };
    case 'SET_CONFIG':
      return { ...state, config: action.config };
    case 'START_GENERATE':
      return { phase: 'generating', config: action.config, outline: null, error: null };
    case 'GENERATE_SUCCESS':
      return { phase: 'previewing', outline: action.outline, error: null };
    case 'GENERATE_FAIL':
      return { phase: 'configuring', error: action.error };  // 回到配置，保留 config
    case 'REGENERATE':
      return { phase: 'configuring', outline: null, error: null };  // 保留 config
    case 'START_IMPORT':
      return { ...state, phase: 'importing' };
    case 'IMPORT_SUCCESS':
      return { phase: 'idle', config: null, outline: null, error: null };
    case 'RESET':
      return { phase: 'idle', config: null, outline: null, error: null };
    default:
      return state;
  }
};

// 使用
const [imitationState, imitationDispatch] = useReducer(imitationReducer, {
  phase: 'idle', config: null, outline: null, error: null,
});
```

### 6.2 事件流

```
DeconstructionResult "仿写"按钮
  → dispatch({ type: 'START_CONFIG' })
  → ImitationConfigPanel（phase=configuring）
  → "生成仿写大纲"
  → dispatch({ type: 'START_GENERATE', config })
  → ImitationService.startGenerate()（phase=generating）
  → dispatch({ type: 'GENERATE_SUCCESS', outline })
  → ImitationOutlinePreview（phase=previewing）
  → "调整配置重新生成" → dispatch({ type: 'REGENERATE' })
  → "导入到书籍" / "创建新书"
  → dispatch({ type: 'START_IMPORT' })
  → ImitationService.importToBook()
  → dispatch({ type: 'IMPORT_SUCCESS' })
```

---

## 7. 开发任务分解

### Phase A：数据层（优先级：高）

| 编号 | 任务 | 文件 | 依赖 | 备注 |
|------|------|------|------|------|
| A1 | 定义仿写类型 | `src/types/imitation.ts` | book-deconstruction.ts | |
| A2 | 从 types/index.ts 导出 | `src/types/index.ts` | A1 | |
| A3 | 扩展 DB schema (v18) | `src/db/index.ts` | A1 | |
| A4 | 更新 FullExportData 类型 | `src/types/index.ts` | A1 | #6 明确列入 |
| A5 | 更新 exportAllData/importAllData | `src/db/index.ts` | A3 | |

### Phase B：服务层（优先级：高）

| 编号 | 任务 | 文件 | 依赖 | 备注 |
|------|------|------|------|------|
| B1 | ImitationOutlineGenerator | `src/services/ImitationOutlineGenerator.ts` | A1 | 含重试+摘要化 |
| B2 | ImitationService | `src/services/ImitationService.ts` | A1, A3, B1 | 含断点恢复 |
| B3 | BookStructureWriter | `src/services/BookStructureWriter.ts` | — | #17 从 Seeder 抽取 |
| B4 | 重构 DeconstructionSeeder | `src/services/DeconstructionSeeder.ts` | B3 | 复用 BookStructureWriter |

### Phase C：UI 层（优先级：高）

| 编号 | 任务 | 文件 | 依赖 | 备注 |
|------|------|------|------|------|
| C1 | ImitationConfigPanel | `src/components/BookDeconstruction/ImitationConfigPanel.tsx` | A1 | 含验证+草稿保存 |
| C2 | ImitationOutlinePreview | `src/components/BookDeconstruction/ImitationOutlinePreview.tsx` | A1 | v1 只读 |
| C3 | ImitationChaptersTab | `src/components/BookDeconstruction/tabs/ImitationChaptersTab.tsx` | A1 | |
| C4 | ImitationPacingTab | `src/components/BookDeconstruction/tabs/ImitationPacingTab.tsx` | A1 | 含对比逻辑 |
| C5 | ImitationArcsTab | `src/components/BookDeconstruction/tabs/ImitationArcsTab.tsx` | A1 | |
| C6 | ImitationSuspenseTab | `src/components/BookDeconstruction/tabs/ImitationSuspenseTab.tsx` | A1 | #9 补全 |

### Phase D：集成层（优先级：高）

| 编号 | 任务 | 文件 | 依赖 | 备注 |
|------|------|------|------|------|
| D1 | DeconstructionResult 增加"仿写"按钮 | `DeconstructionResult.tsx` | C1 | |
| D2 | App.tsx 接入仿写流程（useReducer） | `App.tsx` | B2, C1, C2 | #3 状态机 |
| D3 | 更新 BookDeconstruction/index.ts 导出 | `index.ts` | C1, C2 | |

### Phase E：测试与验证（优先级：中）

| 编号 | 任务 | 说明 |
|------|------|------|
| E1 | TypeScript 编译检查 | 确保零错误 |
| E2 | 主题适配检查 | dark/light/eye-care 三主题下验证 |
| E3 | 数据持久化验证 | 仿写配置/结果刷新后保留 |
| E4 | 导入书籍验证 | 仿写大纲正确写入卷/章结构 |
| E5 | 断点恢复验证 | Step 2 失败后可从 partialResult 恢复 |

---

## 8. 仿写强度对 Prompt 的影响（语义化修订 #2）

### 8.1 strict 模式 Prompt 片段

```
你正在基于一部已有作品的结构进行仿写。请严格遵循原书的结构模板。

## 原书结构模板
以下是原书每章的叙事功能：
{逐章列出：第N章 [role] — oneLineSummary}

## 要求
- 新故事的每章应与原书对应章节有相似的叙事功能
- 例如：原书第3章是"转折点"，新故事第3章也应是转折点
- 悬念线的数量和布局应与原书相似
- 主要角色的弧线变化类型应与原书对应角色相似
```

### 8.2 rhythmic 模式 Prompt 片段

```
你正在参考一部已有作品的节奏进行仿写。请保留整体节奏走势，但内容可以自由发挥。

## 原书节奏走势
{原书整体节奏描述：开篇舒缓 → 中段紧张 → 高潮爆发 → 结尾收束}

## 要求
- 新故事的整体紧张度走势应与原书相似（开篇→上升→高潮→收束）
- 但具体每章的叙事功能可以根据新内容灵活调整
- 悬念线保留核心结构（如"有2条主线悬念+1条副线"），但具体内容自由
- 主要角色应有弧线变化，但具体类型可以根据新角色特点调整
```

### 8.3 loose 模式 Prompt 片段

```
你正在参考一部已有作品的叙事手法进行仿写。只参考其结构类型，内容自由发挥。

## 原书结构类型
原书采用{structureType}结构，{structureDescription}。

## 要求
- 新故事可以使用类似的结构类型组织
- 章节安排、节奏、悬念线、角色弧线完全自由设计
- 只需保证故事有完整的起承转合
```

### 8.4 生成后结构校验

无论哪种强度，生成后都进行基础校验：

```typescript
function validateImitationOutline(outline: ImitationOutline): string[] {
  const warnings: string[] = [];

  // 章节数检查
  if (outline.chapters.length === 0) {
    warnings.push('生成结果没有章节');
  }

  // 悬念线闭环检查
  const openSuspense = outline.suspenseLines.filter(s => s.resolvedInChapter == null && s.type === 'main');
  if (openSuspense.length > 0) {
    warnings.push(`${openSuspense.length} 条主线悬念未收束`);
  }

  // 角色弧线检查
  const flatArcs = outline.characterArcs.filter(a => a.arcType === 'flat');
  if (flatArcs.length === outline.characterArcs.length) {
    warnings.push('所有角色弧线均为 flat，可能缺少角色成长');
  }

  return warnings;
}
```

---

## 9. 未来扩展方向

| 方向 | 说明 | 优先级 | 当前架构预留 |
|------|------|--------|------------|
| 多书融合仿写 | 从多本拆书中各取所长 | 远期 | deconstructionRefs 数组 (#16) |
| 仿写大纲编辑 | 用户在预览中直接修改 | 中期 | v1 只读 (#20) |
| 仿写模板库 | 将常用仿写配置保存为模板 | 中期 | — |
| 逐章扩写 | 仿写大纲导入后逐章扩写 | 近期 | — |
| 仿写对比 | 并排展示原书 vs 仿写章节 | 中期 | correspondsToChapter 字段 |
| 部分重新生成 | 只重做节奏曲线等 | 中期 | partialResult 字段 (#4) |
