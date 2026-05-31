"""Token 统计 API — 返回 session 总计和 per-turn 统计"""
import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

PROJECT_ROOT = Path(__file__).parent.parent.parent
TOKENS_FILE = PROJECT_ROOT / "memory" / "tokens.jsonl"


@router.get("")
async def get_tokens():
    """获取 Token 使用统计"""
    if not TOKENS_FILE.exists():
        return {
            "session_total": {"input": 0, "output": 0, "total": 0},
            "by_turn": [],
            "by_date": {},
        }

    entries = []
    with open(TOKENS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    # 计算总计
    total_input = sum(e.get("input", 0) for e in entries)
    total_output = sum(e.get("output", 0) for e in entries)
    total_all = sum(e.get("total", 0) for e in entries)

    # 按日期统计
    by_date = {}
    for e in entries:
        date = e.get("ts", "")[:10]
        if date not in by_date:
            by_date[date] = {"input": 0, "output": 0, "total": 0}
        by_date[date]["input"] += e.get("input", 0)
        by_date[date]["output"] += e.get("output", 0)
        by_date[date]["total"] += e.get("total", 0)

    return {
        "session_total": {
            "input": total_input,
            "output": total_output,
            "total": total_all,
        },
        "by_turn": entries[-20:] if len(entries) > 20 else entries,  # 最近 20 条
        "by_date": by_date,
    }
