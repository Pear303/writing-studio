"""三层记忆存储系统：原始历史 / 会话情景记忆 / 长期记忆。

实现 LangChain 的 BaseChatMessageHistory 接口以提供标准化的聊天历史持久化，
同时保留自定义的三层记忆架构（JSONL → 会话情景记忆 → 长期 MEMORY.md）。

三层记忆结构：
1. 工作记忆（Working Memory）：内存中的 history 列表，每轮对话追加
2. 情景记忆（Episodic Memory）：按会话分割的 episodes/{session_id}.md 文件
3. 长期记忆（Long-term Memory）：MEMORY.md 文件，每轮注入 system prompt

会话管理：
- history.jsonl 中每条记录附带 session_id 字段
- sessions.json 存储会话元数据（id, title, created_at, updated_at）
- 旧数据迁移：没有 session_id 的记录按日期归入自动创建的会话
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Sequence

from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.messages import BaseMessage, HumanMessage, AIMessage, SystemMessage, ToolMessage


# 定义 UTC+8 时区
_UTC8 = timezone(timedelta(hours=8))

# LangChain 消息类型到 JSONL 角色的映射
_TYPE_TO_JSONL_ROLE: dict[str, str] = {
    "human": "user",
    "ai": "assistant",
    "system": "system",
    "tool": "tool",
    "function": "function",
}

# JSONL 角色到 LangChain 消息类的反向映射
_JSONL_ROLE_TO_MESSAGE_CLS: dict[str, type[BaseMessage]] = {
    "user": HumanMessage,
    "assistant": AIMessage,
    "system": SystemMessage,
    "tool": ToolMessage,
}


def _generate_session_id() -> str:
    """生成会话 ID，格式：sess_ + 8位短 UUID"""
    return f"sess_{uuid.uuid4().hex[:8]}"


class MemoryStore(BaseChatMessageHistory):
    """三层记忆存储管理器。

    继承自 LangChain 的 BaseChatMessageHistory，提供标准化的消息持久化接口，
    同时管理三层记忆系统的文件读写和归档逻辑。

    文件结构：
    - memory_dir/
      ├── MEMORY.md          # 长期记忆文件
      ├── history.jsonl      # 原始对话日志（JSON Lines 格式，含 session_id）
      ├── sessions.json      # 会话元数据列表
      ├── tokens.jsonl       # Token 使用记录
      └── episodes/          # 会话情景记忆目录
          └── {session_id}.md
    """

    def __init__(self, memory_dir: Path, user_file: Path):
        """初始化记忆存储管理器。

        Args:
            memory_dir: 记忆文件存储目录（self.root / "memory"）
            user_file: 用户偏好档案文件路径（self.root / "templates" / "USER.md"）
        """
        self.memory_dir = memory_dir
        self.memory_file = memory_dir / "MEMORY.md"
        self.history_file = memory_dir / "history.jsonl"
        self.sessions_file = memory_dir / "sessions.json"
        self.episodes_dir = memory_dir / "episodes"
        self.user_file = user_file
        self._current_session_id: str | None = None
        self._ensure()  # 确保目录和文件存在
        self._migrate_legacy()  # 迁移旧数据
        self._ensure_default_session()  # 确保至少有一个会话

    def _ensure(self) -> None:
        """确保记忆目录和必要文件存在，不存在则创建默认内容。"""
        self.memory_dir.mkdir(parents=True, exist_ok=True)
        self.episodes_dir.mkdir(parents=True, exist_ok=True)
        if not self.memory_file.exists():
            self.memory_file.write_text("# 长期记忆\n\n此文件常驻上下文，记录核心目标、当前任务与关键事实。\n", encoding="utf-8")
        if not self.history_file.exists():
            self.history_file.write_text("")
        if not self.sessions_file.exists():
            self.sessions_file.write_text("[]", encoding="utf-8")

    # ── 会话管理 ──────────────────────────────────────────────

    @property
    def current_session_id(self) -> str:
        """获取当前会话 ID。

        如果尚未设置，自动加载或创建一个默认会话。
        """
        if self._current_session_id is None:
            sessions = self._load_sessions()
            if sessions:
                self._current_session_id = sessions[0]["id"]
            else:
                self._current_session_id = self.create_session()
        return self._current_session_id

    @current_session_id.setter
    def current_session_id(self, value: str) -> None:
        """设置当前会话 ID。"""
        self._current_session_id = value

    def _load_sessions(self) -> list[dict]:
        """从 sessions.json 加载会话列表。"""
        if not self.sessions_file.exists():
            return []
        try:
            with self.sessions_file.open("r", encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return []

    def _save_sessions(self, sessions: list[dict]) -> None:
        """保存会话列表到 sessions.json。"""
        with self.sessions_file.open("w", encoding="utf-8") as f:
            json.dump(sessions, f, ensure_ascii=False, indent=2)

    def list_sessions(self) -> list[dict]:
        """获取所有会话列表，按 updated_at 倒序排列。

        Returns:
            会话列表，每个元素包含 id, title, created_at, updated_at
        """
        sessions = self._load_sessions()
        sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
        return sessions

    def get_session(self, session_id: str) -> dict | None:
        """获取指定会话的元数据。

        Args:
            session_id: 会话 ID

        Returns:
            会话元数据字典，如果不存在则返回 None
        """
        for s in self._load_sessions():
            if s["id"] == session_id:
                return s
        return None

    def create_session(self, title: str | None = None) -> str:
        """创建新会话。

        Args:
            title: 会话标题，如果为 None 则自动生成

        Returns:
            新创建的会话 ID
        """
        now = datetime.now(_UTC8).isoformat(timespec="seconds")
        session_id = _generate_session_id()
        session = {
            "id": session_id,
            "title": title or "新会话",
            "created_at": now,
            "updated_at": now,
        }
        sessions = self._load_sessions()
        sessions.append(session)
        self._save_sessions(sessions)
        self._current_session_id = session_id
        return session_id

    def update_session(self, session_id: str, title: str | None = None) -> bool:
        """更新会话元数据。

        Args:
            session_id: 会话 ID
            title: 新标题（如果提供）

        Returns:
            是否更新成功
        """
        sessions = self._load_sessions()
        for s in sessions:
            if s["id"] == session_id:
                if title is not None:
                    s["title"] = title
                s["updated_at"] = datetime.now(_UTC8).isoformat(timespec="seconds")
                self._save_sessions(sessions)
                return True
        return False

    def delete_session(self, session_id: str) -> bool:
        """删除会话及其所有历史记录和情景记忆文件。

        Args:
            session_id: 会话 ID

        Returns:
            是否删除成功
        """
        sessions = self._load_sessions()
        target = None
        for s in sessions:
            if s["id"] == session_id:
                target = s
                break
        if target is None:
            return False

        # 删除情景记忆文件
        episode_path = self.episodes_dir / f"{session_id}.md"
        if episode_path.exists():
            episode_path.unlink()

        # 从 history.jsonl 中删除该会话的记录
        if self.history_file.exists():
            remaining = []
            with self.history_file.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entry = json.loads(line)
                    except json.JSONDecodeError:
                        remaining.append(line)
                        continue
                    # 保留不属于该会话的记录，以及没有 session_id 且不在目标日期的旧记录
                    if entry.get("session_id") == session_id:
                        continue
                    remaining.append(json.dumps(entry, ensure_ascii=False))

            with self.history_file.open("w", encoding="utf-8") as f:
                for line in remaining:
                    f.write(line + "\n")

        # 从 sessions.json 中删除
        sessions = [s for s in sessions if s["id"] != session_id]
        self._save_sessions(sessions)

        # 如果删除的是当前会话，切换到最新的会话
        if self._current_session_id == session_id:
            if sessions:
                sessions.sort(key=lambda s: s.get("updated_at", ""), reverse=True)
                self._current_session_id = sessions[0]["id"]
            else:
                self._current_session_id = self.create_session()

        return True

    def switch_session(self, session_id: str) -> bool:
        """切换到指定会话。

        Args:
            session_id: 目标会话 ID

        Returns:
            是否切换成功
        """
        if self.get_session(session_id) is None:
            return False
        self._current_session_id = session_id
        return True

    def touch_session(self, session_id: str | None = None) -> None:
        """更新会话的 updated_at 时间戳。

        Args:
            session_id: 会话 ID，默认为当前会话
        """
        sid = session_id or self.current_session_id
        sessions = self._load_sessions()
        for s in sessions:
            if s["id"] == sid:
                s["updated_at"] = datetime.now(_UTC8).isoformat(timespec="seconds")
                self._save_sessions(sessions)
                return

    def _ensure_default_session(self) -> None:
        """确保至少有一个会话存在。"""
        sessions = self._load_sessions()
        if not sessions:
            self.create_session()

    # ── 旧数据迁移 ──────────────────────────────────────────

    def _migrate_legacy(self) -> None:
        """将没有 session_id 的旧记录按日期迁移到对应的会话中。

        迁移逻辑：
        1. 扫描 history.jsonl，收集所有没有 session_id 的条目
        2. 按日期分组，为每个日期创建一个会话
        3. 给这些条目补充 session_id 字段
        4. 迁移已有的日期 .md 情景记忆文件到 episodes/ 目录
        """
        if not self.history_file.exists():
            return

        # 读取所有条目
        entries = []
        with self.history_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

        # 检查是否有需要迁移的条目
        needs_migration = False
        for entry in entries:
            if "session_id" not in entry and entry.get("role"):
                needs_migration = True
                break

        if not needs_migration:
            return

        # 按日期分组旧条目，创建对应的会话
        date_to_session: dict[str, str] = {}
        sessions = self._load_sessions()

        for entry in entries:
            if "session_id" in entry:
                continue
            if not entry.get("role"):
                # compact_event 等非消息条目，也需要迁移
                ts = entry.get("ts", "")[:10]
                if not ts:
                    continue
                if ts not in date_to_session:
                    # 为该日期创建会话
                    sid = _generate_session_id()
                    date_to_session[ts] = sid
                    sessions.append({
                        "id": sid,
                        "title": f"{ts} 的对话",
                        "created_at": f"{ts}T00:00:00+08:00",
                        "updated_at": f"{ts}T23:59:59+08:00",
                    })
                entry["session_id"] = date_to_session[ts]
                continue

            # 有 role 的消息条目
            ts = entry.get("ts", "")[:10]
            if not ts:
                continue
            if ts not in date_to_session:
                sid = _generate_session_id()
                date_to_session[ts] = sid
                sessions.append({
                    "id": sid,
                    "title": f"{ts} 的对话",
                    "created_at": f"{ts}T00:00:00+08:00",
                    "updated_at": f"{ts}T23:59:59+08:00",
                })
            entry["session_id"] = date_to_session[ts]

        # 保存 sessions.json
        self._save_sessions(sessions)

        # 重写 history.jsonl，补充 session_id
        with self.history_file.open("w", encoding="utf-8") as f:
            for entry in entries:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")

        # 迁移旧日期 .md 文件到 episodes/ 目录
        for date_str, sid in date_to_session.items():
            old_path = self.memory_dir / f"{date_str}.md"
            new_path = self.episodes_dir / f"{sid}.md"
            if old_path.exists() and not new_path.exists():
                content = old_path.read_text(encoding="utf-8")
                new_path.write_text(content, encoding="utf-8")
                # 保留旧文件，不删除（以防回滚）

    # ── 原始层：JSONL 历史日志 ──────────────────────────────

    def append_history(self, role: str, content: Any, additional_kwargs: dict | None = None) -> None:
        """向 history.jsonl 追加一条对话记录。

        【调用方】lc_agent.py (通过 add_messages 间接调用)

        Args:
            role: 消息角色（user/assistant/system/tool/function）
            content: 消息内容（字符串或可序列化的复杂对象）
            additional_kwargs: 额外的元数据（如工具调用信息）
        """
        row = {
            "ts": datetime.now(_UTC8).isoformat(timespec="seconds"),
            "session_id": self.current_session_id,
            "role": role,
            "content": content if isinstance(content, str) else _json_safe(content),
        }
        if additional_kwargs:
            row["additional_kwargs"] = additional_kwargs

        with self.history_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

        # 更新会话的 updated_at
        self.touch_session()

    def add_messages(self, messages: Sequence[BaseMessage]) -> None:
        """批量添加 LangChain 消息对象到历史记录。

        【调用方】lc_agent.py

        将 LangChain 的 BaseMessage 转换为 JSONL 格式并持久化。

        Args:
            messages: LangChain 消息序列
        """
        for msg in messages:
            role = _TYPE_TO_JSONL_ROLE.get(msg.type, "unknown")
            extra = getattr(msg, "additional_kwargs", None) or None
            self.append_history(role, msg.content, additional_kwargs=extra)

    # ── 中期层：按会话的情景记忆 ──────────────────────────────

    def session_episode_path(self, session_id: str | None = None) -> Path:
        """获取指定会话的情景记忆文件路径。

        Args:
            session_id: 会话 ID，默认为当前会话

        Returns:
            情景记忆文件路径（格式：episodes/{session_id}.md）
        """
        sid = session_id or self.current_session_id
        return self.episodes_dir / f"{sid}.md"

    def today_episode_path(self) -> Path:
        """兼容旧接口：返回当前会话的情景记忆文件路径。

        注意：此方法保留仅为向后兼容，内部已改为按会话存储。

        Returns:
            当前会话的情景记忆文件路径
        """
        return self.session_episode_path()

    def read_today_episode(self) -> str:
        """读取当前会话的情景记忆内容。

        Returns:
            情景记忆的文本内容，如果文件不存在则返回空字符串
        """
        p = self.session_episode_path()
        return p.read_text(encoding="utf-8") if p.exists() else ""

    def append_episode(self, content: str, session_id: str | None = None) -> None:
        """向指定会话的情景记忆文件追加内容。

        如果文件已存在，在现有内容后追加；否则创建新文件并添加标题。

        Args:
            content: 要追加的情景记忆内容
            session_id: 会话 ID，默认为当前会话
        """
        p = self.session_episode_path(session_id)
        sid = session_id or self.current_session_id
        existing = p.read_text(encoding="utf-8") if p.exists() else f"# 会话 {sid} 情景记忆\n"
        new_text = existing.rstrip() + "\n\n" + content.strip() + "\n"
        p.write_text(new_text, encoding="utf-8")

    # ── 长期层：MEMORY.md ──────────────────────────────────────

    def read_memory(self) -> str:
        """读取长期记忆文件内容。

        【调用方】context.py, compactor.py

        Returns:
            MEMORY.md 的完整内容，如果文件不存在或解码失败则返回空字符串
        """
        if not self.memory_file.exists():
            return ""
        try:
            return self.memory_file.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return self.memory_file.read_text(encoding="gbk", errors="ignore")

    def write_memory(self, content: str) -> None:
        """写入长期记忆文件（覆盖式）。

        【调用方】compactor.py

        Args:
            content: 新的长期记忆内容
        """
        self.memory_file.write_text(content.strip() + "\n", encoding="utf-8")

    # ── 归档标记：compact_event ───────────────────────────────

    def append_compact_marker(self) -> None:
        """在 history.jsonl 中添加压缩事件标记。

        用于标识某段历史已被压缩归档，启动时可根据此标记跳过已归档部分。
        标记会附带当前 session_id。
        """
        row = {
            "ts": datetime.now(_UTC8).isoformat(timespec="seconds"),
            "session_id": self.current_session_id,
            "type": "compact_event",
        }
        with self.history_file.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    def clear(self) -> None:
        """清空当前会话状态（通过添加压缩标记实现）。

        注意：不会删除历史文件，只是标记当前状态为已归档。
        """
        self.append_compact_marker()

    def load_unarchived_history(self, session_id: str | None = None) -> list:
        """加载指定会话中最后一个 compact_event 之后的未归档对话条目。

        扫描 history.jsonl，过滤当前会话的记录，
        找到最后一个压缩事件标记，返回其后的所有有效对话记录。

        Args:
            session_id: 会话 ID，默认为当前会话

        Returns:
            未归档的对话记录列表，每个元素是 {role, content} 字典
        """
        sid = session_id or self.current_session_id

        if not self.history_file.exists():
            return []

        rows = []
        with self.history_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                # 只保留属于当前会话的记录
                if entry.get("session_id") != sid:
                    continue
                rows.append(entry)

        # 找到最后一个 compact_event 的位置
        last_marker = -1
        for i, row in enumerate(rows):
            if row.get("type") == "compact_event":
                last_marker = i

        # 返回标记之后的所有有效对话记录
        return [
            {"role": r["role"], "content": r["content"], "additional_kwargs": r.get("additional_kwargs")}
            for r in rows[last_marker + 1:]
            if "role" in r and "content" in r
        ]

    @property
    def messages(self) -> list[BaseMessage]:
        """获取当前会话未归档历史对应的 LangChain 消息对象列表。

        从 JSONL 格式反序列化为 LangChain 的 BaseMessage 对象，
        保留复杂内容块（如 tool_use / tool_result）的结构。

        Returns:
            LangChain 消息对象列表
        """
        raw = self.load_unarchived_history()
        result: list[BaseMessage] = []
        for entry in raw:
            role = entry["role"]
            content = entry["content"]
            extra_kwargs = entry.get("additional_kwargs", None)

            # 根据角色选择对应的消息类
            message_cls = _JSONL_ROLE_TO_MESSAGE_CLS.get(role)
            if message_cls is not None:
                # content 从 JSON 反序列化而来，保持原样（str / list / dict）
                # 以保留复杂内容块（如 tool_use / tool_result）的结构
                if extra_kwargs:
                    result.append(message_cls(content=content, additional_kwargs=extra_kwargs))
                else:
                    result.append(message_cls(content=content))

        return result

    # ── 用户偏好档案 ───────────────────────────────────────────

    def read_user(self) -> str:
        """读取用户偏好档案内容。

        Returns:
            USER.md 文件的完整内容，如果文件不存在则返回空字符串
        """
        return self.user_file.read_text(encoding="utf-8") if self.user_file.exists() else ""

    def write_user(self, content: str) -> None:
        """写入用户偏好档案（覆盖式）。

        Args:
            content: 新的用户偏好内容
        """
        self.user_file.write_text(content.strip() + "\n", encoding="utf-8")

    # ── 会话历史查询（供 API 使用）──────────────────────────────

    def get_session_turns(self, session_id: str) -> list[dict]:
        """获取指定会话的所有对话记录（用于前端历史展示）。

        Args:
            session_id: 会话 ID

        Returns:
            对话记录列表，每条包含 role, content, timestamp 等字段
        """
        if not self.history_file.exists():
            return []

        turns = []
        with self.history_file.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if entry.get("session_id") != session_id:
                    continue
                if "role" not in entry or "content" not in entry:
                    continue
                content = entry.get("content", "")
                display_content = content[:200] + "..." if len(content) > 200 else content
                turns.append({
                    "role": entry["role"],
                    "content": display_content,
                    "full_content": content,
                    "timestamp": entry.get("ts", ""),
                })
        return turns


def _json_safe(obj: Any) -> Any:
    """将任意对象转换为 JSON 可序列化的形式。

    处理 Anthropic 内容块或其他复杂对象，确保可以安全地写入 JSONL 文件。

    转换优先级：
    1. 如果对象本身可序列化，直接返回
    2. 列表：递归转换每个元素
    3. 字典：递归转换每个值
    4. Pydantic 模型：调用 model_dump()
    5. 普通对象：提取 __dict__ 属性（排除私有属性）
    6. 其他：转为字符串

    Args:
        obj: 任意对象

    Returns:
        JSON 可序列化的对象
    """
    # 首先尝试直接序列化
    try:
        json.dumps(obj, ensure_ascii=False)
        return obj
    except (TypeError, ValueError):
        pass

    # 递归处理列表
    if isinstance(obj, list):
        return [_json_safe(x) for x in obj]

    # 递归处理字典
    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}

    # 处理 Pydantic 模型
    if hasattr(obj, "model_dump"):
        return obj.model_dump()

    # 处理普通 Python 对象
    if hasattr(obj, "__dict__"):
        return {k: _json_safe(v) for k, v in obj.__dict__.items() if not k.startswith("_")}

    # 兜底：转为字符串
    return str(obj)


"""
          每轮对话
             │
             ▼
    ┌────────────────┐
    │  工作记忆        │  memory/history.jsonl
    │  (JSONL 持久化)  │  ← 每轮追加（含 session_id）
    └───────┬────────┘
            │ 触发压缩阈值（>140K tokens）
            ▼
    ┌────────────────┐
    │  Compactor 压缩  │  调用 LLM 总结旧对话
    │  (LLM 提炼)      │  解析 <episode> <updated_memory> <updated_user>
    └───────┬────────┘
            │
    ┌───────┴───────┐
    ▼               ▼
┌──────────┐  ┌──────────┐
│ 情景记忆   │  │ 长期记忆   │
│ episodes/ │  │ MEMORY.md│
│ {sid}.md  │  │ (常驻)    │
└──────────┘  └──────────┘
"""
