# 写作智能增强系统 — 实施计划任务书

> 版本：v1.0 | 日期：2026-06-02
> 涉及三大方向：写后事实提取 + 状态投影、审查硬闸门 + 结果回流、写作任务书翻译层

---

## 一、项目背景与目标

### 1.1 现状问题

当前 writing-studio 的 AI 写作流水线存在三个结构性缺陷：

| 缺陷 | 表现 | 影响 |
|------|------|------|
| **章节内容是黑箱** | `Chapter` 只有 `content: string`，无结构化事实 | 写下一章时 LLM 只能靠原文片段衔接，无法感知故事状态演变 |
| **审查是建议性的** | QualityCheckPanel 评分后无阻断，结果不回流 | 低质量章节直接进入后续流程，审查发现的问题无法反哺写作 |
| **上下文注入碎片化** | promptBuilders 各字段独立拼接，无统一编排 | 大纲、角色、细纲、前文、反模式各自注入，缺乏优先级和一致性 |

### 1.2 目标

1. **每章写完后自动提取结构化事实**，并投影为跨章可用的故事状态
2. **审查结果可阻断流程**，问题沉淀为反模式库，回流至写作上下文
3. **所有上下文源经统一翻译层编排**，输出连贯的写作任务书

### 1.3 参考来源

- webnovel-writer 的 Story Contract 系统（`story_contracts.py` + `runtime_contract_builder.py`）
- webnovel-writer 的 Review Schema（`review_schema.py`：severity/blocking/anti_patterns）
- 本项目现有架构：`SmartPromptComposer` + `WritingWorkflowStateMachine` + `QualityCheckPanel`

---

## 二、系统架构总览

```
                          ┌──────────────────────────┐
                          │    WritingTaskBook        │
                          │    (写作任务书)            │
                          └─────────┬────────────────┘
                                    │ 渲染为自然语言
                    ┌───────────────┼───────────────┐
                    │               │               │
          ┌─────────▼──────┐ ┌─────▼──────┐ ┌──────▼─────────┐
          │  locked 层     │ │ state 层   │ │ warnings 层    │
          │  (大纲+设定)   │ │ (状态投影) │ │ (反模式+契约)  │
          └─────────┬──────┘ └─────┬──────┘ └──────┬─────────┘
                    │               │               │
                    │     ┌─────────▼─────────┐     │
                    │     │  StateProjector    │     │
                    │     │  (状态投影器)       │     │
                    │     └─────────┬─────────┘     │
                    │     ┌─────────▼─────────┐     │
                    │     │  FactExtractor     │     │
                    │     │  (事实提取器)       │     │
                    │     └─────────┬─────────┘     │
                    │               │     ┌─────────▼─────────┐
                    │               │     │  ReviewGate        │
                    │               │     │  (审查闸门)        │
                    │               │     └─────────┬─────────┘
                    │               │               │
          ┌─────────▼───────────────▼───────────────▼─────────┐
          │              章节写作完成 (触发点)                   │
          └──────────────────────────────────────────────────┘
```

**数据流**：章节写作完成 → 审查闸门（阻断/放行）→ 事实提取 → 状态投影 → 任务书组装 → 下一章写作

---

## 三、方向一：写后事实提取 + 状态投影

### 3.1 新增类型定义

**文件**：`src/types/fact-extraction.ts`（新建）

```typescript
export interface EntitySnapshot {
  name: string;
  type: 'character' | 'location' | 'item' | 'faction';
  state: Record<string, string>;
  firstAppearance: number;
  lastSeen: number;
}

export interface StateChange {
  entity: string;
  attribute: string;
  from?: string;
  to: string;
  reason?: string;
}

export interface NarrativeEvent {
  description: string;
  participants: string[];
  location?: string;
  significance: 'major' | 'minor';
}

export interface TimelineEntry {
  chapterIndex: number;
  timeMarker?: string;
  description: string;
}

export interface HookEntry {
  description: string;
  type: 'mystery' | 'crisis' | 'promise' | 'revelation';
  status: 'open' | 'resolved';
  raisedInChapter: number;
  resolvedInChapter?: number;
}

export interface ChapterFacts {
  entities: EntitySnapshot[];
  stateChanges: StateChange[];
  events: NarrativeEvent[];
  timeline: TimelineEntry[];
  hooks: HookEntry[];
  summary: string;
  extractedAt: number;
}

export interface ChapterStateCommit {
  bookId: string;
  chapterIndex: number;
  entityIndex: Record<string, EntitySnapshot>;
  openHooks: HookEntry[];
  timeline: TimelineEntry[];
  chapterSummary: string;
  committedAt: number;
}
```

**文件**：`src/types/index.ts`（修改）

- `Chapter` 接口新增 `factExtraction?: ChapterFacts` 字段
- 导出 `ChapterFacts`、`ChapterStateCommit` 及其子类型
- `FullExportData` 新增 `chapterStateCommits: ChapterStateCommit[]`

### 3.2 数据库扩展

**文件**：`src/db/index.ts`（修改）

- `NovelIDEDatabase` 新增 `chapterStateCommits!: Table<ChapterStateCommit>` 表
- 新增 `version(14).stores({ chapterStateCommits: 'id, bookId, chapterIndex, committedAt' })`
- `exportAllData` / `importAllData` 增加该表的导出导入逻辑

### 3.3 FactExtractor 服务

**文件**：`src/services/FactExtractor.ts`（新建）

职责：调用 LLM 从章节正文中提取结构化事实。

```typescript
export class FactExtractor {
  constructor(private getLLMConfig: () => Promise<LLMConfig | null>) {}

  async extract(chapterContent: string, chapterIndex: number): Promise<ChapterFacts> {
    const config = await this.getLLMConfig();
    if (!config) throw new Error('LLM 未配置');

    const systemPrompt = this.buildExtractionPrompt();
    const userMessage = this.buildUserMessage(chapterContent, chapterIndex);

    const provider = LlmProviderFactory.createProvider(config);
    const apiKey = decodeApiKey(config.apiKey);
    const response = await provider.callApi(userMessage, [], systemPrompt);

    return this.parseResponse(response, chapterIndex);
  }

  private buildExtractionPrompt(): string { /* 严格的 JSON Schema 约束 prompt */ }
  private buildUserMessage(content: string, index: number): string { /* ... */ }
  private parseResponse(raw: string, index: number): ChapterFacts { /* JSON 解析 + 校验 + 默认值 */ }
}
```

**提取 Prompt 核心规则**：

```markdown
# 角色
你是一个小说事实提取器。从章节正文中提取结构化事实信息。

# 提取规则
1. 只提取正文中明确出现的信息，不推断、不补充
2. 实体类型限定为：character、location、item、faction
3. 状态变化必须有明确的因果，不猜测隐含变化
4. 悬念钩子只记录章末留下的未解决问题
5. 时间线只记录有明确时间标记的事件
6. 摘要控制在 200 字以内

# 输出格式（严格 JSON，不要包含代码块标记）
{
  "entities": [{ "name": "", "type": "character", "state": {}, "firstAppearance": 0, "lastSeen": 0 }],
  "stateChanges": [{ "entity": "", "attribute": "", "from": "", "to": "", "reason": "" }],
  "events": [{ "description": "", "participants": [], "location": "", "significance": "major" }],
  "timeline": [{ "chapterIndex": 0, "timeMarker": "", "description": "" }],
  "hooks": [{ "description": "", "type": "mystery", "status": "open", "raisedInChapter": 0 }],
  "summary": ""
}
```

### 3.4 StateProjector 服务

**文件**：`src/services/StateProjector.ts`（新建）

职责：将本章事实与上一章 commit 合并，生成新的 commit。

```typescript
export class StateProjector {
  constructor(private db: NovelIDEDatabase) {}

  async project(bookId: string, chapterIndex: number, facts: ChapterFacts): Promise<ChapterStateCommit> {
    const prevCommit = chapterIndex > 0
      ? await this.loadCommit(bookId, chapterIndex - 1)
      : this.emptyCommit(bookId, 0);

    const entityIndex = this.mergeEntities(prevCommit.entityIndex, facts.entities, chapterIndex);
    const openHooks = this.mergeHooks(prevCommit.openHooks, facts.hooks);
    const timeline = [...prevCommit.timeline, ...facts.timeline];
    const chapterSummary = facts.summary;

    const commit: ChapterStateCommit = {
      bookId,
      chapterIndex,
      entityIndex,
      openHooks,
      timeline,
      chapterSummary,
      committedAt: Date.now(),
    };

    await this.db.chapterStateCommits.put(commit);
    return commit;
  }

  private mergeEntities(prev: Record<string, EntitySnapshot>, current: EntitySnapshot[], chapterIndex: number): Record<string, EntitySnapshot> { /* ... */ }
  private mergeHooks(prev: HookEntry[], current: HookEntry[]): HookEntry[] { /* ... */ }
  private async loadCommit(bookId: string, chapterIndex: number): Promise<ChapterStateCommit> { /* ... */ }
  private emptyCommit(bookId: string, chapterIndex: number): ChapterStateCommit { /* ... */ }
}
```

### 3.5 集成点改造

#### 3.5.1 手动流水线 Step5

**文件**：`src/components/PipelineWriting/Step5WriteText.tsx`

- 在 `handleGenerateCurrent` 成功后，调用 `FactExtractor.extract()` → `StateProjector.project()`
- 将 `ChapterFacts` 写入 `Chapter.factExtraction`
- UI 新增"提取状态"按钮（手动触发）和"自动提取"开关

#### 3.5.2 Vibe Writing

**文件**：`agent-by-langchain/agent/pipeline_tools.py`

- 新增 `extract_chapter_facts` tool
- 在 `write_chapter_draft` 成功后自动调用
- 提取结果写入 `studio-data/books/{bookId}/.story-state/` 目录

#### 3.5.3 上下文注入

**文件**：`src/hooks/promptBuilders.ts`

- `buildContextSection` 的 `CHAPTER_WRITING` 分支新增：
  - 读取 `ChapterStateCommit`，注入活跃实体、未关闭悬念、近期时间线
  - 替代当前仅注入 `previousChapterSummary` 的做法

---

## 四、方向二：审查硬闸门 + 结果回流

### 4.1 类型扩展

**文件**：`src/types/index.ts`（修改）

```typescript
export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ReviewCategory = 'continuity' | 'setting' | 'character' | 'timeline' | 'ai_flavor' | 'logic' | 'pacing' | 'other';

export interface ReviewIssue {
  severity: ReviewSeverity;
  category: ReviewCategory;
  location: string;
  description: string;
  evidence: string;
  fixHint: string;
  blocking: boolean;
}

export interface AntiPattern {
  text: string;
  source: 'review' | 'manual';
  category: ReviewCategory;
  frequency: number;
  firstSeen: number;
  lastSeen: number;
}

export interface ReviewContract {
  mustCheck: string[];
  blockingRules: string[];
  genreRisks: string[];
  antiPatterns: string[];
  thresholds: {
    blockingCount: number;
    minScore: number;
  };
}
```

- `QARecord` 接口扩展：新增 `reviewIssues?: ReviewIssue[]`、`hasBlocking?: boolean`
- `QAIssue` 保留向后兼容，新增可选的 `severity` 和 `blocking` 字段
- `Book` 接口新增 `antiPatterns?: AntiPattern[]`

### 4.2 数据库扩展

**文件**：`src/db/index.ts`（修改）

- `NovelIDEDatabase` 新增 `antiPatterns!: Table<AntiPatternRecord>` 表
- `AntiPatternRecord` = `AntiPattern & { id: string; bookId: string }`
- 索引：`'id, bookId, category, frequency'`
- `version(14)` 中同步添加

### 4.3 审查 Prompt 增强

**文件**：`src/components/QualityCheckPanel/index.tsx`（修改）

`buildQualityCheckSystemPrompt` 增强为：

```markdown
# 审查契约
## 必须检查的情节点
{{mustCheck}}

## 阻断规则
{{blockingRules}}

## 已知反模式
{{antiPatterns}}

# 输出格式（严格 JSON）
{
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "category": "continuity|setting|character|...",
      "location": "第X段",
      "description": "...",
      "evidence": "引用原文",
      "fixHint": "...",
      "blocking": true/false
    }
  ],
  "summary": "...",
  "overallScore": 0-80,
  "dimensions": [...]
}
```

### 4.4 ReviewGate 服务

**文件**：`src/services/ReviewGate.ts`（新建）

```typescript
export class ReviewGate {
  constructor(private db: NovelIDEDatabase) {}

  evaluate(result: ReviewResult): GateDecision {
    if (result.hasBlocking) {
      return {
        passed: false,
        reason: `存在 ${result.blockingCount} 个阻断问题`,
        blockingIssues: result.issues.filter(i => i.blocking),
      };
    }

    const minScore = 60;
    if (result.overallScore < minScore) {
      return {
        passed: false,
        reason: `总分 ${result.overallScore} 低于最低标准 ${minScore}`,
        blockingIssues: [],
      };
    }

    return { passed: true, reason: '审查通过', blockingIssues: [] };
  }

  async extractAntiPatterns(bookId: string, issues: ReviewIssue[]): Promise<void> {
    const patterns = issues
      .filter(i => i.category === 'ai_flavor' || i.severity === 'critical')
      .map(i => ({
        id: generateId(),
        bookId,
        text: `[${i.category}] ${i.description}`,
        source: 'review' as const,
        category: i.category,
        frequency: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      }));

    await this.mergeAntiPatterns(bookId, patterns);
  }

  private async mergeAntiPatterns(bookId: string, newPatterns: AntiPatternRecord[]): Promise<void> {
    const existing = await this.db.antiPatterns.where({ bookId }).toArray();
    const map = new Map(existing.map(p => [p.text, p]));

    for (const pattern of newPatterns) {
      const prev = map.get(pattern.text);
      if (prev) {
        prev.frequency++;
        prev.lastSeen = Date.now();
        await this.db.antiPatterns.update(prev.id, prev);
      } else {
        await this.db.antiPatterns.add(pattern);
        map.set(pattern.text, pattern);
      }
    }
  }
}

interface GateDecision {
  passed: boolean;
  reason: string;
  blockingIssues: ReviewIssue[];
}
```

### 4.5 UI 改造

**文件**：`src/components/QualityCheckPanel/index.tsx`（修改）

1. **阻断态面板**：`hasBlocking=true` 时显示红色阻断面板
   - 列出所有 critical/blocking 问题
   - "修复后重审"按钮 → 回到编辑器
   - "确认跳过"按钮 → 二次确认弹窗 → 记录跳过原因
2. **审查结果卡片增强**：每个 issue 显示 severity 标签（红/橙/黄/灰）和 blocking 标记
3. **反模式库视图**：新增侧边栏入口，展示 Book 级 anti-patterns

### 4.6 结果回流路径

```
审查完成
    │
    ├──→ ReviewGate.evaluate() → 阻断/放行
    │
    ├──→ ReviewGate.extractAntiPatterns() → antiPatterns 表
    │
    └──→ 方向三 TaskBookComposer 读取 antiPatterns → 注入写作上下文
```

---

## 五、方向三：写作任务书翻译层

### 5.1 核心类型

**文件**：`src/types/task-book.ts`（新建）

```typescript
export interface WritingTaskBook {
  meta: {
    bookId: string;
    chapterIndex: number;
    chapterTitle: string;
    generatedAt: number;
  };

  locked: {
    genre: string;
    coreTone: string;
    worldRules: string[];
    characterConstraints: Array<{
      name: string;
      personality: string;
      currentGoal: string;
    }>;
  };

  chapterMission: {
    plotPoints: string[];
    emotionalArc: string;
    hookRequirement: string;
    wordCountTarget: number;
  };

  stateContext?: {
    activeEntities: EntitySnapshot[];
    openHooks: HookEntry[];
    recentTimeline: TimelineEntry[];
    previousChapterSummary: string;
  };

  warnings?: {
    antiPatterns: string[];
    blockingRules: string[];
    genreRisks: string[];
  };

  style: {
    writingStyle: string;
    customRules: string[];
    povCharacter?: string;
  };
}
```

### 5.2 TaskBookComposer 服务

**文件**：`src/services/TaskBookComposer.ts`（新建）

```typescript
export class TaskBookComposer {
  constructor(private db: NovelIDEDatabase) {}

  async compose(
    bookId: string,
    chapterIndex: number,
    sources: TaskBookSources
  ): Promise<WritingTaskBook> {
    const book = await this.db.books.get(bookId);
    const materials = await this.db.materials.where({ bookId }).toArray();
    const prevState = await this.loadStateCommit(bookId, chapterIndex - 1);
    const antiPatterns = await this.loadAntiPatterns(bookId);

    return {
      meta: { bookId, chapterIndex, chapterTitle: sources.chapterTitle, generatedAt: Date.now() },
      locked: this.buildLockedLayer(book, materials),
      chapterMission: this.buildChapterMission(sources),
      stateContext: this.buildStateContext(prevState),
      warnings: this.buildWarnings(antiPatterns, sources.reviewContract),
      style: this.buildStyleLayer(sources.step3Config),
    };
  }

  render(taskBook: WritingTaskBook): string {
    return [
      this.renderLockedLayer(taskBook.locked),
      this.renderChapterMission(taskBook.chapterMission),
      taskBook.stateContext ? this.renderStateContext(taskBook.stateContext) : '',
      taskBook.warnings ? this.renderWarnings(taskBook.warnings) : '',
      this.renderStyleLayer(taskBook.style),
    ].filter(Boolean).join('\n\n');
  }

  // 各 build* 方法：从数据源组装结构化数据
  // 各 render* 方法：将结构化数据翻译为自然语言段落
}
```

### 5.3 渲染输出示例

`renderStateContext` 输出效果：

```
## 📖 故事当前状态

### 活跃角色
- **"我"**：高三学生，设备参数12.0B（已改装至20.5B），位于考场，情绪紧张但决心已定
- **李想**：同班同学，设备2.8B，忠诚但胆小，正在同一考场

### 未关闭悬念
1. 🔴 监考AI为何选择不举报？（mystery - 第8章提出）
2. 🟡 "我"的改装芯片能否撑过整场考试？（crisis - 第9章提出）

### 近期事件
- [第9章] "我"在考场与监考AI对话，AI选择不举报
- [第8章] "我"从老K处获得改装芯片，设备参数翻倍

### 前章摘要
"我"进入考场后，监考AI检测到改装芯片但选择不举报，并主动优化了推理路径。
```

`renderWarnings` 输出效果：

```
## ⚠️ 写作禁忌

### 已知反模式（务必避免）
1. 使用"此外""然而""值得注意的是"等 AI 过渡词
2. 四字成语堆砌，如"不可思议""前所未有""惊天动地"连续出现
3. 用形容词直接陈述情绪（"他很紧张"），应改为身体反应描写

### 题材风险
- 科幻设定：避免未解释的技术跳跃
- 考试场景：时间线必须精确，不可出现时间矛盾
```

### 5.4 集成点改造

#### 5.4.1 替换 promptBuilders 的上下文构建

**文件**：`src/hooks/promptBuilders.ts`（修改）

- `buildContextSection` 的 `CHAPTER_WRITING` 分支改为调用 `TaskBookComposer.render()`
- 保留其他 stage 的现有逻辑不变（渐进式替换）

#### 5.4.2 替换流水线模板变量

**文件**：`src/prompts/templates/pipeline/05-chapter-generate.md`（修改）

```markdown
# 角色
你是一个小说写作助手。

# 任务
请根据以下写作任务书撰写章节正文。

# 写作任务书
{{taskBook}}

{{#if previousChapterContent}}
## 上一章结尾（用于衔接）
{{previousChapterContent}}
{{/if}}

# ⚡ 输出要求
1. 紧扣任务书中的情节点展开，不遗漏关键情节点
2. 与上一章自然衔接（如有）
3. 章末设置悬念钩子
4. 只输出正文内容，不要输出章节标题和额外说明
5. 正文使用纯文本格式，不要使用 Markdown 标记
6. 避免任务书中标注的反模式
7. 避免冗余和重复描写，保持紧凑流畅
```

#### 5.4.3 NovelLLMService 改造

**文件**：`src/llm/NovelLLMService.ts`（修改）

- `generatePipelineChapter` 方法：先调用 `TaskBookComposer.compose()` + `render()`，将结果作为 `taskBook` 变量传入模板
- 替代当前的 `outlineSummary` + `chapterOutline` 碎片化注入
- `generatePipelineChaptersBatch` 同理

#### 5.4.4 Vibe Writing 端

**文件**：`agent-by-langchain/templates/subagents/research_writer.md`（修改）

- 上下文组装部分改为读取 TaskBook 文件
- 新增 `compose_task_book` tool

---

## 六、实施阶段与依赖关系

### 6.1 阶段定义

```
Phase 1: 基础设施（方向三 P0-P3）
    │
    ├── Phase 2A: 事实提取（方向一 P0-P2）
    │       │
    │       └── Phase 3A: 状态投影（方向一 P3-P4）
    │               │
    │               └── Phase 4: 任务书接入状态层（方向三 P4）
    │
    └── Phase 2B: 审查增强（方向二 P0-P2）
            │
            └── Phase 3B: 反模式回流（方向二 P3）
                    │
                    └── Phase 5: 任务书接入警告层（方向三 P5）

    Phase 6: 完整闭环 + Vibe Writing 同步
```

### 6.2 详细任务分解

#### Phase 1：任务书翻译层骨架（方向三 P0-P3）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 1.1 | 定义 `WritingTaskBook` 类型 | `src/types/task-book.ts` | TypeScript 编译通过 |
| 1.2 | 实现 `TaskBookComposer` 骨架（locked + chapterMission + style 三层） | `src/services/TaskBookComposer.ts` | 可从 Book + Materials + Step4State 组装基础 TaskBook |
| 1.3 | 实现 `render` 方法（三层自然语言渲染） | 同上 | 输出格式化的自然语言任务书文本 |
| 1.4 | 替换 `promptBuilders.ts` 的 CHAPTER_WRITING 上下文构建 | `src/hooks/promptBuilders.ts` | 写章节时使用 TaskBook 渲染结果 |
| 1.5 | 修改 `05-chapter-generate.md` 模板，新增 `{{taskBook}}` 变量 | `src/prompts/templates/pipeline/05-chapter-generate.md` | 模板渲染正常 |
| 1.6 | 修改 `NovelLLMService.generatePipelineChapter`，注入 TaskBook | `src/llm/NovelLLMService.ts` | 手动流水线写章节使用新模板 |
| 1.7 | 端到端测试：手动流水线 Step5 写一章，验证 TaskBook 注入效果 | — | LLM 输出质量不低于改造前 |

#### Phase 2A：事实提取（方向一 P0-P2）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 2A.1 | 定义 `ChapterFacts` 及子类型 | `src/types/fact-extraction.ts` | TypeScript 编译通过 |
| 2A.2 | `Chapter` 接口新增 `factExtraction` 字段 | `src/types/index.ts` | 向后兼容，旧数据无该字段时为 undefined |
| 2A.3 | 编写事实提取 Prompt | `src/prompts/templates/extraction/fact-extraction.md` | Prompt 包含严格的 JSON Schema 约束 |
| 2A.4 | 实现 `FactExtractor` 服务 | `src/services/FactExtractor.ts` | 输入章节正文，输出 ChapterFacts JSON |
| 2A.5 | 在 Step5WriteText 中集成提取触发 | `src/components/PipelineWriting/Step5WriteText.tsx` | 章节生成成功后自动/手动触发提取 |
| 2A.6 | 将 ChapterFacts 持久化到 Chapter.factExtraction | `src/db/index.ts` | 刷新后提取结果不丢失 |
| 2A.7 | 测试：写一章 → 提取 → 验证 JSON 结构和内容准确性 | — | 提取的实体、状态变化、事件与正文一致 |

#### Phase 2B：审查增强（方向二 P0-P2）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 2B.1 | 定义 `ReviewIssue`（含 severity/blocking）、`AntiPattern`、`ReviewContract` 类型 | `src/types/index.ts` | TypeScript 编译通过 |
| 2B.2 | 扩展 `QARecord`，新增 `reviewIssues`、`hasBlocking` 字段 | `src/types/index.ts` | 向后兼容 |
| 2B.3 | 增强 AI 质检 Prompt，要求返回 severity + blocking + category | `src/components/QualityCheckPanel/index.tsx` | AI 返回结构化 ReviewIssue[] |
| 2B.4 | 实现 `ReviewGate` 服务 | `src/services/ReviewGate.ts` | evaluate() 返回阻断/放行决策 |
| 2B.5 | QualityCheckPanel 新增阻断态 UI | `src/components/QualityCheckPanel/index.tsx` | 有 blocking issue 时显示红色阻断面板 |
| 2B.6 | "确认跳过"二次确认机制 | 同上 | 跳过需二次确认，记录跳过原因 |
| 2B.7 | 测试：AI 质检低分章节 → 阻断 → 修复 → 重审 → 通过 | — | 阻断流程完整可用 |

#### Phase 3A：状态投影（方向一 P3-P4）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 3A.1 | 定义 `ChapterStateCommit` 类型 | `src/types/fact-extraction.ts` | TypeScript 编译通过 |
| 3A.2 | 数据库新增 `chapterStateCommits` 表 | `src/db/index.ts` | version(14) 迁移正常 |
| 3A.3 | 实现 `StateProjector` 服务 | `src/services/StateProjector.ts` | 跨章合并实体索引、悬念、时间线 |
| 3A.4 | 在 Step5 提取后自动调用 StateProjector | `src/components/PipelineWriting/Step5WriteText.tsx` | 每章写完 → 提取 → 投影 自动链式执行 |
| 3A.5 | 导出/导入逻辑增加 chapterStateCommits | `src/db/index.ts` | 数据备份包含状态投影 |
| 3A.6 | 测试：连续写 3 章 → 验证第 3 章 commit 包含前 2 章的累积状态 | — | 实体索引、悬念线、时间线正确累积 |

#### Phase 3B：反模式回流（方向二 P3）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 3B.1 | 数据库新增 `antiPatterns` 表 | `src/db/index.ts` | version(14) 迁移正常 |
| 3B.2 | 实现 `ReviewGate.extractAntiPatterns()` | `src/services/ReviewGate.ts` | 从审查结果提取反模式并合并 |
| 3B.3 | 审查完成后自动调用反模式提取 | `src/components/QualityCheckPanel/index.tsx` | 保存审查结果时同步提取反模式 |
| 3B.4 | 反模式库 UI 视图 | `src/components/AntiPatternPanel/index.tsx`（新建） | 可查看、手动添加、删除反模式 |
| 3B.5 | 导出/导入逻辑增加 antiPatterns | `src/db/index.ts` | 数据备份包含反模式 |
| 3B.6 | 测试：审查 3 章 → 反模式库累积 → 验证频率计数正确 | — | 反模式去重、频率递增正确 |

#### Phase 4：任务书接入状态层（方向三 P4）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 4.1 | `TaskBookComposer` 新增 `buildStateContext` 方法 | `src/services/TaskBookComposer.ts` | 从 ChapterStateCommit 读取状态 |
| 4.2 | 实现 `renderStateContext` 方法 | 同上 | 输出活跃实体、未关闭悬念、近期事件、前章摘要 |
| 4.3 | `compose` 方法接入 stateContext 层 | 同上 | TaskBook 包含 stateContext |
| 4.4 | 测试：连续写 2 章 → 第 3 章 TaskBook 包含前 2 章的状态投影 | — | 状态信息准确注入写作上下文 |

#### Phase 5：任务书接入警告层（方向三 P5）

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 5.1 | `TaskBookComposer` 新增 `buildWarnings` 方法 | `src/services/TaskBookComposer.ts` | 从 antiPatterns + ReviewContract 读取 |
| 5.2 | 实现 `renderWarnings` 方法 | 同上 | 输出反模式列表、题材风险、阻断规则 |
| 5.3 | `compose` 方法接入 warnings 层 | 同上 | TaskBook 包含 warnings |
| 5.4 | 测试：审查积累反模式后 → 写新章节 → TaskBook 包含反模式警告 | — | LLM 输出中反模式出现率下降 |

#### Phase 6：完整闭环 + Vibe Writing 同步

| # | 任务 | 产出文件 | 验收标准 |
|---|------|---------|---------|
| 6.1 | Vibe Writing 新增 `extract_chapter_facts` tool | `agent-by-langchain/agent/pipeline_tools.py` | Agent 可调用提取 |
| 6.2 | Vibe Writing 新增 `compose_task_book` tool | 同上 | Agent 可调用任务书组装 |
| 6.3 | Vibe Writing 状态文件持久化 | `agent-by-langchain/studio-data/books/{id}/.story-state/` | 状态投影写入文件系统 |
| 6.4 | `research_writer.md` 模板改造 | `agent-by-langchain/templates/subagents/research_writer.md` | 子代理读取 TaskBook |
| 6.5 | ReviewContract 配置 UI | `src/components/PipelineWriting/StepConfigPanel.tsx`（修改） | 流水线配置中可编辑审查契约 |
| 6.6 | WritingWorkflowStateMachine 新增 POST_WRITE 阶段 | `src/hooks/WritingWorkflowStateMachine.ts` | 章节写完 → 自动进入提取+审查流程 |
| 6.7 | 端到端集成测试 | — | 完整流水线：写章 → 审查 → 提取 → 投影 → 任务书 → 下一章 |

---

## 七、风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| LLM 事实提取 JSON 解析失败 | 高 | 中 | 多次重试 + 降级为正则提取摘要；prompt 中强调"严格 JSON，不要代码块" |
| 提取延迟影响写作体验 | 中 | 中 | 异步执行，不阻塞 UI；提取结果后台写入，下一章写作时才读取 |
| 审查阻断过于严格导致流程卡死 | 中 | 高 | "确认跳过"机制 + 可调节的 thresholds；默认只阻断 critical 级别 |
| 反模式库膨胀导致 prompt 过长 | 低 | 中 | 按 frequency 排序取 Top 20；超过阈值时合并相似条目 |
| TaskBook 渲染文本过长超出 token 预算 | 中 | 高 | 分层裁剪策略：locked 全量 → stateContext 近 3 章 → warnings Top 10 |
| 数据库迁移失败 | 低 | 高 | version(14) 使用 upgrade 事务；新字段全部 optional |

---

## 八、验收标准

### 8.1 Phase 1 验收

- [ ] 手动流水线 Step5 写章节时，system prompt 中包含 TaskBook 渲染的自然语言段落
- [ ] TaskBook 包含题材、角色约束、章节任务、风格要求
- [ ] 写作质量不低于改造前（人工对比评估）

### 8.2 Phase 2A 验收

- [ ] 章节写完后可自动/手动触发事实提取
- [ ] 提取结果包含实体、状态变化、事件、悬念钩子、摘要
- [ ] 提取结果持久化，刷新后不丢失

### 8.3 Phase 2B 验收

- [ ] AI 质检返回 severity + blocking 字段
- [ ] 有 blocking issue 时流程被阻断，必须修复或确认跳过
- [ ] 阻断 UI 清晰展示问题列表和修复方向

### 8.4 Phase 3A 验收

- [ ] 连续写 3 章后，第 3 章的 commit 包含前 2 章累积的实体索引
- [ ] 悬念线正确追踪：open → resolved 状态转换
- [ ] 时间线按章节顺序累积

### 8.5 Phase 3B 验收

- [ ] 审查完成后反模式自动提取并入库
- [ ] 反模式库 UI 可查看、添加、删除
- [ ] 重复出现的反模式 frequency 递增

### 8.6 Phase 4 验收

- [ ] TaskBook 的 stateContext 层包含活跃实体、未关闭悬念、近期事件
- [ ] 写第 N 章时，LLM 能感知前 N-1 章的故事状态

### 8.7 Phase 5 验收

- [ ] TaskBook 的 warnings 层包含反模式列表
- [ ] 连续写作 5 章后，反模式出现率相比无 warnings 时下降

### 8.8 Phase 6 验收

- [ ] Vibe Writing 端可调用提取和任务书 tool
- [ ] 完整流水线闭环：写章 → 审查 → 提取 → 投影 → 任务书 → 下一章
- [ ] WritingWorkflowStateMachine 支持 POST_WRITE 自动阶段

---

## 九、文件清单

### 新建文件

| 文件路径 | 用途 |
|---------|------|
| `src/types/fact-extraction.ts` | 事实提取 + 状态投影类型定义 |
| `src/types/task-book.ts` | 写作任务书类型定义 |
| `src/services/FactExtractor.ts` | 事实提取服务 |
| `src/services/StateProjector.ts` | 状态投影服务 |
| `src/services/ReviewGate.ts` | 审查闸门服务 |
| `src/services/TaskBookComposer.ts` | 任务书组装 + 渲染服务 |
| `src/prompts/templates/extraction/fact-extraction.md` | 事实提取 Prompt 模板 |
| `src/components/AntiPatternPanel/index.tsx` | 反模式库 UI |

### 修改文件

| 文件路径 | 改动内容 |
|---------|---------|
| `src/types/index.ts` | Chapter 扩展 factExtraction；QARecord 扩展；新增 ReviewIssue/AntiPattern/ReviewContract |
| `src/db/index.ts` | version(14) 新增 chapterStateCommits + antiPatterns 表；导出导入逻辑 |
| `src/hooks/promptBuilders.ts` | CHAPTER_WRITING 上下文构建改用 TaskBook |
| `src/hooks/WritingWorkflowStateMachine.ts` | 新增 POST_WRITE 阶段和转换规则 |
| `src/llm/NovelLLMService.ts` | generatePipelineChapter 注入 TaskBook |
| `src/prompts/templates/pipeline/05-chapter-generate.md` | 新增 {{taskBook}} 变量 |
| `src/prompts/templates/pipeline/05-chapter-batch-generate.md` | 同上 |
| `src/components/PipelineWriting/Step5WriteText.tsx` | 集成提取 + 投影触发 |
| `src/components/QualityCheckPanel/index.tsx` | 阻断态 UI + 反模式提取 |
| `agent-by-langchain/agent/pipeline_tools.py` | 新增 extract_chapter_facts / compose_task_book tool |
| `agent-by-langchain/templates/subagents/research_writer.md` | 上下文改为读取 TaskBook |
