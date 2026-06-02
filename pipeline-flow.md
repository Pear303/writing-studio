# Writing Studio Pipeline 完整流程详解

> 适用于 writing-studio 项目的 AI 写作流水线架构文档。涵盖写作任务书翻译层、写后事实提取+状态投影、审查硬闸门+结果回流三条主线的完整数据流。

## 一、整体架构：三条主线的关系

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Writing Studio Pipeline                       │
│                                                                     │
│  Step1 配置 ──→ Step2 大纲 ──→ Step3 风格 ──→ Step4 细纲 ──→ Step5 写作 │
│                                                                     │
│  ═══════════════ 三条主线 ═══════════════                            │
│                                                                     │
│  ① 写作任务书翻译层 (TaskBookComposer)                               │
│     ── 在 Step5 写作前，将多源数据组装为结构化任务书                    │
│     ── 渲染为自然语言，注入 LLM prompt                                │
│                                                                     │
│  ② 写后事实提取 + 状态投影 (FactExtractor)                           │
│     ── 在 Step5 每章写完后，LLM 提取结构化事实                        │
│     ── 与前章状态合并，持久化到 IndexedDB                              │
│     ── 下章写作时，状态回流到任务书                                    │
│                                                                     │
│  ③ 审查硬闸门 + 结果回流 (ReviewGate)                                │
│     ── 质检时，LLM 审查 + 问题分级 + 阻断判定                         │
│     ── 反模式检测与累积                                               │
│     ── 阻断性问题在 UI 上强制拦截                                     │
│     ── 反模式回流到下章任务书                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## 二、主线 ①：写作任务书翻译层 — 详细流程

### 触发时机

当 `NovelLLMService.generatePipelineChapter()` 或 `generatePipelineBatchChapters()` 被调用时，如果传入了 `bookId`，就会触发 TaskBook 组装。

### 数据流

```
NovelLLMService.generatePipelineChapter(bookId, chapterIndex, ...)
  │
  ├─ 1. taskBookComposer.compose(bookId, chapterIndex, sources)
  │     │
  │     ├─ 从 IndexedDB 加载 book 信息 ──────────────────┐
  │     ├─ 从 IndexedDB 加载 materials（角色/设定素材）──┤ → buildLockedLayer()
  │     │                                                │   → genre, coreTone, worldRules,
  │     │                                                │     characterConstraints
  │     │                                                │
  │     ├─ 从 sources 提取章节任务 ──────────────────────┐ → buildChapterMission()
  │     │   (chapterOutline, plotPoints,                 │   → plotPoints, emotionalArc,
  │     │    emotionalArc, hookRequirement,              │     hookRequirement, wordCountTarget
  │     │    wordCountTarget)                            │
  │     │                                                │
  │     ├─ 从 IndexedDB 加载 prevStateCommit ───────────┐ → buildStateContext()
  │     │   (chapterIndex - 1 的状态提交)                │   → activeEntities, openHooks,
  │     │                                                │     recentTimeline, previousChapterSummary
  │     │                                                │
  │     ├─ 从 IndexedDB 加载 antiPatterns ──────────────┐ → buildWarnings()
  │     │   + sources.reviewContract                     │   → antiPatterns, blockingRules,
  │     │                                                │     genreRisks
  │     │                                                │
  │     └─ 从 sources.step3Config 提取风格 ─────────────┐ → buildStyleLayer()
  │                                                     │   → writingStyle, customRules, povCharacter
  │                                                     │
  ├─ 2. taskBookComposer.render(taskBook)               │
  │     │                                               │
  │     │  渲染为 5 个自然语言段落：                       │
  │     │  ┌──────────────────────────────────────┐     │
  │     │  │ ## 📋 不可变约束                      │     │
  │     │  │   题材类型 / 核心调性 / 世界观规则     │     │
  │     │  │   角色约束（性格+目标）                │     │
  │     │  ├──────────────────────────────────────┤     │
  │     │  │ ## 🎯 本章任务                        │     │
  │     │  │   必须覆盖的情节点（编号列表）          │     │
  │     │  │   情感弧线 / 悬念要求 / 目标字数       │     │
  │     │  ├──────────────────────────────────────┤     │
  │     │  │ ## 📖 故事当前状态                     │     │
  │     │  │   活跃角色/实体（名称+状态键值对）      │     │
  │     │  │   未关闭悬念（类型图标+描述+提出章节）  │     │
  │     │  │   近期事件（最近5条时间线）             │     │
  │     │  │   前章摘要                            │     │
  │     │  ├──────────────────────────────────────┤     │
  │     │  │ ## ⚠️ 写作禁忌                        │     │
  │     │  │   已知反模式（务必避免，最多20条）      │     │
  │     │  │   阻断规则 / 题材风险                  │     │
  │     │  ├──────────────────────────────────────┤     │
  │     │  │ ## ✍️ 风格与偏好                      │     │
  │     │  │   写作风格 / 视角角色 / 自定义规则      │     │
  │     │  └──────────────────────────────────────┘     │
  │     │                                               │
  │     └─ 返回拼接后的自然语言字符串                     │
  │                                                     │
  ├─ 3. setTaskBookText(taskBookText)                   │
  │     └─ 缓存到 promptBuilders.ts 的模块级变量         │
  │                                                     │
  ├─ 4. composer.renderTemplate('chapter-generate', {   │
  │        taskBook: taskBookText || outlineSummary,     │
  │        ...                                          │
  │      })                                             │
  │     └─ 填充 05-chapter-generate.md 模板              │
  │        模板中 {{taskBook}} 被替换为任务书全文          │
  │                                                     │
  ├─ 5. this.generate('CHAPTER_WRITING', userMessage, ctx)│
  │     └─ SmartPromptComposer 构建 prompt 时            │
  │        在 CHAPTER_WRITING 阶段：                      │
  │        if (cachedTaskBookText) → 直接使用任务书       │
  │        else → 使用旧的散装字段拼接                    │
  │                                                     │
  └─ 6. setTaskBookText(null)  ← 生成完毕后清除缓存      │
```

### 关键设计：任务书 vs 旧散装上下文

| 维度 | 旧方式（散装字段） | 新方式（任务书） |
|------|-------------------|-----------------|
| 上下文来源 | 仅当前步骤的 ctx 对象 | IndexedDB 历史状态 + 素材库 + 反模式 |
| 跨章连贯性 | 仅靠 `previousChapterSummary` 一段文字 | 实体状态索引 + 悬念追踪 + 时间线 |
| 反模式规避 | 无 | 从历史审查中累积，注入任务书"写作禁忌" |
| 优先级 | 所有信息平铺 | 5 层结构：锁定层 > 任务层 > 状态层 > 警告层 > 风格层 |
| 降级策略 | — | TaskBook 组装失败时，自动回退到旧散装方式 |

### 任务书五层结构详解

#### 锁定层 (locked)

不可变约束，从书籍元数据和素材库中提取，全书写作期间不变。

```typescript
{
  genre: string;              // 题材类型（来自 book.description）
  coreTone: string;           // 核心调性
  worldRules: string[];       // 世界观规则
  characterConstraints: [{    // 角色约束
    name: string;             // 角色名
    personality: string;      // 性格（来自素材 fields.personalityCore）
    currentGoal: string;      // 当前目标（来自素材 fields.currentGoal）
  }]
}
```

渲染示例：
```
## 📋 不可变约束

题材类型：玄幻修仙
角色约束：
- **林凡**：性格冷静坚韧；当前目标：突破金丹期
- **苏晴**：性格温柔聪慧；当前目标：寻找失踪的师父
```

#### 任务层 (chapterMission)

本章必须完成的写作任务，来自 Step4 细纲和 Step3 风格配置。

```typescript
{
  plotPoints: string[];       // 必须覆盖的情节点
  emotionalArc: string;       // 情感弧线
  hookRequirement: string;    // 悬念要求
  wordCountTarget: number;    // 目标字数
}
```

渲染示例：
```
## 🎯 本章任务

必须覆盖的情节点：
1. 林凡进入秘境
2. 遭遇守护兽
3. 发现上古传承
情感弧线：紧张→绝望→惊喜
悬念要求：章末设置悬念钩子
目标字数：约3000字
```

#### 状态层 (stateContext)

故事当前状态，来自前章的 ChapterStateCommit。仅在有前章状态时出现。

```typescript
{
  activeEntities: EntitySnapshot[];    // 活跃实体
  openHooks: HookEntry[];              // 未关闭悬念
  recentTimeline: TimelineEntry[];     // 近期事件（最近5条）
  previousChapterSummary: string;      // 前章摘要
}
```

渲染示例：
```
## 📖 故事当前状态

### 活跃角色/实体
- **林凡**(character)：位置=青云峰，修为=筑基后期，状态=受伤
- **青云宗**(faction)：势力=正道，状态=内乱

### 未关闭悬念
1. 🔴 灵根之谜（mystery - 第1章提出）
2. 🟢 师父的承诺（promise - 第2章提出）

### 近期事件
- [第2章] 林凡在比武中获胜，获得进入秘境资格
- [第2章] 苏晴发现师父留下的线索

### 前章摘要
林凡在宗门大比中力克强敌，获得进入天机秘境的资格。苏晴在藏经阁发现师父失踪前留下的密信...
```

#### 警告层 (warnings)

写作禁忌，来自历史反模式累积和审查合同。仅在有禁忌内容时出现。

```typescript
{
  antiPatterns: string[];     // 已知反模式（按频率降序，最多20条）
  blockingRules: string[];   // 阻断规则
  genreRisks: string[];      // 题材风险
}
```

渲染示例：
```
## ⚠️ 写作禁忌

### 已知反模式（务必避免）
1. 角色突然获得未铺垫的能力
2. 战斗场景中频繁使用"不可思议"等空洞描写
3. 对话中过度使用感叹号

### 阻断规则
- critical级别的连贯性问题必须修复
- critical级别的角色不一致必须修复
- high级别的设定矛盾必须修复
```

#### 风格层 (style)

写作风格偏好，来自 Step3 风格配置。

```typescript
{
  writingStyle: string;       // 写作风格
  customRules: string[];      // 自定义规则
  povCharacter?: string;      // 视角角色
}
```

---

## 三、主线 ②：写后事实提取 + 状态投影 — 详细流程

### 触发时机

Step5WriteText 中，每章生成完成后，如果 `onExtractFacts` 回调存在，自动触发。提取失败不阻断写作流程。

### 数据流

```
Step5WriteText.handleGenerate()
  │
  ├─ 1. LLM 生成章节正文 → content
  │
  ├─ 2. 更新 UI 状态
  │
  └─ 3. if (onExtractFacts && content) {
         await onExtractFacts(currentIdx, title, content);
       }
         │
         ↓
App.tsx.handlePipelineExtractFacts(chapterIndex, chapterTitle, chapterContent)
  │
  ├─ 1. 动态 import FactExtractor + NovelLLMService
  │
  ├─ 2. 创建 llmCall 适配器：
  │     const llmCall = (prompt) => novelLLMService.generateRaw(prompt)
  │     └─ generateRaw() 直接发送原始 prompt，不走流水线模板
  │
  ├─ 3. factExtractor.extractFromChapter(bookId, chapterIndex, title, content, llmCall)
  │     │
  │     ├─ 3a. loadStateCommit(bookId, chapterIndex - 1)
  │     │       └─ 从 IndexedDB chapterStateCommits 表读取前章状态
  │     │
  │     ├─ 3b. buildPreviousStateSummary(prevState)
  │     │       └─ 将前章状态转为自然语言摘要：
  │     │          - 前章概要
  │     │          - 已知实体状态（最多20个）
  │     │          - 未解决悬念（最多10个）
  │     │
  │     ├─ 3c. buildExtractionPrompt(chapterIndex, title, content, previousStateSummary)
  │     │       └─ 构建提取 prompt
  │     │          包含：章节信息 + 正文(截断8000字) + 前文状态 + JSON输出格式
  │     │
  │     ├─ 3d. llmCall(prompt) → rawResult
  │     │
  │     ├─ 3e. parseRawResult(rawResult)
  │     │       └─ 尝试提取 ```json``` 代码块 → JSON.parse
  │     │          失败则尝试提取 {…} → JSON.parse
  │     │          再失败返回空对象 {}
  │     │
  │     └─ 3f. normalize 系列方法
  │             ├─ normalizeEntities()     → EntitySnapshot[]
  │             ├─ normalizeStateChanges() → StateChange[]
  │             ├─ normalizeEvents()       → NarrativeEvent[]
  │             ├─ normalizeTimeline()     → TimelineEntry[]
  │             └─ normalizeHooks()        → HookEntry[]
  │                （hook 类型映射：question→mystery, promise→promise,
  │                 foreshadowing→revelation, crisis→crisis）
  │
  │     → 返回 ChapterFacts
  │
  └─ 4. factExtractor.commitState(bookId, chapterIndex, facts)
        │
        ├─ 4a. loadStateCommit(bookId, chapterIndex - 1) → prevState
        │
        ├─ 4b. mergeEntities(prevState.entityIndex, facts.entities)
        │       └─ 按 entity.name 合并：
        │          已存在 → state 字段浅合并，更新 lastSeen
        │          新实体 → 直接插入
        │
        ├─ 4c. mergeHooks(prevState.openHooks, facts.hooks)
        │       └─ 保留前章所有 status='open' 的 hooks
        │          追加本章新 hooks
        │
        ├─ 4d. 合并 timeline：
        │       [...prevState.timeline, ...facts.timeline]
        │
        └─ 4e. 构建 ChapterStateCommit 并持久化
                {
                  id: `${bookId}_ch${chapterIndex}`,
                  bookId, chapterIndex,
                  entityIndex: { "林凡": {...}, "青云宗": {...} },
                  openHooks: [{ description, type, status, raisedInChapter }],
                  timeline: [{ chapterIndex, timeMarker, description }],
                  chapterSummary: "本章概要...",
                  committedAt: timestamp
                }
                → db.chapterStateCommits.put(commit)
```

### 提取的类型结构

#### EntitySnapshot — 实体快照

```typescript
interface EntitySnapshot {
  name: string;                                    // 实体名称
  type: 'character' | 'location' | 'item' | 'faction';  // 实体类型
  state: Record<string, string>;                   // 当前状态键值对
  firstAppearance: number;                         // 首次出现章节
  lastSeen: number;                                // 最后出现章节
}
```

#### StateChange — 状态变化

```typescript
interface StateChange {
  entity: string;        // 实体名称
  attribute: string;     // 变化的属性
  from?: string;         // 旧值
  to: string;            // 新值
  reason?: string;       // 变化原因
}
```

#### NarrativeEvent — 叙事事件

```typescript
interface NarrativeEvent {
  description: string;              // 事件描述
  participants: string[];           // 参与者
  location?: string;                // 地点
  significance: 'major' | 'minor';  // 重要程度
}
```

#### TimelineEntry — 时间线条目

```typescript
interface TimelineEntry {
  chapterIndex: number;    // 所属章节
  timeMarker?: string;     // 时间标记
  description: string;     // 事件描述
}
```

#### HookEntry — 悬念钩子

```typescript
interface HookEntry {
  description: string;                              // 悬念描述
  type: 'mystery' | 'crisis' | 'promise' | 'revelation';  // 悬念类型
  status: 'open' | 'resolved';                      // 状态
  raisedInChapter: number;                          // 提出章节
  resolvedInChapter?: number;                       // 解决章节
}
```

#### ChapterFacts — 章节事实

```typescript
interface ChapterFacts {
  entities: EntitySnapshot[];
  stateChanges: StateChange[];
  events: NarrativeEvent[];
  timeline: TimelineEntry[];
  hooks: HookEntry[];
  summary: string;         // 章节概要（50-100字）
  extractedAt: number;     // 提取时间戳
}
```

#### ChapterStateCommit — 章节状态提交

```typescript
interface ChapterStateCommit {
  id: string;                              // 格式: `${bookId}_ch${chapterIndex}`
  bookId: string;
  chapterIndex: number;
  entityIndex: Record<string, EntitySnapshot>;  // 实体索引（按名称）
  openHooks: HookEntry[];                       // 未关闭悬念
  timeline: TimelineEntry[];                    // 累积时间线
  chapterSummary: string;                       // 章节摘要
  committedAt: number;
}
```

### 状态投影的跨章累积效果

```
第1章写完 → commitState(ch0) → entityIndex: {林凡, 青云宗}
                              → openHooks: [mystery: 灵根之谜]

第2章写完 → commitState(ch1) → mergeEntities: 林凡.state 更新(lastSeen=2)
                              → openHooks: [灵根之谜, promise: 师父的承诺]
                              → timeline: [第1章事件..., 第2章事件...]

第3章写作时 → TaskBookComposer.compose(bookId, 2, ...)
              → loadStateCommit(bookId, 1) → 读取第2章的累积状态
              → buildStateContext() → 活跃实体 + 未关闭悬念 + 近5条时间线
              → 注入任务书 → LLM 携带完整前情写作
```

---

## 四、主线 ③：审查硬闸门 + 结果回流 — 详细流程

### 触发时机

ReviewGate 服务已实现，设计为在质检面板的 AI 质检流程中集成。当前 QualityCheckPanel 有独立的 AI 质检逻辑（基于 checklist），ReviewGate 作为增强层提供了阻断机制和反模式检测。

### 数据流

```
ReviewGate.review(bookId, chapterIndex, title, content, llmCall, contract?)
  │
  ├─ 1. 加载上下文
  │     ├─ loadAntiPatterns(bookId) → 从 IndexedDB 读取历史反模式
  │     └─ loadStateCommit(bookId, chapterIndex - 1) → 前章状态
  │
  ├─ 2. buildReviewPrompt(...)
  │     │
  │     │  构建审查 prompt，包含：
  │     │  ┌──────────────────────────────────────┐
  │     │  │ 审查章节（正文截断8000字）             │
  │     │  │ 前章概要                              │
  │     │  │ 已知实体状态（最多15个）                │
  │     │  │ 已知反模式（最多10条，标注出现频次）     │
  │     │  │ 审查重点（mustCheck 列表）              │
  │     │  │ 阻断规则                              │
  │     │  │ JSON 输出格式要求                      │
  │     │  │ 严重程度标准说明                       │
  │     │  └──────────────────────────────────────┘
  │     │
  │     └─ 审查重点映射：
  │        continuity → 连贯性（前后文是否一致）
  │        character  → 角色一致性（行为是否符合性格）
  │        setting    → 设定一致性（世界观规则是否矛盾）
  │        timeline   → 时间线（事件顺序是否合理）
  │        ai_flavor  → AI味（是否有机械化的表达）
  │        logic      → 逻辑性（因果关系是否成立）
  │        pacing     → 节奏（是否拖沓或仓促）
  │
  ├─ 3. llmCall(prompt) → rawResult
  │
  ├─ 4. parseRawResult → RawReviewResult
  │
  ├─ 5. normalizeIssues(parsed)
  │     └─ 每个 issue 包含：
  │        severity: critical | high | medium | low
  │        category: continuity | setting | character | timeline | ai_flavor | logic | pacing | other
  │        location: 问题位置（引用原文）
  │        description: 问题描述
  │        evidence: 证据
  │        fixHint: 修改建议
  │        blocking: severity === 'critical' || severity === 'high'
  │
  ├─ 6. 计算结果
  │     ├─ blockingIssues = issues.filter(i => i.blocking)
  │     ├─ score = parsed.overallScore ?? calculateScore(issues)
  │     │         （critical -20, high -10, medium -5, low -2, 最低0）
  │     └─ passed = blockingIssues.length === 0 && score >= thresholds.minScore(60)
  │
  ├─ 7. detectAntiPatterns(issues, bookId)
  │     └─ 从 issues 中识别反复出现的模式：
  │        - 按 "category:description前50字" 分组
  │        - 仅提取 ai_flavor 和 logic 类别
  │        - 生成 AntiPattern 记录
  │
  └─ 8. 返回 ReviewGateResult
        {
          issues,           // 所有问题
          blockingIssues,   // 阻断性问题（critical + high）
          score,            // 0-100
          passed,           // 是否通过闸门
          summary,          // 审查总结
          newAntiPatterns   // 新检测到的反模式
        }
```

### 审查合同 (ReviewContract)

```typescript
interface ReviewContract {
  mustCheck: string[];       // 必须检查的维度
  blockingRules: string[];  // 阻断规则描述
  genreRisks: string[];     // 题材特有风险
  antiPatterns: string[];   // 已知反模式文本
  thresholds: {
    blockingCount: number;  // 允许的阻断性问题数（默认0）
    minScore: number;       // 最低通过分数（默认60）
  }
}
```

默认合同：
```typescript
{
  mustCheck: ['continuity', 'character', 'setting', 'timeline'],
  blockingRules: [
    'critical级别的连贯性问题必须修复',
    'critical级别的角色不一致必须修复',
    'high级别的设定矛盾必须修复',
  ],
  genreRisks: [],
  antiPatterns: [],
  thresholds: { blockingCount: 0, minScore: 60 },
}
```

### 问题严重程度标准

| 级别 | 含义 | 是否阻断 | 扣分 |
|------|------|---------|------|
| critical | 阻断性错误，必须修复 | ✅ 是 | -20 |
| high | 严重问题，强烈建议修复 | ✅ 是 | -10 |
| medium | 一般问题 | ❌ 否 | -5 |
| low | 轻微建议 | ❌ 否 | -2 |

### 反模式回流路径

```
ReviewGate 检测到 newAntiPatterns
  │
  ├─ reviewGate.saveAntiPatterns(patterns)
  │     └─ 对每个反模式：
  │        已存在（bookId + text 匹配）→ frequency++, 更新 lastSeen
  │        不存在 → 新增记录
  │
  │     IndexedDB antiPatterns 表:
  │     { id, bookId, text, source, category, frequency, firstSeen, lastSeen }
  │
  └─ 下次 TaskBookComposer.compose() 时
      ├─ loadAntiPatterns(bookId)
      ├─ 按频率降序排列，取前20条
      ├─ buildWarnings() → 注入任务书"⚠️ 写作禁忌"段
      └─ LLM 写作时看到这些禁忌，主动规避
```

### UI 阻断机制

```
QualityCheckPanel 渲染
  │
  ├─ 有阻断性问题 + 未确认跳过
  │     ┌─────────────────────────────────────────────┐
  │     │ 🔴 审查硬闸门：N 个阻断性问题               │
  │     │                                               │
  │     │  [严重] [continuity] 林凡第3章突然会飞...     │
  │     │         💡 检查前文是否铺垫了飞行能力          │
  │     │  [高危] [character] 角色性格突变...           │
  │     │         💡 与第1章设定的冷静性格矛盾           │
  │     │                                               │
  │     │ 审查评分：45/100 ❌ 未通过                    │
  │     │                                               │
  │     │ [⏭ 跳过闸门（确认）]                          │
  │     └─────────────────────────────────────────────┘
  │
  ├─ 用户点击"跳过闸门" → skipConfirmed = true
  │     ┌─────────────────────────────────────────────┐
  │     │ ⚠️ 闸门已跳过 — 存在未修复的阻断性问题       │
  │     └─────────────────────────────────────────────┘
  │
  └─ 无阻断性问题
        ┌─────────────────────────────────────────────┐
        │ ✅ 审查通过 — N 个问题（无阻断性）            │
        └─────────────────────────────────────────────┘
```

---

## 五、完整闭环：三线协同

```
                    ┌──────────────────────┐
                    │   IndexedDB 持久层    │
                    │                      │
                    │  chapterStateCommits  │◄──── FactExtractor.commitState()
                    │  antiPatterns         │◄──── ReviewGate.saveAntiPatterns()
                    │  chapters             │
                    │  materials            │
                    └───────┬──────┬───────┘
                            │      │
          ┌─────────────────┘      └──────────────────┐
          │ 读取 prevState          读取 antiPatterns  │
          ▼                                          ▼
    ┌─────────────────────────────────────────────────────┐
    │              TaskBookComposer.compose()              │
    │                                                     │
    │  locked层 ← book + materials                        │
    │  mission层 ← sources(大纲/细纲/风格配置)             │
    │  state层  ← prevState (实体/悬念/时间线/摘要)  ◄──── │ ②状态回流
    │  warning层 ← antiPatterns + reviewContract   ◄──── │ ③反模式回流
    │  style层  ← step3Config                            │
    │                                                     │
    │  render() → 自然语言任务书                           │
    └──────────────────────┬──────────────────────────────┘
                           │ 注入 prompt
                           ▼
    ┌──────────────────────────────────────────────────────┐
    │              LLM 章节生成                             │
    │                                                      │
    │  System: SmartPromptComposer 组装的系统提示            │
    │  User: 05-chapter-generate.md 模板                    │
    │        {{taskBook}} = 任务书全文                       │
    │        {{previousChapterContent}} = 上章结尾4000字     │
    │                                                      │
    │  → 生成章节正文                                       │
    └──────────────────────┬───────────────────────────────┘
                           │
              ┌────────────┼────────────┐
              ▼                         ▼
    ┌──────────────────┐     ┌──────────────────┐
    │ ② FactExtractor  │     │ ③ ReviewGate     │
    │   提取事实        │     │   审查硬闸门      │
    │   合并状态        │     │   分级问题        │
    │   持久化 commit   │     │   检测反模式      │
    └────────┬─────────┘     └────────┬─────────┘
             │                        │
             │ 写入                   │ 写入
             ▼                        ▼
    ┌─────────────────────────────────────────────┐
    │           IndexedDB (闭环)                    │
    │                                              │
    │  chapterStateCommits ← 状态累积              │
    │  antiPatterns       ← 反模式累积             │
    │                                              │
    │  → 下章 TaskBookComposer 再次读取 → 循环     │
    └─────────────────────────────────────────────┘
```

---

## 六、关键设计决策

| 决策 | 原因 |
|------|------|
| TaskBook 用自然语言渲染而非 JSON 注入 | LLM 对自然语言指令的遵循度高于结构化数据 |
| FactExtractor 提取失败不阻断写作 | 提取是辅助功能，不应阻塞主流程 |
| ReviewGate 的 critical/high 自动阻断 | 防止严重连贯性问题在批量写作中雪崩扩散 |
| 反模式按 frequency 排序取前 20 | 避免 prompt 过长，优先展示最频发的问题 |
| `setTaskBookText` 用模块级缓存 | 避免修改 SmartPromptComposer 的接口，最小侵入 |
| `generateRaw` 独立于流水线模板 | 事实提取和审查需要自由格式的 prompt，不受模板约束 |
| ChapterStateCommit 用 `bookId_chN` 作为主键 | 确保同一章节只有一个状态提交，put 操作幂等 |
| hook 只追踪 open 状态 | 简化合并逻辑，resolved 的 hook 不再参与状态传递 |
| 正文截断 8000 字送入提取/审查 prompt | 平衡信息完整性与 LLM 上下文窗口限制 |
| 状态合并采用浅合并 | 避免深层嵌套合并的复杂性和不可预测性 |

---

## 七、文件索引

### 服务层

| 文件 | 职责 |
|------|------|
| `src/services/TaskBookComposer.ts` | 任务书组装与渲染 |
| `src/services/FactExtractor.ts` | 事实提取与状态合并 |
| `src/services/ReviewGate.ts` | 审查硬闸门与反模式检测 |

### 类型定义

| 文件 | 职责 |
|------|------|
| `src/types/task-book.ts` | WritingTaskBook、TaskBookSources |
| `src/types/fact-extraction.ts` | EntitySnapshot、ChapterFacts、ChapterStateCommit 等 |
| `src/types/index.ts` | ReviewIssue、AntiPattern、ReviewContract 等 |

### 集成点

| 文件 | 修改内容 |
|------|---------|
| `src/llm/NovelLLMService.ts` | generatePipelineChapter/Batch 注入 TaskBook；新增 generateRaw |
| `src/hooks/promptBuilders.ts` | setTaskBookText/getTaskBookText 缓存；CHAPTER_WRITING 优先使用任务书 |
| `src/components/PipelineWriting/Step5WriteText.tsx` | onExtractFacts 回调，章节生成后触发提取 |
| `src/components/QualityCheckPanel/index.tsx` | 阻断态 UI、跳过确认、通过态提示 |
| `src/App.tsx` | handlePipelineExtractFacts 实现 |
| `src/db/index.ts` | version(14) 迁移；chapterStateCommits + antiPatterns 表；导出/导入适配 |

### Prompt 模板

| 文件 | 用途 |
|------|------|
| `src/prompts/templates/pipeline/05-chapter-generate.md` | 章节生成模板（{{taskBook}} 变量） |
| `src/prompts/templates/pipeline/06-fact-extraction.md` | 事实提取模板 |

---

## 八、数据库 Schema

### chapterStateCommits 表

| 字段 | 类型 | 索引 | 说明 |
|------|------|------|------|
| id | string | 主键 | 格式: `${bookId}_ch${chapterIndex}` |
| bookId | string | ✅ | 所属书籍 |
| chapterIndex | number | ✅ | 章节序号 |
| entityIndex | object | — | 实体索引（按名称） |
| openHooks | array | — | 未关闭悬念列表 |
| timeline | array | — | 累积时间线 |
| chapterSummary | string | — | 章节摘要 |
| committedAt | number | ✅ | 提交时间戳 |

### antiPatterns 表

| 字段 | 类型 | 索引 | 说明 |
|------|------|------|------|
| id | string | 主键 | 格式: `ap_${bookId}_${timestamp}_${index}` |
| bookId | string | ✅ | 所属书籍 |
| text | string | — | 反模式描述 |
| source | string | — | 来源（review） |
| category | string | ✅ | 问题类别 |
| frequency | number | ✅ | 出现频次 |
| firstSeen | number | — | 首次发现时间 |
| lastSeen | number | ✅ | 最近发现时间 |
