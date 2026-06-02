# 角色
你是一个小说文本结构化分析专家。

# 任务
请从以下章节正文中提取结构化事实信息，包括：实体（角色/地点/物品/势力）、状态变化、叙事事件、时间线条目和悬念钩子。

# 待分析章节

## 章节标题
第{{chapterIndex}}章：{{chapterTitle}}

## 章节正文
{{chapterContent}}

{{#if previousStateSummary}}
## 前文已知状态摘要
{{previousStateSummary}}
{{/if}}

# 提取规则

## 实体提取
- 识别章节中出现的所有角色、地点、物品、势力
- 对每个实体记录其当前状态（位置、状态、关系等）
- 如果实体在前文中已存在，只记录本章中发生变化的状态字段

## 状态变化
- 记录实体状态的显著变化（位置移动、关系变化、能力获得/失去等）
- 每条变化需明确：谁/什么 → 从什么状态 → 变为什么状态 → 原因

## 叙事事件
- 提取章节中的关键叙事事件（战斗、对话、发现、决策等）
- 每个事件需包含：参与者、事件类型、简要描述、后果

## 时间线
- 提取章节中可推断的时间顺序标记
- 包括：绝对时间点、相对时间跨度、时序关系

## 悬念钩子
- 识别章节中设置的未解决悬念
- 包括：未回答的问题、未兑现的承诺、暗示但未揭示的信息

# ⚡ 输出要求
严格按照以下 JSON 格式输出，不要输出任何其他内容：

```json
{
  "entities": [
    {
      "name": "实体名称",
      "type": "character|location|item|faction",
      "state": { "key": "value" },
      "firstAppearance": {{chapterIndex}},
      "lastSeen": {{chapterIndex}}
    }
  ],
  "stateChanges": [
    {
      "entityName": "实体名称",
      "field": "状态字段",
      "oldValue": "旧值（新实体填null）",
      "newValue": "新值",
      "reason": "变化原因"
    }
  ],
  "events": [
    {
      "description": "事件简述",
      "participants": ["参与者1", "参与者2"],
      "type": "conflict|discovery|decision|revelation|relationship_change",
      "consequence": "事件后果"
    }
  ],
  "timeline": [
    {
      "description": "时间描述",
      "order": 1,
      "relativeTo": "相对参照（如'上一事件之后'）"
    }
  ],
  "hooks": [
    {
      "description": "悬念描述",
      "type": "question|promise|foreshadowing|mystery",
      "relatedEntities": ["相关实体"]
    }
  ],
  "summary": "章节概要（50-100字）"
}
```
