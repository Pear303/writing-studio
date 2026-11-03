import json
import time
import asyncio
import logging
import threading
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage

logger = logging.getLogger(__name__)

router = APIRouter()

_agent = None
_executor_pool = None


class ExecutionState:
    """单次请求的执行状态（含独立锁）。

    此前模块级全局 dict 会被并发请求共享导致状态污染，
    现改为每个请求独立创建，由 run_agent_sync 与 _sse_generator 共同持有。
    """

    def __init__(self):
        self.lock = threading.Lock()
        self.data = {
            "running": False,
            "events": [],
            "tokens": {"input": 0, "output": 0, "total": 0},
            "reply": "",
            "tool_calls": [],
            # stream_text: 当前 LLM 调用的流式文本（每次 on_llm_start 时重置）
            # stream_gen:  流式生成序号（每次 on_llm_start 时递增，前端据此判断是否需重置）
            # stream_sent: 已发送的 stream_text 字符数（实现增量推送）
            "stream_text": "",
            "stream_gen": 0,
            "stream_sent": 0,
        }


# 最近一次请求的执行状态引用（供 /state 兜底接口查询，串行池下即当前/最近请求）
_last_state: ExecutionState | None = None


def set_agent(agent_instance):
    global _agent, _executor_pool
    _agent = agent_instance
    from concurrent.futures import ThreadPoolExecutor
    # max_workers=1：串行执行 LLM 调用，避免并发请求之间的状态竞争
    _executor_pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="agent")


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    subagent: str | None = None


class _RunCollector(BaseCallbackHandler):
    """主 Agent 执行回调：收集事件、流式文本、token 用量。"""

    def __init__(self, state: ExecutionState):
        self._state = state
        self.ai_messages = []
        self.tool_calls = []
        self.token_usage = {"input": 0, "output": 0, "total": 0}
        self._correlation_counter = 0

    def _next_correlation_id(self) -> str:
        self._correlation_counter += 1
        return f"agent_{int(time.time() * 1000)}_{self._correlation_counter}"

    def _push_event(self, event_type, data):
        with self._state.lock:
            evt = {"type": event_type, **data}
            self._state.data["events"].append(evt)

    def on_llm_start(self, serialized, prompts, **kwargs):
        # 每次 LLM 调用开始：递增 generation，重置流式文本
        self._current_llm_correlation_id = self._next_correlation_id()
        with self._state.lock:
            self._state.data["stream_gen"] += 1
            self._state.data["stream_text"] = ""
            self._state.data["stream_sent"] = 0
        # 推送结构化提示词供前端 Debug 面板追踪
        # 尝试从 kwargs 中提取 messages（ChatModel 会传入）
        structured_messages = []
        messages = kwargs.get("messages") or []
        for msg in messages:
            role = getattr(msg, "type", None) or "unknown"
            content = getattr(msg, "content", "")
            if isinstance(content, list):
                # 多模态内容，提取文本部分
                content = "\n".join(
                    block.get("text", "") if isinstance(block, dict) else str(block)
                    for block in content
                )
            structured_messages.append({"role": role, "content": content})

        # 兼容：如果 kwargs 没有 messages，回退到 prompts
        if not structured_messages and prompts:
            structured_messages = [{"role": "prompt", "content": p} for p in prompts]

        model_name = kwargs.get("invocation_params", {}).get("model_name", "")
        self._push_event("thinking_start", {
            "messages": structured_messages,
            "model": model_name,
            "correlation_id": self._current_llm_correlation_id,
        })

    def on_llm_new_token(self, token: str, **kwargs):
        # 增量追加到当前 generation 的流式文本
        with self._state.lock:
            self._state.data["stream_text"] += token

    def on_llm_end(self, response, **kwargs):
        response_preview = ""
        try:
            for gen_list in response.generations:
                for gen in gen_list:
                    if isinstance(gen.message, AIMessage):
                        self.ai_messages.append(gen.message)
                        usage = gen.message.usage_metadata
                        if usage:
                            self.token_usage = {
                                "input": usage.get("input_tokens", 0),
                                "output": usage.get("output_tokens", 0),
                                "total": usage.get("total_tokens", 0),
                            }
                        # 提取响应预览
                        if gen.message.content and not response_preview:
                            response_preview = gen.message.content[:5000]
        except Exception:
            pass
        self._push_event("thinking_end", {
            "response_preview": response_preview,
            "usage": self.token_usage,
            "correlation_id": getattr(self, "_current_llm_correlation_id", None),
        })

    def on_tool_start(self, serialized, input_str, **kwargs):
        tool_name = serialized.get("name", "unknown")
        correlation_id = self._next_correlation_id()
        self.tool_calls.append({
            "tool": tool_name,
            "input": input_str[:2000],
            "status": "running",
        })
        self._push_event("tool_start", {
            "tool": tool_name,
            "input": input_str[:2000],
            "correlation_id": correlation_id,
        })

    def on_tool_end(self, output, **kwargs):
        if self.tool_calls:
            self.tool_calls[-1]["status"] = "completed"
            self.tool_calls[-1]["output"] = output[:2000]
            self._push_event("tool_end", {
                "tool": self.tool_calls[-1]["tool"],
                "output": output[:2000],
            })

    def on_tool_error(self, error, **kwargs):
        if self.tool_calls:
            self.tool_calls[-1]["status"] = "error"
            self.tool_calls[-1]["error"] = str(error)
            self._push_event("tool_error", {
                "tool": self.tool_calls[-1]["tool"],
                "error": str(error),
            })


def run_agent_sync(message: str, session_id: str | None = None, subagent: str | None = None, state: ExecutionState | None = None):
    """在线程池中同步执行一次 Agent 调用，状态写入独立于请求的 state。

    线程池为串行（max_workers=1），故此处对 memory_store 会话切换/恢复是安全的。
    """
    global _last_state
    if state is None:
        state = ExecutionState()
    _last_state = state

    # 将执行状态引用注入子代理工具模块，使子代理内部事件也能透传到前端
    from agent.lc_tools import set_chat_state_ref
    set_chat_state_ref((state.data, state.lock))

    # 如果指定了 session_id，切换到该会话；串行执行下先记录原会话，执行完恢复
    original_session = None
    if session_id and _agent:
        original_session = _agent.memory_store.current_session_id
        _agent.memory_store.switch_session(session_id)

    with state.lock:
        state.data["running"] = True
        state.data["events"] = []
        state.data["reply"] = ""
        state.data["stream_text"] = ""
        state.data["stream_gen"] = 0
        state.data["stream_sent"] = 0

    collector = _RunCollector(state)
    try:
        if subagent:
            from agent.subagents import dispatch
            result = dispatch(subagent, message, _agent, callbacks=[collector])
            reply = result if isinstance(result, str) else str(result)
        else:
            result = _agent.executor.invoke(
                {"input": message, "chat_history": _agent.memory_store.messages},
                {"callbacks": [collector]},
            )
            reply = result["output"]
        _agent.memory_store.append_history("user", message)
        final_msg = collector.ai_messages[-1] if collector.ai_messages else None
        if final_msg is not None and final_msg.additional_kwargs:
            _agent.memory_store.append_history(
                "assistant", final_msg.content,
                additional_kwargs=final_msg.additional_kwargs,
            )
        else:
            _agent.memory_store.append_history("assistant", reply)
        # 历史压缩失败不应中断主流程
        try:
            _agent._maybe_compact()
        except Exception as e:
            logger.warning("历史压缩失败（已忽略）: %s", e)

        with state.lock:
            state.data["reply"] = reply
            state.data["tokens"] = collector.token_usage
            state.data["tool_calls"] = collector.tool_calls
    except Exception as e:
        with state.lock:
            state.data["events"].append({"type": "error", "message": str(e)})
    finally:
        with state.lock:
            state.data["running"] = False
        # 恢复原会话，避免影响后续请求
        if original_session is not None:
            try:
                _agent.memory_store.switch_session(original_session)
            except Exception:
                pass


async def _sse_generator(request: ChatRequest, state: ExecutionState):
    """SSE 事件生成器：将 Agent 执行过程流式推送到前端。"""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor_pool, run_agent_sync, request.message, request.session_id, request.subagent, state)

    # ── 等待 Agent 线程启动（running 变为 True） ──
    # 解决竞态条件：若不等待，首轮 running=False 会立即发 done 退出。
    # 若等待期间已出现 error/done 事件，立即结束等待并交给主循环输出。
    for _ in range(200):  # 最多等 10 秒
        await asyncio.sleep(0.05)
        with state.lock:
            if state.data["running"]:
                break
            if any(evt.get("type") in ("error", "done") for evt in state.data["events"]):
                break
    else:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Agent 启动超时'}, ensure_ascii=False)}\n\n"
        return

    last_idx = 0
    last_keepalive = time.time()

    while True:
        await asyncio.sleep(0.05)

        with state.lock:
            events = list(state.data["events"])
            running = state.data["running"]
            stream_text = state.data["stream_text"]
            stream_gen = state.data["stream_gen"]
            stream_sent = state.data["stream_sent"]

        # ── 1. 发送新增事件 ──
        for evt in events[last_idx:]:
            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
            last_keepalive = time.time()
        last_idx = len(events)

        # ── 2. 增量推送流式文本（只发新增部分） ──
        if len(stream_text) > stream_sent:
            new_text = stream_text[stream_sent:]
            with state.lock:
                state.data["stream_sent"] = len(stream_text)
            yield f"data: {json.dumps({'type': 'reply_token', 'content': new_text, 'gen': stream_gen}, ensure_ascii=False)}\n\n"
            last_keepalive = time.time()

        # ── 3. SSE keepalive（防止长任务时连接超时） ──
        if time.time() - last_keepalive > 15:
            yield ":keepalive\n\n"
            last_keepalive = time.time()

        # ── 4. 检查是否完成 ──
        if not running:
            # 排空最后可能残留的事件
            with state.lock:
                remaining = list(state.data["events"][last_idx:])
            for evt in remaining:
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"

            with state.lock:
                done_evt = {
                    "type": "done",
                    "reply": state.data["reply"],
                    "tokens": state.data["tokens"],
                    "tool_calls": state.data.get("tool_calls", []),
                }
            yield f"data: {json.dumps(done_evt, ensure_ascii=False)}\n\n"
            break


@router.post("")
async def chat_stream(request: ChatRequest):
    state = ExecutionState()
    return StreamingResponse(
        _sse_generator(request, state),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/state")
async def get_state():
    state = _last_state
    if state is None:
        return {"running": False, "events": [], "reply": "", "tokens": {"input": 0, "output": 0, "total": 0}}
    with state.lock:
        return {
            "running": state.data["running"],
            "events": state.data["events"],
            "reply": state.data["reply"],
            "tokens": state.data["tokens"],
        }
