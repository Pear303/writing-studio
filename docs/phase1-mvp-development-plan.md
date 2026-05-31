# 阶段1：最小可行集成（MVP）— 详细开发计划

## 总览

| 项目 | 内容 |
|------|------|
| **目标** | Writing Studio 能通过 Agent 面板与智能体对话，Agent 能读取/写入写作数据，实现"对话式写作助手" |
| **工期** | 预计 2-3 周（按子任务拆分） |
| **架构** | Writing Studio (Tauri+React) ←→ HTTP/SSE ←→ Agent Backend (FastAPI) |
| **核心交付物** | ① Agent后端写作工具 ② 数据桥接API ③ 前端Agent面板 ④ 写作子代理模板 |

---

## 架构总图

```
┌──────────────────────────────────────────────────────────────┐
│                 Writing Studio (Tauri + React)                │
│                                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐  │
│  │ 编辑器    │ │ 素材面板  │ │ 质检面板  │ │ AgentPanel 🆕  │  │
│  │ (TipTap) │ │          │ │          │ │  对话界面       │  │
│  └──────────┘ └──────────┘ └──────────┘ │  工具调用可视化  │  │
│                                          │  快捷指令       │  │
│  ┌──────────────────────────────────────┐ └───────┬────────┘  │
│  │         数据桥接 API 层 🆕           │         │           │
│  │  GET/POST /api/studio/books          │         │           │
│  │  GET/POST /api/studio/chapters       │         │           │
│  │  GET/POST /api/studio/materials      │         │           │
│  │  GET/POST /api/studio/outlines       │         │           │
│  └──────────────────────────────────────┘         │           │
│                     │                              │           │
│                     │ Dexie (IndexedDB)            │ HTTP/SSE  │
├─────────────────────┼──────────────────────────────┼───────────┤
│                     │                              │           │
│           ┌─────────▼──────────┐      ┌────────────▼────────┐ │
│           │  Studio Bridge API │      │   Agent Backend      │ │
│           │  (FastAPI route)   │      │   (FastAPI)          │ │
│           │  🆕 内嵌于Tauri    │      │                      │ │
│           └────────────────────┘      │  ┌────────────────┐  │ │
│                                       │  │ LCAgent        │  │ │
│                                       │  │ + 写作工具 🆕   │  │ │
│                                       │  │ + 写作子代理🆕  │  │ │
│                                       │  └────────────────┘  │ │
│                                       └─────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## 数据桥接方案（MVP：文件桥接）

MVP 阶段采用文件桥接方案，避免引入 HTTP 服务的复杂度：

1. Writing Studio 导出数据为 JSON/MD 文件到 `studio-data/` 目录
2. Agent 后端通过现有 `read_file` 工具直接读取
3. Agent 写入操作通过 `write_file` 写入 `studio-data/pending/` 目录
4. Writing Studio 前端轮询 `pending/` 目录，执行写入并删除已处理的文件

### 数据导出格式

```
studio-data/
├── manifest.json           # 元信息：导出时间、用户ID、书籍列表
├── books/
│   └── {book_id}/
│       ├── book.json       # 书籍元数据
│       ├── volumes.json    # 卷列表
│       ├── outline.md      # 大纲（合并所有卷）
│       ├── chapters/
│       │   ├── chapter_001.md   # 第1章正文
│       │   ├── chapter_002.md   # 第2章正文
│       │   └── ...
│       ├── detailed_outlines/
│       │   ├── chapter_001_outline.md
│       │   └── ...
│       └── materials/
│           ├── characters.json  # 角色素材
│           ├── locations.json   # 地点素材
│           └── ...
└── pending/                # Agent 写入的待处理操作
    ├── new_chapter_001.json
    └── ...
```

---

## 子任务详细拆分

### 📦 Task 1：Agent 后端 — 写作专用工具

**涉及文件**：
- 新建 `agent/writing_tools.py`
- 修改 `agent/lc_agent.py`（注册新工具）
- 修改 `agent/lc_tools.py`（注入依赖）

#### Tool 清单

| 工具名 | 功能 | 参数 |
|--------|------|------|
| `read_books` | 读取书籍列表 | 无 |
| `read_chapters` | 读取章节内容 | book_id, chapter_id?, volume_id? |
| `read_outline` | 读取大纲 | book_id, volume_id? |
| `read_materials` | 读取素材 | book_id?, material_type? |
| `write_chapter_draft` | 写入章节草稿 | book_id, volume_id, title, content, detailed_outline? |
| `search_knowledge` | 知识搜索 | query, max_results? |

#### 依赖注入

在 `lc_tools.py` 中新增：
```python
_studio_api_base: str | None = None

def set_studio_api_base(url: str) -> None:
    global _studio_api_base
    _studio_api_base = url
```

在 `LCAgent.__init__` 中注册新工具：
```python
self.tools = [
    read_file, write_file, edit_file,
    run_command, web_fetch, load_skill,
    glob_tool, grep_tool, update_todos,
    dispatch_subagent,
    read_books, read_chapters, read_outline,
    read_materials, write_chapter_draft, search_knowledge,
]
```

---

### 📦 Task 2：数据桥接（文件导出/导入）

**涉及文件**：
- 新建 `src/bridge/exporter.ts` — 导出数据到文件
- 新建 `src/bridge/importer.ts` — 导入 Agent 的写入操作
- 新建 `src/bridge/watcher.ts` — 轮询 pending 目录

#### 导出器核心逻辑

```typescript
export async function exportBookForAgent(bookId: string, targetDir: string): Promise<void> {
  const book = await db.books.get(bookId);
  const volumes = await db.volumes.where('bookId').equals(bookId).toArray();
  const chapters = await db.chapters.where('bookId').equals(bookId).toArray();
  const materials = await db.materials.where('bookId').equals(bookId).toArray();

  writeJson(path.join(targetDir, 'manifest.json'), {
    exportedAt: Date.now(),
    book: { id: book.id, name: book.name, status: book.status, totalWords: book.totalWords },
    volumeCount: volumes.length,
    chapterCount: chapters.length,
  });

  writeJson(path.join(targetDir, 'books', bookId, 'book.json'), book);
  writeJson(path.join(targetDir, 'books', bookId, 'volumes.json'), volumes);

  for (const vol of volumes) {
    if (vol.outline) {
      const outlineData = JSON.parse(vol.outline) as OutlineItemData[];
      const md = outlineItemsToMarkdown(outlineData);
      writeFile(path.join(targetDir, 'books', bookId, `outline_${vol.id}.md`), md);
    }
  }

  for (const ch of chapters) {
    writeFile(path.join(targetDir, 'books', bookId, 'chapters', `chapter_${ch.id}.md`),
      `# ${ch.title}\n\n${ch.content}`);
    if (ch.detailedOutline) {
      writeFile(path.join(targetDir, 'books', bookId, 'detailed_outlines', `chapter_${ch.id}_outline.md`),
        ch.detailedOutline);
    }
  }

  const materialsByType = groupBy(materials, 'type');
  for (const [type, items] of Object.entries(materialsByType)) {
    writeJson(path.join(targetDir, 'books', bookId, 'materials', `${type}s.json`), items);
  }
}
```

---

### 📦 Task 3：前端 Agent 面板

**涉及文件**：
- 新建 `src/components/AgentPanel/index.tsx`
- 新建 `src/components/AgentPanel/ChatView.tsx`
- 新建 `src/components/AgentPanel/ToolCallView.tsx`
- 新建 `src/components/AgentPanel/QuickActions.tsx`
- 新建 `src/hooks/useAgent.ts`
- 修改 `src/components/RightActivityBar/index.tsx`
- 修改 `src/types/index.ts`

#### 类型定义

```typescript
export type RightActivityId = 'preview' | 'outline' | 'qa' | 'agent';

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: AgentToolCall[];
  isStreaming?: boolean;
}

export interface AgentToolCall {
  tool: string;
  input: string;
  output?: string;
  status: 'running' | 'completed' | 'error';
  subagent?: string;
}

export interface AgentConfig {
  apiUrl: string;
  sessionId?: string;
  enabled: boolean;
}

export interface AgentState {
  connected: boolean;
  running: boolean;
  messages: AgentMessage[];
  currentToolCalls: AgentToolCall[];
  tokenUsage: { input: number; output: number; total: number };
}
```

#### useAgent Hook

```typescript
export function useAgent(config: AgentConfig) {
  const [state, setState] = useState<AgentState>({...});

  const sendMessage = async (message: string) => {
    // 1. 添加用户消息
    // 2. fetch POST to Agent Backend /api/chat
    // 3. 消费 SSE 事件流
  };

  const quickActions = {
    analyzeScientific: (text: string) => sendMessage(`请分析以下文段的科学性严谨性：\n${text}`),
    summarizeKnowledge: (domain: string) => sendMessage(`请搜索并汇总${domain}领域的知识，整理为写作素材`),
    reviewChapter: (chapterId: string) => sendMessage(`请评审当前章节的写作质量`),
    continueWriting: () => sendMessage(`请根据当前大纲和前文，续写下一章`),
  };

  return { state, sendMessage, quickActions };
}
```

#### AgentPanel 组件结构

```
AgentPanel
├── 顶部：连接状态指示器 + 设置按钮
├── 中部：ChatView（对话消息列表）
│   ├── 用户消息气泡
│   ├── 助手消息气泡（支持流式渲染）
│   └── ToolCallView（工具调用卡片，可折叠）
├── 底部：QuickActions（快捷指令栏）
│   ├── 🔍 分析科学性
│   ├── 📚 汇总知识
│   ├── ✍️ 续写章节
│   └── 📋 评审质量
└── 最底部：输入框 + 发送按钮
```

---

### 📦 Task 4：写作子代理模板

**涉及文件**：
- 新建 `templates/subagents/writing_coach.md`
- 新建 `templates/subagents/research_writer.md`
- 新建 `templates/subagents/consistency_checker.md`
- 修改 `agent/subagents/registry.py`

#### writing_coach（写作教练）

- 评审维度：情节逻辑、人物塑造、对话质量、节奏控制、语言风格、读者体验
- 工具白名单：read_books, read_chapters, read_outline, read_materials, load_skill
- max_turns: 12

#### research_writer（研究型写手）

- 工作流程：接收任务 → 识别事实点 → 搜索验证 → 整理素材 → 标注来源
- 工具白名单：read_books, read_chapters, read_outline, read_materials, search_knowledge, web_fetch, load_skill
- max_turns: 15

#### consistency_checker（一致性检查员）

- 检查维度：角色一致性、时间线、设定一致性、伏笔追踪、素材匹配
- 工具白名单：read_books, read_chapters, read_outline, read_materials, load_skill
- max_turns: 15

---

### 📦 Task 5：Agent 配置与连接管理

**涉及文件**：
- 修改 `src/components/LlmConfigPanel/index.tsx`
- 新建 `src/bridge/agentConfig.ts`
- 修改 `src/types/index.ts`

#### 配置项

```typescript
interface AgentConfig {
  enabled: boolean;
  backendUrl: string;      // 默认 http://localhost:8000
  autoExport: boolean;     // 自动导出数据给 Agent
  exportPath: string;      // 导出路径
  defaultModel: string;    // Agent 使用的模型
}
```

---

## 开发顺序与依赖关系

```
Week 1:
┌─────────────────────────────────────────────────────┐
│ Day 1-2: Task 2 (数据桥接 - 文件导出/导入)           │
│          ↓                                           │
│ Day 3-4: Task 1 (Agent 写作工具)                      │
│          ↓ 依赖 Task 2 的文件格式                     │
│ Day 5:   Task 1 测试 + Task 4 (子代理模板)            │
└─────────────────────────────────────────────────────┘

Week 2:
┌─────────────────────────────────────────────────────┐
│ Day 1-2: Task 3 (前端 Agent 面板 - 基础对话)          │
│          ↓                                           │
│ Day 3:   Task 3 (工具调用可视化)                       │
│          ↓                                           │
│ Day 4:   Task 5 (配置管理) + 集成测试                  │
│          ↓                                           │
│ Day 5:   端到端联调 + Bug 修复                        │
└─────────────────────────────────────────────────────┘

Week 3 (buffer):
┌─────────────────────────────────────────────────────┐
│ Day 1-2: 快捷指令完善 + 交互优化                       │
│ Day 3:   子代理调优（prompt 迭代）                     │
│ Day 4-5: 边界情况处理 + 文档                          │
└─────────────────────────────────────────────────────┘
```

---

## 每日详细任务清单

### Week 1 — 后端核心

#### Day 1-2：数据桥接（文件导出/导入）

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 1 | 创建 `src/bridge/exporter.ts` | 新建 | 能将指定书籍的所有数据导出为 JSON/MD 文件到指定目录 |
| 2 | 创建 `src/bridge/importer.ts` | 新建 | 能读取 pending 目录的 JSON 文件，执行章节创建/素材添加 |
| 3 | 创建 `src/bridge/watcher.ts` | 新建 | 每 3 秒轮询 pending 目录，发现新文件则导入并删除 |
| 4 | 在 App.tsx 中集成导出/导入 | 修改 | 应用启动时自动导出当前书籍数据 |
| 5 | 在 ActivityBar 或菜单中添加"同步到 Agent"按钮 | 修改 | 手动触发全量导出 |

#### Day 3-4：Agent 写作工具

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 6 | 创建 `agent/writing_tools.py` | 新建 | 6 个 @tool 函数，每个有完整的 docstring |
| 7 | 实现 `read_books` | 新建 | 能从 studio-data/manifest.json 读取书籍列表 |
| 8 | 实现 `read_chapters` | 新建 | 能读取指定章节的 .md 文件 |
| 9 | 实现 `read_outline` | 新建 | 能读取大纲 .md 文件 |
| 10 | 实现 `read_materials` | 新建 | 能读取素材 .json 文件 |
| 11 | 实现 `write_chapter_draft` | 新建 | 能写入 pending/new_chapter_xxx.json |
| 12 | 实现 `search_knowledge` | 新建 | 封装 web_fetch + 搜索，返回结构化结果 |
| 13 | 修改 `lc_agent.py` 注册新工具 | 修改 | `self.tools` 列表包含 6 个新工具 |
| 14 | 修改 `lc_tools.py` 注入 studio_api_base | 修改 | `set_studio_api_base()` 可用 |

#### Day 5：子代理模板 + 工具测试

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 15 | 创建 `templates/subagents/writing_coach.md` | 新建 | 模板内容完整，评审维度清晰 |
| 16 | 创建 `templates/subagents/research_writer.md` | 新建 | 模板内容完整，工作流程明确 |
| 17 | 创建 `templates/subagents/consistency_checker.md` | 新建 | 模板内容完整，检查维度完整 |
| 18 | 修改 `agent/subagents/registry.py` | 修改 | `_BUILTIN_SPECS` 包含 3 个新子代理 |
| 19 | 更新 `_SKILL_AGENT_MAP` | 修改 | 写作相关技能映射到新子代理 |
| 20 | 手动测试：Agent 能读取导出的书籍数据 | 测试 | `read_books()` 返回正确数据 |

### Week 2 — 前端面板 + 集成

#### Day 1-2：Agent 面板基础

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 21 | 新增 Agent 类型定义 | 修改 types/index.ts | `AgentMessage`, `AgentToolCall`, `AgentConfig`, `AgentState` 类型完整 |
| 22 | 创建 `src/hooks/useAgent.ts` | 新建 | `sendMessage()` 能通过 SSE 与 Agent 后端通信 |
| 23 | 创建 `src/components/AgentPanel/index.tsx` | 新建 | 基础面板框架：头部状态 + 消息列表 + 输入框 |
| 24 | 创建 `src/components/AgentPanel/ChatView.tsx` | 新建 | 能渲染用户/助手消息，支持流式显示 |
| 25 | 修改 `RightActivityBar` 新增 Agent 图标 | 修改 | 右侧活动栏出现"智能体"图标 |

#### Day 3：工具调用可视化

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 26 | 创建 `src/components/AgentPanel/ToolCallView.tsx` | 新建 | 工具调用卡片：名称+状态+可折叠的输入输出 |
| 27 | ChatView 集成 ToolCallView | 修改 | 助手消息中内嵌工具调用卡片 |
| 28 | SSE 事件消费：tool_start/tool_end | 修改 useAgent.ts | 工具调用状态实时更新 |

#### Day 4：配置管理 + 集成

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 29 | 创建 `src/bridge/agentConfig.ts` | 新建 | Agent 配置持久化到 localStorage |
| 30 | LlmConfigPanel 新增 Agent 配置标签 | 修改 | 可配置后端地址、启用/禁用 |
| 31 | App.tsx 集成 AgentPanel | 修改 | 右侧面板切换到"智能体"时显示 AgentPanel |
| 32 | 连接检测逻辑 | 修改 useAgent.ts | 启动时检测 Agent 后端是否可达 |

#### Day 5：端到端联调

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 33 | 启动 Agent 后端 + Writing Studio | - | 两个服务都能正常启动 |
| 34 | 测试：在 Agent 面板发送"读取我的书籍列表" | - | Agent 调用 read_books，返回正确数据 |
| 35 | 测试：发送"分析第1章的科学性" | - | Agent 调用 research_writer 子代理，返回分析结果 |
| 36 | 测试：发送"帮我写一章" | - | Agent 生成内容并通过 write_chapter_draft 写入 |
| 37 | Bug 修复 | - | 修复联调中发现的问题 |

### Week 3 — 优化 + 完善

#### Day 1-2：快捷指令 + 交互优化

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 38 | 创建 `src/components/AgentPanel/QuickActions.tsx` | 新建 | 4个快捷指令按钮 |
| 39 | 快捷指令：选中文字 → "分析科学性" | 修改 | 编辑器右键菜单新增"Agent 分析"选项 |
| 40 | 快捷指令：章节面板 → "评审此章" | 修改 | 章节右键菜单新增"Agent 评审"选项 |
| 41 | 消息持久化 | 修改 useAgent.ts | Agent 对话历史保存到 IndexedDB |
| 42 | 流式渲染优化 | 修改 ChatView.tsx | Markdown 渲染 + 代码高亮 |

#### Day 3：子代理调优

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 43 | writing_coach prompt 迭代 | 修改 | 评审结果更具体、更有建设性 |
| 44 | research_writer prompt 迭代 | 修改 | 搜索结果更精准、素材整理更结构化 |
| 45 | consistency_checker prompt 迭代 | 修改 | 能发现真实的逻辑矛盾，误报率低 |
| 46 | 新增 `skills/novel-writing/SKILL.md` | 新建 | 小说写作技能包，包含写作规范和技巧 |

#### Day 4-5：边界情况 + 文档

| # | 任务 | 文件 | 验收标准 |
|---|------|------|---------|
| 47 | 处理 Agent 后端断开的情况 | 修改 useAgent.ts | 断开时显示提示，自动重连 |
| 48 | 处理超长章节的 token 截断 | 修改 writing_tools.py | 超长章节自动摘要或分段 |
| 49 | 处理并发写入冲突 | 修改 importer.ts | pending 文件加锁或序列化处理 |
| 50 | 编写 MVP 使用说明 | 更新 README | 启动步骤、配置方法、使用示例 |

---

## 验收标准（MVP 完成标志）

| # | 验收场景 | 预期结果 |
|---|---------|---------|
| 1 | 打开 Writing Studio，切换到"智能体"面板 | 显示 Agent 对话界面，连接状态为绿色 |
| 2 | 输入"读取我的书籍列表" | Agent 调用 `read_books`，返回当前书籍摘要 |
| 3 | 输入"分析第X章的科学性" | Agent 派遣 `research_writer` 子代理，搜索验证，返回分析报告 |
| 4 | 输入"评审当前章节" | Agent 派遣 `writing_coach` 子代理，返回6维度评审 |
| 5 | 输入"检查全书一致性" | Agent 派遣 `consistency_checker` 子代理，返回矛盾清单 |
| 6 | 输入"帮我写第X章" | Agent 读取大纲+前文+素材，生成章节，写入草稿 |
| 7 | 点击快捷指令"分析科学性"（选中文字后） | 自动构造 prompt 发送给 Agent |
| 8 | Agent 工具调用过程可视化 | 对话中显示工具调用卡片，实时更新状态 |
| 9 | Agent 后端断开 | 面板显示红色断开状态，提示用户 |
| 10 | 数据同步 | Writing Studio 修改章节后，Agent 能读取到最新内容 |

---

## 风险与应对

| 风险 | 概率 | 影响 | 应对 |
|------|------|------|------|
| 文件桥接延迟（Agent 读取到旧数据） | 中 | 中 | 导出时加时间戳，Agent 读取前检查 freshness |
| Agent 生成内容质量不稳定 | 高 | 中 | 子代理 prompt 迭代优化，增加 few-shot 示例 |
| Token 消耗过大（全书内容超出上下文） | 高 | 高 | 分段读取，智能摘要，Compactor 压缩 |
| SSE 连接不稳定 | 低 | 中 | 前端自动重连 + 断点续传 |
| Tauri 安全策略阻止本地 HTTP 请求 | 中 | 高 | 配置 CSP 允许 localhost，或改用 Tauri IPC |
