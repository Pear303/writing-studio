# Agent 性能优化实战教程

> 本教程基于 Writing Studio 项目的真实优化经历，系统讲解多 Agent 系统中的性能优化技术。
> 假设你已经了解：多 Agent 协作、工具调用（Tool Calling）、ReAct 循环等基础概念。

---

## 目录

1. [问题诊断：Agent 系统的性能瓶颈在哪？](#1-问题诊断agent-系统的性能瓶颈在哪)
2. [优化1：只读工具并发执行](#2-优化1只读工具并发执行)
3. [优化2：控制工具返回体积](#3-优化2控制工具返回体积)
4. [优化3：跨任务共享上下文（批量派遣 vs 逐个派遣）](#4-优化3跨任务共享上下文批量派遣-vs-逐个派遣)
5. [优化4：只读工具结果缓存](#5-优化4只读工具结果缓存)
6. [优化5：Prompt 工程驱动的行为优化](#6-优化5prompt-工程驱动的行为优化)
7. [组合拳：各优化的协同效果](#7-组合拳各优化的协同效果)
8. [设计决策回顾：哪些我们没做，为什么](#8-设计决策回顾哪些我们没做为什么)

---

## 1. 问题诊断：Agent 系统的性能瓶颈在哪？

### 1.1 一个典型的多 Agent 写作流水线

Writing Studio 的写作流水线是这样的：

```
用户输入 "帮我写一本5章的科幻小说"
        │
        ▼
┌─────────────────────────┐
│  Pipeline Orchestrator   │  ← 编排器，负责拆解步骤
│  (主 Agent)              │
└──────────┬──────────────┘
           │ dispatch_subagent()
           ▼
┌─────────────────────────┐
│  Research Writer         │  ← 写手，负责生成大纲/细纲/正文
│  (子 Agent)              │
└──────────────────────────┘
```

Orchestrator 通过 `dispatch_subagent()` 派遣子 Agent。每个子 Agent 内部运行一个 **ReAct 循环**：

```
思考 → 调用工具 → 观察结果 → 思考 → 调用工具 → ... → 最终回答
```

每一轮"思考+工具调用"消耗一次 LLM 调用（通常几百到几千 token）。

### 1.2 瓶颈定位

我们用一张图来展示**优化前**的完整执行流程（5 章小说）：

```
Orchestrator 派遣 research_writer 生成大纲
  └─ ReAct 循环：思考 → read_outline → 思考 → read_materials → 思考 → 生成大纲

Orchestrator 派遣 research_writer 生成细纲
  └─ ReAct 循环：思考 → read_outline → 思考 → read_materials → 思考 → 生成细纲

Orchestrator 派遣 research_writer 写第1章
  └─ ReAct 循环：思考 → read_outline → 思考 → read_materials → 思考 → write_chapter_draft

Orchestrator 派遣 research_writer 写第2章
  └─ ReAct 循环：思考 → read_outline → 思考 → read_materials → 思考 → write_chapter_draft

... (第3-5章同理)

Orchestrator 派遣 consistency_checker 检查
  └─ ReAct 循环：思考 → read_chapters → 思考 → read_outline → ...

Orchestrator 派遣 writing_coach 审阅
  └─ ReAct 循环：思考 → read_chapters → 思考 → read_materials → ...
```

**数一数 LLM 调用次数**：
- 生成大纲：~5 轮
- 生成细纲：~5 轮
- 写 5 章：5 × ~5 轮 = ~25 轮
- 一致性检查：~5 轮
- 质量审阅：~5 轮
- **总计：~45 轮 LLM 调用**

其中，`read_outline` 被调用了 **7 次**（大纲1次 + 细纲1次 + 每章1次×5），每次都重新读取同一个文件。`read_materials` 同理。

**核心瓶颈**：
1. **串行工具调用**：read_outline → 等结果 → read_materials → 等结果，明明可以并行
2. **重复读取**：同样的大纲被读取 7 次，同样的素材被读取 7 次
3. **逐章派遣**：每章独立启动一个 ReAct 循环，重复初始化开销
4. **返回体积过大**：有时只需要大纲结构，却返回了完整内容

---

## 2. 优化1：只读工具并发执行

### 2.1 问题分析

标准 LangChain `AgentExecutor` 的行为是：LLM 在一轮回复中发出多个工具调用时，**顺序执行**。

```
LLM 输出：[read_outline(...), read_materials(...), read_books()]

AgentExecutor 执行：
  read_outline(...)   → 等 2 秒
  read_materials(...)  → 等 1.5 秒
  read_books(...)      → 等 0.5 秒
  总耗时：4 秒
```

但这三个工具都是**只读**的，彼此没有依赖关系，完全可以并行：

```
并行执行：
  read_outline(...)   ─┐
  read_materials(...)  ─┤ → 总耗时：2 秒（取最慢的）
  read_books(...)      ─┘
```

### 2.2 实现方案：ParallelAgentExecutor

核心思路是继承 `AgentExecutor`，覆盖 `_iter_next_step()` 方法，将同一帧内的只读工具分组并发执行。

```python
# subagent_parallel.py

# 定义哪些工具是只读的（可安全并发）
_READ_ONLY_TOOLS = {
    "web_fetch", "read_file", "glob_tool", "grep_tool",
    "read_books", "read_chapters", "read_outline",
    "read_materials", "search_knowledge",
}


class ParallelAgentExecutor(AgentExecutor):
    """AgentExecutor 子类，同一帧内的只读工具调用并发执行。"""

    def _iter_next_step(self, name_to_tool_map, color_mapping, inputs,
                        intermediate_steps, run_manager=None):
        # 1. 调用 LLM 获取 action 列表（与父类相同）
        output = self._action_agent.plan(intermediate_steps, **inputs)

        if isinstance(output, AgentFinish):
            yield output
            return

        actions = [output] if isinstance(output, AgentAction) else output

        # 2. 先 yield 所有 action（供日志/回调使用）
        for agent_action in actions:
            yield agent_action

        # 3. 核心逻辑：将连续的只读工具分组，并发执行
        i = 0
        while i < len(actions):
            agent_action = actions[i]

            # 非只读工具 → 顺序执行
            if agent_action.tool not in _READ_ONLY_TOOLS:
                yield self._perform_agent_action(...)
                i += 1
                continue

            # 收集连续出现的只读工具
            group = []
            while i < len(actions) and actions[i].tool in _READ_ONLY_TOOLS:
                group.append(actions[i])
                i += 1

            if len(group) == 1:
                # 只有一个，顺序执行即可
                yield self._perform_agent_action(...)
                continue

            # 多个只读工具 → ThreadPoolExecutor 并发执行
            with ThreadPoolExecutor(max_workers=len(group)) as pool:
                results = list(pool.map(_run_tool, group))

            for step in results:
                yield step
```

### 2.3 关键设计决策

**Q：为什么不把所有只读工具一起并发，而要按"连续出现"分组？**

A：因为 LLM 输出的工具调用顺序可能隐含依赖关系。比如：

```
[read_outline(...), read_materials(...), write_chapter_draft(...), read_chapters(...)]
```

这里 `write_chapter_draft` 是写操作，它后面的 `read_chapters` 依赖它的执行结果。所以必须按连续只读工具分组：

```
组1（并发）：[read_outline, read_materials]
组2（顺序）：write_chapter_draft
组3（顺序）：read_chapters  ← 必须等 write_chapter_draft 完成
```

**Q：为什么用线程池而不是 asyncio？**

A：LangChain 的工具执行是同步的（`.run()` 方法），且 `AgentExecutor` 本身是同步迭代器。用 `ThreadPoolExecutor` 是最小侵入的改法，不需要重写整个执行框架。

### 2.4 效果

- 3 个只读工具串行执行：2s + 1.5s + 0.5s = **4 秒**
- 3 个只读工具并发执行：max(2s, 1.5s, 0.5s) = **2 秒**
- **节省 50% 工具执行时间**

---

## 3. 优化2：控制工具返回体积

### 3.1 问题分析

LLM 的上下文窗口是有限的。如果工具返回的内容过多，会导致：

1. **Token 浪费**：大纲 3 万字全部塞进上下文，但 LLM 只需要知道"第3章讲什么"
2. **信息淹没**：太多无关信息干扰 LLM 的判断
3. **成本增加**：输入 token 越多，API 费用越高

### 3.2 实现方案：summary 参数 + max_length 参数

在工具定义中添加两个参数：

```python
@tool
def read_outline(
    book_id: str,
    volume_id: Optional[str] = None,
    summary: bool = False,      # ← 新增：只返回结构摘要
    max_length: int = 8000,     # ← 新增：控制返回长度
) -> str:
```

**summary=True 模式**：只返回标题列表和字数统计

```
卷 vol_001: 15000 字符, 12 个标题
  # 第一卷：启程
  ## 第一章 命运的召唤
  ## 第二章 未知的世界
  ...
```

**summary=False 模式**（默认）：返回完整内容，但受 max_length 限制

```
## 卷 vol_001 的大纲

# 第一卷：启程

## 第一章 命运的召唤
林远站在天台上，望着城市的天际线...

...(大纲过长，已截断至8000字符)
```

### 3.3 两阶段读取策略

在 Prompt 中指导 Agent 采用"两阶段读取"策略：

```
第一阶段：用 summary=True 了解全貌
  read_outline(book_id="xxx", summary=True)
  → 返回：12个标题，15000字符

第二阶段：只在需要时读取具体部分
  read_outline(book_id="xxx", volume_id="vol_001", max_length=3000)
  → 返回：第一卷的前3000字符
```

### 3.4 效果

- 原来每次 read_outline 返回 15000 字符
- 优化后 summary 模式返回 ~500 字符
- **节省 97% 的工具返回体积**

---

## 4. 优化3：跨任务共享上下文（批量派遣 vs 逐个派遣）

### 4.1 问题分析

这是**最大的性能瓶颈**。原来的流程是：

```
orchestrator 派遣 research_writer 写第1章
  → 新建 AgentExecutor，chat_history=[]
  → ReAct 循环：read_outline → read_materials → 思考 → write_chapter_draft
  → 返回结果，AgentExecutor 销毁

orchestrator 派遣 research_writer 写第2章
  → 新建 AgentExecutor，chat_history=[]  ← 上下文全部丢失！
  → ReAct 循环：read_outline → read_materials → 思考 → write_chapter_draft
  → 返回结果，AgentExecutor 销毁

... 每章都重复上述过程
```

**问题**：
1. 每次派遣都创建新的 AgentExecutor，`chat_history=[]`，上下文从零开始
2. 同样的大纲+素材被读取 N 次（N = 章节数）
3. 前章内容无法传递给后章，连贯性差
4. 每次初始化 AgentExecutor 有固定开销（创建 agent、绑定工具等）

### 4.2 方案对比

| 方案 | 描述 | 优点 | 缺点 |
|------|------|------|------|
| A. 逐章派遣 | 每章独立 ReAct 循环 | 简单、隔离性好 | 重复读取、无连贯性 |
| B. 长连接 AgentExecutor | 复用同一个 Executor 实例 | 上下文共享 | 实现复杂、需管理生命周期 |
| C. 批量派遣 | 一次派遣完成所有章节 | 简单、上下文自然共享 | scratchpad 会膨胀 |

我们选择了**方案 C：批量派遣**。原因：

- **实现最简单**：不需要修改 `dispatch_subagent` 的核心逻辑，只需改 Prompt 和 max_turns
- **上下文自然共享**：ReAct 循环的 scratchpad 中保留了前章内容，后续章节自然连贯
- **风险可控**：即使中途失败，已通过 `write_chapter_draft` 提交的章节不会丢失

### 4.3 实现细节

#### 4.3.1 修改 Orchestrator 的 Prompt

在 `pipeline_orchestrator.md` 中，步骤4 从"逐章派遣"改为"一次性派遣"：

```markdown
### 步骤 4：撰写正文（一次性派遣 research_writer 撰写所有章节）
- **一次性**派遣 research_writer 撰写所有章节，不要逐章派遣
- 在 task 中包含：所有章节的细纲要点 + book_id + volume_id + 角色设定摘要
```

关键是在 task 中**预置所有章节的细纲要点**，这样 research_writer 不需要再读取细纲：

```
请撰写以下所有章节的正文。

## 书籍信息
book_id=XXX, volume_id=XXX

## 章节列表与细纲
### 第1章「命运的召唤」
林远站在天台上，望着城市的天际线...

### 第2章「未知的世界」
穿越传送门后，林远发现自己置身于一片...

...（所有章节）

## 涉及角色
- 林远：退役特种兵，性格沉稳
- 苏晴：天才科学家，好奇心强

## 写作要求
- 请先读取完整大纲和素材，然后逐章撰写
- 每章写完后立即通过 write_chapter_draft 提交，然后继续下一章
- 前章内容在你的上下文中，直接参考保持连贯性
```

#### 4.3.2 修改 Research Writer 的 Prompt

在 `research_writer.md` 中新增"批量写作模式"：

```markdown
## 批量写作模式

当任务要求你撰写多个章节时，你必须在**同一个 ReAct 循环**中完成所有章节。

### 批量写作流程
1. **准备阶段**（一轮完成）：同时读取大纲 + 素材 + 已有章节
2. **逐章撰写**：每章写完后立即通过 write_chapter_draft 提交，然后继续下一章
3. **进度更新**：每章提交后调用 update_pipeline_progress 更新进度
4. **汇报阶段**：所有章节完成后，用简短中文汇报

**不要在章节之间停下来等待指令**，连续撰写直到所有章节完成。
```

#### 4.3.3 调整 max_turns

原来 `max_turns=20`，只够写 2-3 章。批量写作需要更多轮次：

```python
"research_writer": {
    "tool_names": (
        "read_books", "read_chapters", "read_outline",
        "read_materials", "search_knowledge",
        "write_chapter_draft", "update_pipeline_progress",  # ← 新增
    ),
    "max_turns": 40,  # 20 → 40
}
```

计算逻辑：每章约 3 轮（撰写 + 提交 + 更新进度），10 章 = 30 轮 + 初始读取 1 轮 + 汇报 1 轮 = 32 轮，40 轮留有余量。

#### 4.3.4 新增 update_pipeline_progress 工具权限

原来 research_writer 没有进度更新权限，前端看不到逐章进度。新增后：

```python
"tool_names": (
    ...,
    "update_pipeline_progress",  # ← 让 research_writer 能更新前端进度
)
```

### 4.4 上下文共享的原理

批量派遣的核心是利用 ReAct 循环的 **scratchpad**（草稿板）机制：

```
第1轮（LLM 思考）：
  "我需要先读取大纲和素材..."
  → 调用 read_outline + read_materials（并发）

第2轮（LLM 思考）：
  "好的，大纲和素材已读取。现在开始写第1章..."
  → 输出第1章正文
  → 调用 write_chapter_draft(title="第1章", content="...")
  → 调用 update_pipeline_progress(step_index=3, status="running", result="第1章已完成")

第3轮（LLM 思考）：
  "第1章已提交。现在写第2章，注意与第1章结尾衔接..."
  → 输出第2章正文（LLM 能看到第1章的内容，因为它们在同一个 scratchpad 中）
  → 调用 write_chapter_draft(title="第2章", content="...")
```

**scratchpad 中保留了什么**：
- 第1轮：read_outline 和 read_materials 的返回结果
- 第2轮：第1章的正文 + 提交确认
- 第3轮：LLM 可以回顾第1章结尾，自然衔接第2章开头

这就是"跨章共享上下文"——不需要额外的上下文传递机制，ReAct 循环的 scratchpad 天然就是共享的。

### 4.5 效果对比

**优化前（逐章派遣，5 章）**：
```
5 次 dispatch_subagent 调用
5 × (read_outline + read_materials + 思考 + write_chapter_draft) = ~25 轮 LLM 调用
5 × 读取大纲 = 5 次文件读取
5 × 读取素材 = 5 次文件读取
```

**优化后（批量派遣，5 章）**：
```
1 次 dispatch_subagent 调用
1 × (read_outline + read_materials) + 5 × (思考 + write_chapter_draft + update_progress) = ~17 轮 LLM 调用
1 × 读取大纲 = 1 次文件读取
1 × 读取素材 = 1 次文件读取
```

**节省**：~32% LLM 调用 + 80% 文件读取

---

## 5. 优化4：只读工具结果缓存

### 5.1 问题分析

即使在批量派遣模式下，research_writer 在一个 ReAct 循环内也可能多次调用相同的只读工具：

```
第1轮：read_outline(book_id="xxx", summary=True)  → 了解结构
第3轮：read_outline(book_id="xxx", summary=False)  → 读取完整内容
第5轮：read_materials(book_id="xxx", material_type="character")  → 读取角色
第8轮：read_materials(book_id="xxx", material_type="character")  ← 重复！LLM 忘了已经读过
```

LLM 有时会"忘记"自己已经调用过某个工具，或者在新的思考轮次中重新请求相同的数据。

### 5.2 实现方案

在 `writing_tools.py` 中添加模块级缓存：

```python
# 模块级缓存字典
_tool_cache: dict[str, str] = {}


def clear_tool_cache() -> None:
    """清空只读工具缓存。"""
    _tool_cache.clear()


def _cache_key(func_name: str, **kwargs) -> str:
    """生成缓存键：函数名 + 排序后的参数。"""
    sorted_args = sorted(kwargs.items())
    args_str = "&".join(f"{k}={v}" for k, v in sorted_args)
    return f"{func_name}:{args_str}"
```

然后在每个只读工具中添加缓存逻辑：

```python
@tool
def read_outline(book_id: str, volume_id=None, summary=False, max_length=8000) -> str:
    # 1. 检查缓存
    cache_k = _cache_key("read_outline",
                         book_id=book_id,
                         volume_id=volume_id or "",
                         summary=summary,
                         max_length=max_length)
    if cache_k in _tool_cache:
        return _tool_cache[cache_k]

    # 2. 正常执行
    try:
        # ... 原有逻辑 ...
        result = "\n\n---\n\n".join(results)

        # 3. 写入缓存
        _tool_cache[cache_k] = result
        return result
    except Exception as e:
        return f"读取大纲失败: {e}"
```

### 5.3 缓存键设计

缓存键由**函数名 + 所有参数的排序拼接**组成：

```
read_outline:book_id=xxx&max_length=8000&summary=True&volume_id=vol_001
read_materials:book_id=xxx&material_type=character&max_length=8000&summary=False
```

**为什么用排序拼接而不是直接 str(kwargs)**？

因为 Python 字典的迭代顺序不确定（虽然 3.7+ 保证插入顺序），排序后可以确保 `{"a": 1, "b": 2}` 和 `{"b": 2, "a": 1}` 生成相同的缓存键。

### 5.4 缓存隔离策略

**关键问题**：缓存应该在什么时候清空？

| 策略 | 描述 | 问题 |
|------|------|------|
| 永不清空 | 缓存一直有效 | 跨子代理数据泄漏 |
| 每次派遣前清空 | dispatch_subagent 时清空 | 同一子代理内缓存有效 ✅ |
| 每轮 ReAct 前清空 | 每轮思考前清空 | 缓存无意义 |

我们选择**每次派遣前清空**：

```python
# lc_tools.py - dispatch_subagent()

def dispatch_subagent(agent_type: str, task: str) -> str:
    # ... 创建 AgentExecutor ...

    from .writing_tools import clear_tool_cache
    clear_tool_cache()  # ← 每次派遣前清空缓存

    result = executor.invoke({"input": task, "chat_history": []}, ...)
    return result["output"]
```

这样：
- 同一子代理内：重复调用 `read_outline(book_id="xxx", summary=True)` 直接返回缓存 ✅
- 不同子代理之间：缓存已清空，不会读到上一个子代理的残留数据 ✅

### 5.5 哪些工具缓存，哪些不缓存？

| 工具 | 缓存？ | 原因 |
|------|--------|------|
| `read_books` | ✅ | 书籍列表在流水线运行期间不变 |
| `read_outline` | ✅ | 大纲在流水线运行期间不变 |
| `read_materials` | ✅ | 素材在流水线运行期间不变 |
| `search_knowledge` | ✅ | 搜索的数据源不变 |
| `read_chapters` | ❌ | `write_chapter_draft` 会新增章节文件！ |

**`read_chapters` 不缓存是关键设计决策**：research_writer 批量写作时，第1章 `write_chapter_draft` 后如果再调用 `read_chapters`，应该能看到新章节。如果缓存了旧结果，就会漏掉。

### 5.6 效果

- research_writer 在 10 章批量写作中，大纲/素材只实际读取 1 次，后续 9 次命中缓存
- **节省 90% 的重复文件读取**

---

## 6. 优化5：Prompt 工程驱动的行为优化

前面 4 个优化都是代码层面的。但 Agent 系统有一个独特之处：**LLM 的行为很大程度上由 Prompt 决定**。好的 Prompt 可以让 LLM 自动采用高效策略，差的 Prompt 则会让 LLM 浪费大量 token。

### 6.1 指导 LLM 批量调用工具

```markdown
## ⚡ 性能关键：批量调用只读工具

**你必须在同一轮同时发出所有需要的只读工具调用，不要逐个串行调用。**

系统支持同一帧内的只读工具并发执行。当你需要读取大纲、素材等多个数据时，
必须在一个回复中同时发出所有 tool call。

正确示例（一轮发出 3 个 tool call）：
read_outline(book_id="xxx", volume_id="xxx")
read_materials(book_id="xxx", material_type="character")
read_books()

错误示例（3 轮串行）：
第1轮: read_outline(...)  → 等结果
第2轮: read_materials(...)  → 等结果
第3轮: read_books(...)  → 等结果
```

**为什么这有效？**

LLM（特别是 GPT-4/Claude 等支持 parallel tool calling 的模型）可以在一次回复中输出多个工具调用。但如果不明确告诉它"你应该这样做"，它往往会逐个调用——因为它的训练数据中，人类对话通常是逐步提问的。

通过在 Prompt 中明确指示"批量调用"，并给出正确/错误示例，LLM 的行为会显著改变。

### 6.2 指导 LLM 控制返回体积

```markdown
## ⚡ 性能关键：控制工具返回体积

- 读取大纲时，优先使用 `summary=True` 了解结构，只在需要详细内容时才读取完整大纲
- 读取素材时，优先使用 `summary=True` 了解有哪些素材，只在需要特定素材详情时才读取
- 使用 `max_length` 参数控制返回内容长度
```

这引导 LLM 采用"两阶段读取"策略：先用 summary 模式扫描全貌，再按需读取细节。

### 6.3 指导 LLM 连续执行

```markdown
**不要在章节之间停下来等待指令**，连续撰写直到所有章节完成。
```

没有这句话，LLM 可能在写完第1章后就停下来，等待用户确认再继续——因为它"以为"这是更安全的做法。明确告诉它"连续执行"，它就会一口气写完所有章节。

### 6.4 Prompt 优化的通用原则

1. **明确告诉 LLM 系统能力**：如果系统支持并发工具调用，就在 Prompt 中说明
2. **给出正确/错误示例**：比抽象描述更有效
3. **用 ⚡ 标记关键指令**：视觉上突出，LLM 更容易注意到
4. **消除歧义**：如果 LLM 可能"犹豫"，就明确告诉它该怎么做

---

## 7. 组合拳：各优化的协同效果

单独看每个优化的效果有限，但组合起来效果是**乘法关系**：

### 7.1 5 章小说的完整对比

| 指标 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| dispatch_subagent 次数 | 7 | 4 | 43% |
| LLM 调用轮次 | ~45 | ~22 | 51% |
| read_outline 文件读取 | 7 | 1 (+6次缓存命中) | 86% |
| read_materials 文件读取 | 7 | 1 (+6次缓存命中) | 86% |
| 工具执行时间（只读部分） | ~28s | ~8s | 71% |
| 上下文 token 消耗 | ~150K | ~80K | 47% |

### 7.2 优化如何协同工作

```
优化5（Prompt）指导 LLM 批量调用工具
    ↓
优化1（并发执行）让批量工具调用真正并行
    ↓
优化3（批量派遣）减少子代理初始化次数
    ↓
优化4（缓存）消除同一子代理内的重复读取
    ↓
优化2（体积控制）减少每次读取的 token 量
```

一个具体的执行流程：

```
research_writer 被1次派遣（优化3）
  │
  第1轮：LLM 批量发出3个工具调用（优化5）
         → read_outline + read_materials + read_books 并发执行（优化1）
         → read_outline(summary=True) 只返回500字符（优化2）
  │
  第2轮：LLM 思考后写第1章，调用 write_chapter_draft
  │
  第3轮：LLM 再次调用 read_outline(summary=False)
         → 命中缓存，0ms 返回（优化4）
         → 写第2章，调用 write_chapter_draft
  │
  ... 后续章节同理，缓存持续命中
```

---

## 8. 设计决策回顾：哪些我们没做，为什么

### 8.1 没有做"长连接 AgentExecutor"

**方案**：为 research_writer 维护一个全局的 AgentExecutor 实例，多次派遣复用同一个实例和 chat_history。

**为什么没做**：
- 实现复杂：需要管理 AgentExecutor 的生命周期、错误恢复、状态重置
- 风险高：如果 AgentExecutor 状态损坏，后续所有派遣都会受影响
- 批量派遣已经解决了核心问题（上下文共享），不需要更复杂的方案

### 8.2 没有缓存 read_chapters

**方案**：像 read_outline 一样缓存 read_chapters 的结果。

**为什么没做**：
- `write_chapter_draft` 会创建新的章节文件
- 如果缓存了 read_chapters 的结果，research_writer 写完第1章后再 read_chapters 会看不到新章节
- 这会导致"写了但看不到"的 bug，比"重复读取"更严重

### 8.3 没有做 LRU 缓存淘汰

**方案**：用 `functools.lru_cache` 或自定义 LRU 策略，限制缓存大小。

**为什么没做**：
- 当前缓存的生命周期是"一次子代理派遣"，通常只有几分钟
- 缓存条目数量有限（一个子代理通常只访问 1-2 本书的数据）
- 每次派遣前清空缓存，不会累积
- 简单的 dict 比复杂缓存策略更可靠

### 8.4 没有做跨子代理的缓存共享

**方案**：让 consistency_checker 复用 research_writer 的缓存结果。

**为什么没做**：
- 不同子代理可能对同一数据有不同的视角（research_writer 看到的是写之前的 chapters，consistency_checker 看到的是写之后的 chapters）
- 缓存隔离更安全，避免数据不一致
- 一致性检查器通常只读取一次，缓存收益不大

---

## 总结：Agent 性能优化的核心思维模型

```
                    ┌─────────────────────┐
                    │  减少 LLM 调用次数   │  ← 最贵的资源
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
     ┌────────────┐   ┌────────────┐   ┌────────────┐
     │ 减少派遣次数 │   │ 减少每轮耗时 │   │ 减少重复调用 │
     │ (批量派遣)  │   │ (并发执行)  │   │ (结果缓存)  │
     └────────────┘   └────────────┘   └────────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
           ┌────────────┐        ┌────────────┐
           │ 减少每轮token │        │ Prompt 引导 │
           │ (体积控制)   │        │ (行为优化)  │
           └────────────┘        └────────────┘
```

**核心原则**：
1. **LLM 调用是最贵的资源**：每次调用都消耗时间和金钱，优化的首要目标是减少调用次数
2. **工具调用是可控的**：并发、缓存、体积控制都可以在代码层面精确控制
3. **Prompt 是杠杆**：好的 Prompt 可以让 LLM 自动采用高效策略，无需代码改动
4. **简单方案优先**：批量派遣比长连接简单，dict 缓存比 LRU 简单，简单方案更可靠
