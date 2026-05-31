"""Writing Studio 写作专用工具 —— 供 LangChain Agent 读写 Writing Studio 导出的书籍数据。

数据目录结构（由 Writing Studio 的 bridge/exporter.ts 生成）：
  studio-data/
  ├── manifest.json                    # 导出清单
  ├── pending/                         # Agent 写入的待处理操作
  └── books/{bookId}/
      ├── book.json                    # 书籍元数据
      ├── volumes.json                 # 分卷列表
      ├── outline_{volumeId}.md        # 卷大纲（Markdown）
      ├── chapters/
      │   └── chapter_{chapterId}.md   # 章节内容
      ├── detailed_outlines/
      │   └── chapter_{chapterId}_outline.md  # 章节细纲
      └── materials/
          └── {type}s.json             # 按类型分组的素材

Agent 通过这些工具读取书籍数据，通过 write_chapter_draft 向 pending 目录
写入操作指令，Writing Studio 的 watcher 会自动轮询并执行。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from langchain_core.tools import tool

# ── 全局状态（由 LCAgent 初始化时注入）──
_studio_data_dir: Path | None = None


def set_studio_data_dir(path: Path) -> None:
    global _studio_data_dir
    _studio_data_dir = path


def _get_data_dir() -> Path:
    if _studio_data_dir is None:
        raise RuntimeError("studio_data_dir 未设置，请先调用 set_studio_data_dir()")
    return _studio_data_dir


def _read_json(path: Path) -> dict | list:
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _pending_dir() -> Path:
    d = _get_data_dir() / "pending"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _write_pending(action: dict) -> str:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    short_id = uuid.uuid4().hex[:6]
    filename = f"{action['action']}_{ts}_{short_id}.json"
    filepath = _pending_dir() / filename
    filepath.write_text(json.dumps(action, ensure_ascii=False, indent=2), encoding="utf-8")
    return f"已写入 pending/{filename}"


# ═══════════════════════════════════════════════════════════════════
#  read_books
# ═══════════════════════════════════════════════════════════════════

@tool
def read_books() -> str:
    """读取用户的所有书籍列表，返回书名、ID、状态、总字数等摘要信息。"""
    try:
        manifest_path = _get_data_dir() / "manifest.json"
        if not manifest_path.exists():
            return "未找到导出数据。请在 Writing Studio 中点击「同步到 Agent」按钮导出书籍数据。"
        manifest = _read_json(manifest_path)
        books = manifest.get("books", [])
        if not books:
            return "当前没有已导出的书籍。"

        lines = [f"共 {len(books)} 本书："]
        for b in books:
            lines.append(
                f"  - 《{b['name']}》ID={b['id']}  "
                f"状态={b.get('status', '未知')}  "
                f"总字数={b.get('totalWords', 0)}  "
                f"卷数={b.get('volumeCount', 0)}  "
                f"章节数={b.get('chapterCount', 0)}"
            )
        return "\n".join(lines)
    except Exception as e:
        return f"读取书籍列表失败: {e}"


# ═══════════════════════════════════════════════════════════════════
#  read_chapters
# ═══════════════════════════════════════════════════════════════════

@tool
def read_chapters(book_id: str, chapter_id: Optional[str] = None, volume_id: Optional[str] = None) -> str:
    """读取指定书籍的章节内容。

    - 不传 chapter_id 和 volume_id：返回该书的章节目录
    - 传 chapter_id：返回该章节的完整内容
    - 传 volume_id：返回该卷下所有章节的标题列表

    Args:
        book_id: 书籍 ID
        chapter_id: 章节 ID（可选，传入则返回章节正文）
        volume_id: 分卷 ID（可选，传入则返回该卷章节列表）
    """
    try:
        book_dir = _get_data_dir() / "books" / book_id
        if not book_dir.exists():
            return f"书籍目录不存在: {book_id}。请先同步数据。"

        if chapter_id:
            chapter_file = book_dir / "chapters" / f"chapter_{chapter_id}.md"
            if not chapter_file.exists():
                return f"章节文件不存在: chapter_{chapter_id}.md"
            content = chapter_file.read_text(encoding="utf-8")
            if len(content) > 80000:
                content = content[:80000] + "\n\n...(内容过长，已截断)"
            return content

        chapters_dir = book_dir / "chapters"
        if not chapters_dir.exists():
            return "该书暂无章节"

        lines = []
        for f in sorted(chapters_dir.iterdir()):
            if not f.name.startswith("chapter_") or not f.name.endswith(".md"):
                continue
            text = f.read_text(encoding="utf-8")
            first_line = text.split("\n", 1)[0].lstrip("# ").strip()
            cid = f.stem.replace("chapter_", "")
            lines.append(f"  - {first_line} (ID={cid})")

        if not lines:
            return "该书暂无章节"
        return "\n".join(lines)
    except Exception as e:
        return f"读取章节失败: {e}"


# ═══════════════════════════════════════════════════════════════════
#  read_outline
# ═══════════════════════════════════════════════════════════════════

@tool
def read_outline(book_id: str, volume_id: Optional[str] = None) -> str:
    """读取指定书籍的大纲。

    - 不传 volume_id：返回该书所有卷的大纲
    - 传 volume_id：返回指定卷的大纲

    Args:
        book_id: 书籍 ID
        volume_id: 分卷 ID（可选）
    """
    try:
        book_dir = _get_data_dir() / "books" / book_id
        if not book_dir.exists():
            return f"书籍目录不存在: {book_id}"

        outline_files = sorted(
            f for f in book_dir.iterdir()
            if f.name.startswith("outline_") and f.name.endswith(".md")
        )

        if not outline_files:
            return "该书暂无大纲数据"

        results = []
        for f in outline_files:
            vol_id = f.stem.replace("outline_", "")
            if volume_id and vol_id != volume_id:
                continue
            content = f.read_text(encoding="utf-8")
            if len(content) > 30000:
                content = content[:30000] + "\n\n...(大纲过长，已截断)"
            results.append(f"## 卷 {vol_id} 的大纲\n\n{content}")

        if not results:
            return f"未找到卷 {volume_id} 的大纲"

        return "\n\n---\n\n".join(results)
    except Exception as e:
        return f"读取大纲失败: {e}"


# ═══════════════════════════════════════════════════════════════════
#  read_materials
# ═══════════════════════════════════════════════════════════════════

@tool
def read_materials(book_id: str, material_type: Optional[str] = None) -> str:
    """读取指定书籍的素材库。

    - 不传 material_type：返回所有素材类型的摘要
    - 传 material_type（如 character, setting, plot）：返回该类型素材的详细内容

    Args:
        book_id: 书籍 ID
        material_type: 素材类型（可选，如 character, setting, plot 等）
    """
    try:
        materials_dir = _get_data_dir() / "books" / book_id / "materials"
        if not materials_dir.exists():
            return "该书的素材目录不存在"

        json_files = sorted(f for f in materials_dir.iterdir() if f.suffix == ".json")
        if not json_files:
            return "该书暂无素材"

        if material_type:
            target = materials_dir / f"{material_type}s.json"
            if not target.exists():
                available = [f.stem for f in json_files]
                return f"未找到 {material_type} 类型的素材。可用类型: {', '.join(available)}"
            data = _read_json(target)
            if isinstance(data, list):
                items_text = []
                for item in data:
                    name = item.get("name", "未命名")
                    desc = item.get("description", "")
                    fields = item.get("fields", {})
                    parts = [f"### {name}"]
                    if desc:
                        parts.append(desc)
                    for k, v in fields.items():
                        parts.append(f"- {k}: {v}")
                    items_text.append("\n".join(parts))
                result = "\n\n---\n\n".join(items_text)
                if len(result) > 50000:
                    result = result[:50000] + "\n\n...(素材内容过长，已截断)"
                return result
            return json.dumps(data, ensure_ascii=False, indent=2)

        lines = []
        for f in json_files:
            data = _read_json(f)
            count = len(data) if isinstance(data, list) else 1
            type_name = f.stem
            lines.append(f"  - {type_name}: {count} 条")

        return "\n".join(lines)
    except Exception as e:
        return f"读取素材失败: {e}"


# ═══════════════════════════════════════════════════════════════════
#  write_chapter_draft
# ═══════════════════════════════════════════════════════════════════

@tool
def write_chapter_draft(book_id: str, volume_id: str, title: str, content: str, detailed_outline: Optional[str] = None) -> str:
    """向 Writing Studio 提交一个新章节草稿。草稿会写入 pending 目录，由 Writing Studio 自动导入。

    Args:
        book_id: 书籍 ID
        volume_id: 目标分卷 ID
        title: 章节标题
        content: 章节正文内容（纯文本或 Markdown）
        detailed_outline: 章节细纲（可选）
    """
    try:
        action = {
            "action": "new_chapter",
            "bookId": book_id,
            "volumeId": volume_id,
            "title": title,
            "content": content,
        }
        if detailed_outline:
            action["detailedOutline"] = detailed_outline

        result = _write_pending(action)
        return f"章节草稿「{title}」已提交。{result}"
    except Exception as e:
        return f"提交章节草稿失败: {e}"


# ═══════════════════════════════════════════════════════════════════
#  search_knowledge
# ═══════════════════════════════════════════════════════════════════

@tool
def search_knowledge(query: str, book_id: Optional[str] = None) -> str:
    """在已导出的书籍数据中搜索关键词，返回匹配的章节和素材片段。

    Args:
        query: 搜索关键词
        book_id: 限定搜索范围到指定书籍（可选，不传则搜索所有书籍）
    """
    try:
        data_dir = _get_data_dir()
        books_dir = data_dir / "books"
        if not books_dir.exists():
            return "未找到书籍数据目录"

        results = []
        search_dirs = []
        if book_id:
            target = books_dir / book_id
            if target.exists():
                search_dirs.append(target)
        else:
            search_dirs = [d for d in books_dir.iterdir() if d.is_dir()]

        query_lower = query.lower()

        for book_path in search_dirs:
            book_name = ""
            book_json = book_path / "book.json"
            if book_json.exists():
                try:
                    book_data = _read_json(book_json)
                    book_name = book_data.get("name", book_path.name)
                except Exception:
                    book_name = book_path.name

            chapters_dir = book_path / "chapters"
            if chapters_dir.exists():
                for f in chapters_dir.iterdir():
                    if not f.name.endswith(".md"):
                        continue
                    try:
                        text = f.read_text(encoding="utf-8")
                        lines = text.split("\n")
                        for i, line in enumerate(lines):
                            if query_lower in line.lower():
                                start = max(0, i - 1)
                                end = min(len(lines), i + 3)
                                context = "\n".join(lines[start:end])
                                cid = f.stem.replace("chapter_", "")
                                results.append(f"《{book_name}》章节 {cid}:\n{context}")
                                break
                    except Exception:
                        continue

            materials_dir = book_path / "materials"
            if materials_dir.exists():
                for mf in materials_dir.iterdir():
                    if not mf.suffix == ".json":
                        continue
                    try:
                        data = _read_json(mf)
                        if isinstance(data, list):
                            for item in data:
                                text = json.dumps(item, ensure_ascii=False)
                                if query_lower in text.lower():
                                    name = item.get("name", "未命名")
                                    results.append(f"《{book_name}》素材 [{mf.stem}] {name}")
                    except Exception:
                        continue

        if not results:
            return f"未找到与「{query}」相关的内容"

        if len(results) > 20:
            results = results[:20]
            results.append("...(结果过多，仅显示前 20 条)")

        return "\n\n".join(results)
    except Exception as e:
        return f"搜索失败: {e}"
