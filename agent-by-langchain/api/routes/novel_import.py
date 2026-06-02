import json
import os
import re
from fastapi import APIRouter
from pydantic import BaseModel
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

router = APIRouter()

load_dotenv()

ANALYSIS_SYSTEM_PROMPT = """你是一个小说文本结构分析专家。你的任务是分析一段小说文本样本，识别出其中分卷和分章的格式规律。

## 输入
用户会给你一段小说文本的前几万字内容，以及文件名。

## 你的任务
1. 仔细阅读文本，找出所有"卷"标题和"章"标题
2. 总结出分卷标题的正则表达式模式（如果存在分卷结构）
3. 总结出分章标题的正则表达式模式
4. 列出你识别到的卷和章的预览列表

## 常见的分章格式举例
- 第一章 xxx / 第二章 xxx / 第三章 xxx
- 第1章 xxx / 第2章 xxx
- 第一章xxx / 第二章xxx（无空格）
- 第一章：xxx / 第一章:xxx
- 【第一章】xxx / [第一章] xxx
- Chapter 1 xxx / Chapter 2 xxx
- 一、xxx / 二、xxx
- 1. xxx / 2. xxx
- 卷一 xxx 中包含 第一章 xxx

## 常见的分卷格式举例
- 第一卷 xxx / 第二卷 xxx
- 卷一 xxx / 卷二 xxx
- 第1卷 xxx
- 【第一卷】xxx / [卷一] xxx

## 输出格式
你必须严格输出以下JSON格式，不要输出任何其他内容：

```json
{
  "has_volume_structure": true或false,
  "volume_pattern": "正则表达式字符串，用于匹配卷标题行。如果没有卷结构则为null。正则必须包含一个命名捕获组 (?<title>...) 用于提取卷标题",
  "chapter_pattern": "正则表达式字符串，用于匹配章标题行。正则必须包含一个命名捕获组 (?<title>...) 用于提取章标题",
  "volume_chapter_relation": "nested或flat。nested表示章从属于卷（卷标题后面的章属于该卷），flat表示卷和章是独立的",
  "identified_volumes": [
    {"title": "识别到的卷标题原文", "position": 该标题在文本中的大致字符位置}
  ],
  "identified_chapters": [
    {"title": "识别到的章标题原文", "position": 该标题在文本中的大致字符位置}
  ],
  "confidence": "high或medium或low",
  "analysis_note": "简短说明你的分析结论和依据"
}
```

## 重要规则
1. 正则表达式必须能匹配完整的标题行（从行首到行尾或到标题文字结束）
2. 正则必须使用命名捕获组 (?<title>...) 来提取标题文字（不含序号前缀也行，包含也行，但要是人类可读的完整标题）
3. 如果文本中完全没有章的结构，将 chapter_pattern 设为 null，confidence 设为 low
4. position 是该标题在文本中的大致字符偏移量（从0开始）
5. 只输出JSON，不要输出任何解释文字"""

ANALYSIS_USER_TEMPLATE = """请分析以下小说文本的结构。

文件名：{filename}
文本长度（字符数）：{text_length}
以下是文本前 {sample_length} 个字符的内容：

---
{text_sample}
---

请识别其中的分卷和分章格式，输出JSON。"""


class AnalyzeRequest(BaseModel):
    text_sample: str
    filename: str
    text_length: int = 0


class AnalyzeResult(BaseModel):
    success: bool
    has_volume_structure: bool = False
    volume_pattern: str | None = None
    chapter_pattern: str | None = None
    volume_chapter_relation: str = "flat"
    identified_volumes: list = []
    identified_chapters: list = []
    confidence: str = "low"
    analysis_note: str = ""
    error: str | None = None


def _create_analysis_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model=os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url=os.environ.get("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        streaming=False,
        request_timeout=60,
        temperature=0.1,
    )


def _repair_json(text: str) -> str:
    """修复 LLM 输出的常见 JSON 格式问题"""
    # 替换 Python 风格的布尔值和 None
    text = re.sub(r'\bTrue\b', 'true', text)
    text = re.sub(r'\bFalse\b', 'false', text)
    text = re.sub(r'\bNone\b', 'null', text)
    # 移除尾部逗号（}, ] 前的逗号）
    text = re.sub(r',\s*([}\]])', r'\1', text)
    return text


def _extract_json_str(raw: str) -> str:
    """从 LLM 响应中提取 JSON 字符串"""
    json_match = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
    if json_match:
        return json_match.group(1)
    json_match = re.search(r'\{[\s\S]*\}', raw)
    if json_match:
        return json_match.group(0)
    raise ValueError(f"无法从LLM响应中提取JSON: {raw[:200]}")


def _parse_llm_response(raw: str) -> dict:
    json_str = _extract_json_str(raw)
    repaired = _repair_json(json_str)
    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # 逐层尝试：从最外层 { 到最内层，逐步截断修复
    # 尝试找到最后一个完整的 } 并截断其后内容
    depth = 0
    last_valid_end = -1
    for i, ch in enumerate(repaired):
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                last_valid_end = i + 1
                break

    if last_valid_end > 0:
        candidate = repaired[:last_valid_end]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # 最后尝试：逐个修复缺少逗号的位置
    # 在 } 和 { 之间、] 和 [ 之间、} 和 " 之间补充逗号
    comma_fixed = re.sub(r'([}\]])\s*([{"\w])', r'\1, \2', repaired)
    try:
        return json.loads(comma_fixed)
    except json.JSONDecodeError:
        pass

    raise ValueError(f"JSON解析失败，原始响应: {raw[:300]}")


@router.post("/analyze", response_model=AnalyzeResult)
async def analyze_novel_structure(request: AnalyzeRequest):
    sample_len = len(request.text_sample)
    text_len = request.text_length or sample_len

    prompt = ANALYSIS_USER_TEMPLATE.format(
        filename=request.filename,
        text_length=text_len,
        sample_length=sample_len,
        text_sample=request.text_sample,
    )

    llm = _create_analysis_llm()
    max_retries = 2

    for attempt in range(max_retries + 1):
        try:
            response = llm.invoke([
                SystemMessage(content=ANALYSIS_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ])

            raw = response.content
            parsed = _parse_llm_response(raw)

            return AnalyzeResult(
                success=True,
                has_volume_structure=parsed.get("has_volume_structure", False),
                volume_pattern=parsed.get("volume_pattern"),
                chapter_pattern=parsed.get("chapter_pattern"),
                volume_chapter_relation=parsed.get("volume_chapter_relation", "flat"),
                identified_volumes=parsed.get("identified_volumes", []),
                identified_chapters=parsed.get("identified_chapters", []),
                confidence=parsed.get("confidence", "low"),
                analysis_note=parsed.get("analysis_note", ""),
            )
        except json.JSONDecodeError as e:
            if attempt < max_retries:
                # 重试时提示 LLM 修正 JSON 格式
                prompt = f"你上次的输出JSON格式有误（错误：{str(e)}），请重新输出严格合法的JSON。不要输出任何解释，只输出JSON。"
                continue
            return AnalyzeResult(success=False, error=f"JSON解析失败: {str(e)}")
        except Exception as e:
            if attempt < max_retries:
                continue
            return AnalyzeResult(success=False, error=f"分析失败: {str(e)}")
