"""Vibe Writing 配置 API —— 保存用户对写作流水线的偏好设置。"""
import json
from pathlib import Path
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

PRESET_STEPS = [
    {"id": "需求分析",       "label": "需求分析",       "default": True},
    {"id": "生成大纲",       "label": "生成大纲",       "default": True},
    {"id": "生成细纲",       "label": "生成细纲",       "default": True},
    {"id": "撰写正文",       "label": "撰写正文",       "default": True},
    {"id": "一致性检查",     "label": "一致性检查",     "default": True},
    {"id": "质量审阅",       "label": "质量审阅",       "default": True},
]

SETTINGS_FILE = Path(__file__).parent.parent.parent / "studio-data" / "vibe_settings.json"


class CustomPrompt(BaseModel):
    name: str
    content: str


class VibeSettingsRequest(BaseModel):
    excluded_steps: list[str] = []
    custom_instructions: str = ""
    custom_prompts: list[CustomPrompt] = []
    active_prompt_names: list[str] = []


_DEFAULT_PROMPTS = [
    {"name": "注重人物心理描写",     "content": "注重人物内心活动的刻画，通过心理活动推动情节发展，让读者能深入理解角色的情感变化和决策动机。"},
    {"name": "对话风格简洁明快",     "content": "对话要简洁自然，符合人物性格和身份，避免冗长的对白。用对话推进情节，每段对话都有明确的戏剧目的。"},
    {"name": "场景描写丰富细腻",     "content": "注重场景的感官描写（视觉、听觉、嗅觉、触觉），营造沉浸式的阅读体验。场景描写要为情节和情绪服务。"},
    {"name": "情节节奏紧凑",         "content": "控制叙事节奏，避免拖沓。适当运用悬念、转折和章节断点，保持读者的阅读张力。"},
    {"name": "注重世界观展现",       "content": "通过情节和对话自然地展现世界观设定，避免大段的说明性文字。让读者在故事中逐步发现世界的规则和秘密。"},
]


def _default_settings() -> dict:
    return {
        "excluded_steps": [],
        "custom_instructions": "",
        "custom_prompts": list(_DEFAULT_PROMPTS),
        "active_prompt_names": [],
    }


def _load() -> dict:
    if not SETTINGS_FILE.exists():
        return _default_settings()
    try:
        data = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
        defaults = _default_settings()
        defaults.update(data)
        return defaults
    except (json.JSONDecodeError, OSError):
        return _default_settings()


def _save(data: dict) -> None:
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


@router.get("")
async def get_vibe_settings():
    settings = _load()
    return {
        "preset_steps": PRESET_STEPS,
        "excluded_steps": settings.get("excluded_steps", []),
        "custom_instructions": settings.get("custom_instructions", ""),
        "custom_prompts": settings.get("custom_prompts", []),
        "active_prompt_names": settings.get("active_prompt_names", []),
    }


@router.post("")
async def save_vibe_settings(request: VibeSettingsRequest):
    data = {
        "excluded_steps": request.excluded_steps,
        "custom_instructions": request.custom_instructions,
        "custom_prompts": [
            {"name": p.name, "content": p.content} for p in request.custom_prompts
        ],
        "active_prompt_names": request.active_prompt_names,
    }
    _save(data)
    return {"status": "ok", "message": "Vibe writing 配置已保存"}


def build_vibe_instruction_block() -> str:
    """构建注入 pipeline_orchestrator 提示词的指令块"""
    settings = _load()
    excluded = settings.get("excluded_steps", [])
    instructions = settings.get("custom_instructions", "").strip()
    custom_prompts = settings.get("custom_prompts", [])
    active_names = settings.get("active_prompt_names", [])

    # 以 name 为键建立查询
    prompt_map = {cp.get("name", ""): cp.get("content", "") for cp in custom_prompts if cp.get("name")}
    active_prompts = [(name, prompt_map[name]) for name in active_names if name in prompt_map]

    parts = []

    if excluded:
        step_list = "、".join(excluded)
        parts.append(f"## 用户指定跳过的步骤\n以下步骤不要执行，直接跳过：{step_list}")

    if instructions:
        parts.append(f"## 用户的额外要求\n{instructions}")

    if active_prompts:
        parts.append("## 用户预设的参考提示词")
        for name, content in active_prompts:
            parts.append(f"### {name}\n{content}")

    return "\n\n".join(parts)
