"""子代理调度器 —— 从外部直接派遣子代理执行任务。"""
from __future__ import annotations

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)


def dispatch(
    subagent_name: str,
    task: str,
    agent_instance,
    callbacks: Optional[list] = None,
) -> str:
    """派遣指定子代理执行任务，返回结果文本。

    Args:
        subagent_name: 子代理名称（如 pipeline_orchestrator）
        task: 任务描述
        agent_instance: LCAgent 实例（提供 LLM、工具等依赖）
        callbacks: LangChain 回调列表
    """
    from langchain_core.prompts import ChatPromptTemplate
    from langchain_classic.agents import create_tool_calling_agent

    from ..lc_tools import _SUBAGENT_TOOL_MAP, _llm_ref, _subagent_registry
    from ..subagent_parallel import ParallelAgentExecutor

    logger.info("[dispatch] 开始派遣子代理 '%s'", subagent_name)
    print(f"\n[直接派遣子代理 · {subagent_name}]: {task[:80]}")

    registry = _subagent_registry
    if registry is None:
        msg = "Error: Subagent registry not initialized"
        logger.error("[dispatch] %s", msg)
        return msg

    spec = registry.get(subagent_name)
    if spec is None:
        available = ", ".join(registry.names())
        msg = f"Error: unknown subagent '{subagent_name}'. Available: {available}"
        logger.error("[dispatch] %s", msg)
        return msg

    tools = [
        _SUBAGENT_TOOL_MAP[name]
        for name in spec.tool_names
        if name in _SUBAGENT_TOOL_MAP and _SUBAGENT_TOOL_MAP[name] is not None
    ]
    if not tools:
        msg = f"Error: no tools available for subagent '{subagent_name}'"
        logger.error("[dispatch] %s (tool_names=%s, map_keys=%s)", msg, spec.tool_names, list(_SUBAGENT_TOOL_MAP.keys()))
        return msg

    llm = _llm_ref or agent_instance.llm
    if llm is None:
        msg = "Error: LLM not initialized"
        logger.error("[dispatch] %s", msg)
        return msg

    logger.info("[dispatch] 子代理 '%s' 工具列表: %s", subagent_name, [t.name for t in tools])

    prompt = ChatPromptTemplate.from_messages([
        ("system", spec.system_prompt),
        ("placeholder", "{chat_history}"),
        ("human", "{input}"),
        ("placeholder", "{agent_scratchpad}"),
    ])

    sub_agent = create_tool_calling_agent(llm, tools, prompt)
    executor = ParallelAgentExecutor(
        agent=sub_agent,
        tools=tools,
        max_iterations=spec.max_turns,
        handle_parsing_errors=True,
        verbose=False,
    )

    cb_list = list(callbacks or [])
    start_time = time.monotonic()

    try:
        result = executor.invoke({
            "input": task,
            "chat_history": [],
        }, {"callbacks": cb_list})
        elapsed = time.monotonic() - start_time
        output = result["output"]
        logger.info("[dispatch] 子代理 '%s' 执行完成, 耗时 %.1fs, 输出 %d 字符", subagent_name, elapsed, len(output))
        print(f"[子代理汇报 · {subagent_name}]: 完成 (耗时 {elapsed:.1f}s)")
        return output
    except Exception as exc:
        elapsed = time.monotonic() - start_time
        logger.exception("[dispatch] 子代理 '%s' 执行异常, 耗时 %.1fs: %s", subagent_name, elapsed, exc)
        print(f"[子代理异常 · {subagent_name}]: {exc} (耗时 {elapsed:.1f}s)")
        return f"Error: subagent '{subagent_name}' raised: {exc}"
