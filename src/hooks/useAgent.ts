import { useState, useCallback, useRef } from 'react';
import type { AgentState, AgentMessage, AgentToolCall, AgentActivityItem, AgentTokenUsage, AgentSession } from '../types';

const DEFAULT_API_URL = 'http://localhost:8000';

const initialState: AgentState = {
  connected: false,
  running: false,
  messages: [],
  currentStreamContent: '',
  currentStreamGen: 0,
  activityLog: [],
  tokenUsage: { input: 0, output: 0, total: 0 },
  error: null,
  sessionId: null,
  sessions: [],
};

function getApiUrl(): string {
  return localStorage.getItem('agentApiUrl') || DEFAULT_API_URL;
}

function setApiUrl(url: string): void {
  localStorage.setItem('agentApiUrl', url);
}

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const ACTIVITY_ICONS: Record<string, string> = {
  thinking_start: '🧠',
  thinking_end: '💭',
  tool_start: '🔧',
  tool_end: '✅',
  tool_error: '❌',
  reply_token: '✍️',
  pipeline_step_start: '▶️',
  pipeline_step_complete: '✔️',
  pipeline_progress: '📊',
  pipeline_check_result: '🔍',
  pipeline_paused: '⏸️',
  pipeline_resumed: '▶️',
};

const ACTIVITY_LEVELS: Record<string, AgentActivityItem['level']> = {
  thinking_start: 'running',
  thinking_end: 'info',
  tool_start: 'running',
  tool_end: 'success',
  tool_error: 'error',
  pipeline_step_start: 'running',
  pipeline_step_complete: 'success',
  pipeline_progress: 'info',
  pipeline_check_result: 'info',
  pipeline_paused: 'info',
  pipeline_resumed: 'info',
};

export function useAgent() {
  const [state, setState] = useState<AgentState>(initialState);
  const abortRef = useRef<AbortController | null>(null);
  const pendingToolCallsRef = useRef<AgentToolCall[]>([]);

  const checkConnection = useCallback(async () => {
    const apiUrl = getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/chat/state`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        setState(prev => ({ ...prev, connected: true, error: null }));
        return true;
      }
    } catch {
      // ignore
    }
    setState(prev => ({ ...prev, connected: false }));
    return false;
  }, []);

  const loadSessions = useCallback(async () => {
    const apiUrl = getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/history`);
      if (!res.ok) return;
      const data = await res.json();
      const sessions: AgentSession[] = (data.sessions || []).map((s: any) => ({
        id: s.id,
        title: s.title || '新会话',
        createdAt: s.created_at || '',
        updatedAt: s.updated_at || '',
        turnCount: s.turn_count || 0,
        firstUserMessage: s.first_user_message,
      }));
      setState(prev => ({ ...prev, sessions }));
    } catch {
      // ignore
    }
  }, []);

  const createSession = useCallback(async (title?: string) => {
    const apiUrl = getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || null }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const session: AgentSession = {
        id: data.id,
        title: data.title || '新会话',
        createdAt: data.created_at || '',
        updatedAt: data.updated_at || '',
        turnCount: 0,
      };
      setState(prev => ({
        ...prev,
        sessionId: session.id,
        sessions: [session, ...prev.sessions],
        messages: [],
        activityLog: [],
        currentStreamContent: '',
        error: null,
      }));
      return session.id;
    } catch {
      return null;
    }
  }, []);

  const switchSession = useCallback(async (sessionId: string) => {
    const apiUrl = getApiUrl();
    try {
      const res = await fetch(`${apiUrl}/api/history/${sessionId}`);
      if (!res.ok) return;
      const data = await res.json();
      const messages: AgentMessage[] = [];
      if (data.turns) {
        for (const turn of data.turns) {
          messages.push({
            id: generateId(),
            role: turn.role === 'user' ? 'user' : 'assistant',
            content: turn.full_content || turn.content || '',
            timestamp: new Date(turn.timestamp || Date.now()).getTime(),
          });
        }
      }
      setState(prev => ({
        ...prev,
        sessionId,
        messages,
        activityLog: [],
        currentStreamContent: '',
        error: null,
      }));
    } catch {
      // ignore
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    const apiUrl = getApiUrl();
    try {
      await fetch(`${apiUrl}/api/history/${sessionId}`, { method: 'DELETE' });
    } catch {
      // ignore
    }
    setState(prev => {
      const sessions = prev.sessions.filter(s => s.id !== sessionId);
      const isCurrent = prev.sessionId === sessionId;
      return {
        ...prev,
        sessions,
        sessionId: isCurrent ? null : prev.sessionId,
        messages: isCurrent ? [] : prev.messages,
        activityLog: isCurrent ? [] : prev.activityLog,
        currentStreamContent: isCurrent ? '' : prev.currentStreamContent,
        error: null,
      };
    });
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    const apiUrl = getApiUrl();

    let sessionId = state.sessionId;
    if (!sessionId) {
      const newId = await createSession(message.slice(0, 30));
      if (newId) sessionId = newId;
    }

    const userMsg: AgentMessage = {
      id: generateId(),
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    const assistantMsgId = generateId();
    const assistantMsg: AgentMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      toolCalls: [],
      isStreaming: true,
    };

    setState(prev => ({
      ...prev,
      running: true,
      error: null,
      currentStreamContent: '',
      currentStreamGen: 0,
      activityLog: [],
      messages: [...prev.messages, userMsg, assistantMsg],
      sessionId: sessionId || prev.sessionId,
    }));

    pendingToolCallsRef.current = [];

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: sessionId || undefined }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        throw new Error(`API 请求失败: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法获取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith(':')) continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          try {
            const evt = JSON.parse(jsonStr);
            handleSSEEvent(evt, assistantMsgId);
          } catch {
            // skip malformed JSON
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setState(prev => ({
          ...prev,
          running: false,
          error: (err as Error).message,
        }));
      }
    } finally {
      abortRef.current = null;
      setState(prev => ({
        ...prev,
        running: false,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId ? { ...m, isStreaming: false } : m
        ),
      }));
      loadSessions();
    }
  }, [state.sessionId, createSession, loadSessions]);

  const handleSSEEvent = useCallback((evt: Record<string, unknown>, assistantMsgId: string) => {
    const eventType = evt.type as string;

    if (eventType === 'reply_token') {
      const content = evt.content as string;
      const gen = evt.gen as number;

      setState(prev => {
        const isNewGen = gen !== prev.currentStreamGen;
        const newStreamContent = isNewGen ? content : prev.currentStreamContent + content;

        return {
          ...prev,
          currentStreamContent: newStreamContent,
          currentStreamGen: gen,
          messages: prev.messages.map(m =>
            m.id === assistantMsgId ? { ...m, content: newStreamContent } : m
          ),
        };
      });
      return;
    }

    if (eventType === 'tool_start') {
      const toolCall: AgentToolCall = {
        tool: evt.tool as string,
        input: evt.input as string,
        status: 'running',
      };
      pendingToolCallsRef.current = [...pendingToolCallsRef.current, toolCall];

      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId
            ? { ...m, toolCalls: [...(m.toolCalls || []), toolCall] }
            : m
        ),
        activityLog: [
          ...prev.activityLog,
          {
            type: eventType,
            icon: ACTIVITY_ICONS[eventType] || '🔧',
            text: `调用工具: ${evt.tool}`,
            level: ACTIVITY_LEVELS[eventType] || 'info',
          },
        ],
      }));
      return;
    }

    if (eventType === 'tool_end') {
      const toolName = evt.tool as string;
      const output = evt.output as string;

      pendingToolCallsRef.current = pendingToolCallsRef.current.map(tc =>
        tc.tool === toolName && tc.status === 'running'
          ? { ...tc, status: 'completed' as const, output }
          : tc
      );

      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                toolCalls: (m.toolCalls || []).map(tc =>
                  tc.tool === toolName && tc.status === 'running'
                    ? { ...tc, status: 'completed' as const, output }
                    : tc
                ),
              }
            : m
        ),
        activityLog: [
          ...prev.activityLog,
          {
            type: eventType,
            icon: ACTIVITY_ICONS[eventType] || '✅',
            text: `工具完成: ${toolName}`,
            level: ACTIVITY_LEVELS[eventType] || 'success',
          },
        ],
      }));
      return;
    }

    if (eventType === 'tool_error') {
      const toolName = evt.tool as string;
      const error = evt.error as string;

      setState(prev => ({
        ...prev,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId
            ? {
                ...m,
                toolCalls: (m.toolCalls || []).map(tc =>
                  tc.tool === toolName && tc.status === 'running'
                    ? { ...tc, status: 'error' as const, error }
                    : tc
                ),
              }
            : m
        ),
        activityLog: [
          ...prev.activityLog,
          {
            type: eventType,
            icon: ACTIVITY_ICONS[eventType] || '❌',
            text: `工具错误: ${toolName} - ${error}`,
            level: 'error' as const,
          },
        ],
      }));
      return;
    }

    if (eventType === 'done') {
      const reply = evt.reply as string;
      const tokens = evt.tokens as AgentTokenUsage;

      setState(prev => ({
        ...prev,
        tokenUsage: tokens || prev.tokenUsage,
        messages: prev.messages.map(m =>
          m.id === assistantMsgId
            ? { ...m, content: reply || m.content, isStreaming: false }
            : m
        ),
      }));
      return;
    }

    if (eventType === 'error') {
      setState(prev => ({
        ...prev,
        error: evt.message as string,
      }));
      return;
    }

    if (eventType === 'thinking_start' || eventType === 'thinking_end') {
      setState(prev => ({
        ...prev,
        activityLog: [
          ...prev.activityLog,
          {
            type: eventType,
            icon: ACTIVITY_ICONS[eventType] || '💭',
            text: eventType === 'thinking_start' ? '思考中...' : '思考完成',
            level: ACTIVITY_LEVELS[eventType] || 'info',
          },
        ],
      }));
      return;
    }

    if (eventType.startsWith('pipeline_')) {
      setState(prev => ({
        ...prev,
        activityLog: [
          ...prev.activityLog,
          {
            type: eventType,
            icon: ACTIVITY_ICONS[eventType] || '📊',
            text: (evt.message as string) || (evt.step_name as string) || eventType,
            level: ACTIVITY_LEVELS[eventType] || 'info',
          },
        ],
      }));
      return;
    }
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setState(prev => ({ ...prev, running: false }));
  }, []);

  const clearMessages = useCallback(() => {
    setState(prev => ({
      ...prev,
      messages: [],
      activityLog: [],
      currentStreamContent: '',
      error: null,
    }));
  }, []);

  const updateApiUrl = useCallback((url: string) => {
    setApiUrl(url);
    checkConnection();
  }, [checkConnection]);

  return {
    state,
    sendMessage,
    stopGeneration,
    clearMessages,
    checkConnection,
    updateApiUrl,
    loadSessions,
    createSession,
    switchSession,
    deleteSession,
    apiUrl: getApiUrl(),
  };
}
