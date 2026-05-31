import json
import time
import asyncio
import threading
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage

router = APIRouter()

_agent = None
_executor_pool = None

# ── 执行状态 ──
# stream_text: 当前 LLM 调用的流式文本（每次 on_llm_start 时重置）
# stream_gen:  流式生成序号（每次 on_llm_start 时递增，前端据此判断是否需重置）
# stream_sent: 已发送的 stream_text 字符数（实现增量推送）
# reply:       最终回复（agent 执行完毕后由 result["output"] 覆盖）
_execution_state = {
    "running": False,
    "events": [],
    "tokens": {"input": 0, "output": 0, "total": 0},
    "reply": "",
    "stream_text": "",
    "stream_gen": 0,
    "stream_sent": 0,
}
_state_lock = threading.Lock()


def set_agent(agent_instance):
    global _agent, _executor_pool
    _agent = agent_instance
    from concurrent.futures import ThreadPoolExecutor
    _executor_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="agent")
    # 将执行状态引用注入子代理工具模块，使子代理内部事件也能透传到前端
    from agent.lc_tools import set_chat_state_ref
    set_chat_state_ref((_execution_state, _state_lock))


class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None
    subagent: str | None = None


class _RunCollector(BaseCallbackHandler):
    """主 Agent 执行回调：收集事件、流式文本、token 用量。"""

    def __init__(self):
        self.ai_messages = []
        self.tool_calls = []
        self.token_usage = {"input": 0, "output": 0, "total": 0}

    def _push_event(self, event_type, data):
        with _state_lock:
            evt = {"type": event_type, **data}
            _execution_state["events"].append(evt)

    def on_llm_start(self, serialized, prompts, **kwargs):
        # 每次 LLM 调用开始：递增 generation，重置流式文本
        with _state_lock:
            _execution_state["stream_gen"] += 1
            _execution_state["stream_text"] = ""
            _execution_state["stream_sent"] = 0
        self._push_event("thinking_start", {})

    def on_llm_new_token(self, token: str, **kwargs):
        # 增量追加到当前 generation 的流式文本
        with _state_lock:
            _execution_state["stream_text"] += token

    def on_llm_end(self, response, **kwargs):
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
        except Exception:
            pass
        self._push_event("thinking_end", {})

    def on_tool_start(self, serialized, input_str, **kwargs):
        tool_name = serialized.get("name", "unknown")
        self.tool_calls.append({
            "tool": tool_name,
            "input": input_str[:500],
            "status": "running",
        })
        self._push_event("tool_start", {
            "tool": tool_name,
            "input": input_str[:500],
        })

    def on_tool_end(self, output, **kwargs):
        if self.tool_calls:
            self.tool_calls[-1]["status"] = "completed"
            self.tool_calls[-1]["output"] = output[:500]
            self._push_event("tool_end", {
                "tool": self.tool_calls[-1]["tool"],
                "output": output[:500],
            })

    def on_tool_error(self, error, **kwargs):
        if self.tool_calls:
            self.tool_calls[-1]["status"] = "error"
            self.tool_calls[-1]["error"] = str(error)
            self._push_event("tool_error", {
                "tool": self.tool_calls[-1]["tool"],
                "error": str(error),
            })


def run_agent_sync(message: str, session_id: str | None = None, subagent: str | None = None):
    # 如果指定了 session_id，切换到该会话
    if session_id and _agent:
        _agent.memory_store.switch_session(session_id)

    with _state_lock:
        _execution_state["running"] = True
        _execution_state["events"] = []
        _execution_state["reply"] = ""
        _execution_state["stream_text"] = ""
        _execution_state["stream_gen"] = 0
        _execution_state["stream_sent"] = 0

    collector = _RunCollector()
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
        _agent._maybe_compact()

        with _state_lock:
            _execution_state["reply"] = reply
            _execution_state["tokens"] = collector.token_usage
            _execution_state["tool_calls"] = collector.tool_calls
    except Exception as e:
        with _state_lock:
            _execution_state["events"].append({"type": "error", "message": str(e)})
    finally:
        with _state_lock:
            _execution_state["running"] = False


async def _sse_generator(request: ChatRequest):
    """SSE 事件生成器：将 Agent 执行过程流式推送到前端。"""
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor_pool, run_agent_sync, request.message, request.session_id, request.subagent)

    # ── 等待 Agent 线程启动（running 变为 True） ──
    # 解决竞态条件：若不等待，首轮 running=False 会立即发 done 退出
    for _ in range(200):  # 最多等 10 秒
        await asyncio.sleep(0.05)
        with _state_lock:
            if _execution_state["running"]:
                break
    else:
        yield f"data: {json.dumps({'type': 'error', 'message': 'Agent 启动超时'}, ensure_ascii=False)}\n\n"
        return

    last_idx = 0
    last_keepalive = time.time()

    while True:
        await asyncio.sleep(0.05)

        with _state_lock:
            events = list(_execution_state["events"])
            running = _execution_state["running"]
            stream_text = _execution_state["stream_text"]
            stream_gen = _execution_state["stream_gen"]
            stream_sent = _execution_state["stream_sent"]

        # ── 1. 发送新增事件 ──
        for evt in events[last_idx:]:
            yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"
            last_keepalive = time.time()
        last_idx = len(events)

        # ── 2. 增量推送流式文本（只发新增部分） ──
        if len(stream_text) > stream_sent:
            new_text = stream_text[stream_sent:]
            with _state_lock:
                _execution_state["stream_sent"] = len(stream_text)
            yield f"data: {json.dumps({'type': 'reply_token', 'content': new_text, 'gen': stream_gen}, ensure_ascii=False)}\n\n"
            last_keepalive = time.time()

        # ── 3. SSE keepalive（防止长任务时连接超时） ──
        if time.time() - last_keepalive > 15:
            yield ":keepalive\n\n"
            last_keepalive = time.time()

        # ── 4. 检查是否完成 ──
        if not running:
            # 排空最后可能残留的事件
            with _state_lock:
                remaining = list(_execution_state["events"][last_idx:])
            for evt in remaining:
                yield f"data: {json.dumps(evt, ensure_ascii=False)}\n\n"

            with _state_lock:
                done_evt = {
                    "type": "done",
                    "reply": _execution_state["reply"],
                    "tokens": _execution_state["tokens"],
                    "tool_calls": _execution_state.get("tool_calls", []),
                }
            yield f"data: {json.dumps(done_evt, ensure_ascii=False)}\n\n"
            break


@router.post("")
async def chat_stream(request: ChatRequest):
    return StreamingResponse(
        _sse_generator(request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/state")
async def get_state():
    with _state_lock:
        return {
            "running": _execution_state["running"],
            "events": _execution_state["events"],
            "reply": _execution_state["reply"],
            "tokens": _execution_state["tokens"],
        }
