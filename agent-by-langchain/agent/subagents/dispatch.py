"""子代理调度器 —— 从外部直接派遣子代理执行任务。"""
from __future__ import annotations

from typing import Optional


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
    from langchain.agents import create_tool_calling_agent

    from ..lc_tools import _SUBAGENT_TOOL_MAP, _llm_ref, _subagent_registry
    from ..subagent_parallel import ParallelAgentExecutor

    registry = _subagent_registry
    if registry is None:
        return "Error: Subagent registry not initialized"

    spec = registry.get(subagent_name)
    if spec is None:
        available = ", ".join(registry.names())
        return f"Error: unknown subagent '{subagent_name}'. Available: {available}"

    tools = [
        _SUBAGENT_TOOL_MAP[name]
        for name in spec.tool_names
        if name in _SUBAGENT_TOOL_MAP and _SUBAGENT_TOOL_MAP[name] is not None
    ]
    if not tools:
        return f"Error: no tools available for subagent '{subagent_name}'"

    llm = _llm_ref or agent_instance.llm
    if llm is None:
        return "Error: LLM not initialized"

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

    print(f"\n[直接派遣子代理 · {subagent_name}]: {task[:80]}")

    cb_list = list(callbacks or [])

    try:
        result = executor.invoke({
            "input": task,
            "chat_history": [],
        }, {"callbacks": cb_list})
        return result["output"]
    except Exception as exc:
        return f"Error: subagent '{subagent_name}' raised: {exc}"
