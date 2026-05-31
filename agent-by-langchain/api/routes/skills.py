"""Skills API — 返回所有可用技能列表"""
import sys
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

# 添加项目根目录到路径
PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from agent.skills import SkillsLoader


@router.get("")
async def get_skills():
    """获取所有可用技能列表"""
    skills_dir = PROJECT_ROOT / "skills"
    loader = SkillsLoader(skills_dir)

    skills_list = []
    for name, skill_data in loader.skills.items():
        meta = skill_data.get("meta", {})
        skills_list.append({
            "name": name,
            "description": meta.get("description", "No description"),
            "tags": meta.get("tags", ""),
            "always": meta.get("always", False),
            "path": skill_data.get("path", ""),
        })

    return {"skills": skills_list, "total": len(skills_list)}
