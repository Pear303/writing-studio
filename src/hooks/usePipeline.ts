import { useState, useCallback, useRef, useEffect } from 'react';
import type { PipelineAutoState, PipelineAutoStep, PipelineIntervention } from '../types';
import { debugLogger } from '../services/DebugLogger';

const DEFAULT_API_URL = 'http://localhost:8000';

function getApiUrl(): string {
  try {
    return localStorage.getItem('agentApiUrl') || DEFAULT_API_URL;
  } catch {
    return DEFAULT_API_URL;
  }
}

export interface PipelineHookState {
  pipeline: PipelineAutoState | null;
  loading: boolean;
  error: string | null;
}

export function usePipeline() {
  const [state, setState] = useState<PipelineHookState>({
    pipeline: null,
    loading: false,
    error: null,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const PIPELINE_START_TIMEOUT_MS = 5 * 60 * 1000;

  const startPipeline = useCallback(async (
    bookId: string,
    volumeId: string,
    userRequest: string,
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort();
    }, PIPELINE_START_TIMEOUT_MS);

    try {
      const apiUrl = getApiUrl();
      const agentMessage = `请启动流水线写作。书籍ID: ${bookId}，分卷ID: ${volumeId}，需求：${userRequest}`;

      const res = await fetch(`${apiUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: agentMessage,
          subagent: 'pipeline_orchestrator',
        }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(`启动流水线失败: ${res.status} ${errorText}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let pipelineCreated = false;
      let lastError: string | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6));
              const eventType = evt.type as string;

              if (eventType === 'error') {
                lastError = (evt.message as string) || '后端返回错误';
              } else if (eventType === 'done') {
                if (!pipelineCreated) {
                  const reply = (evt.reply as string) || '';
                  if (reply.startsWith('Error:')) {
                    lastError = reply;
                  }
                }
              } else if (eventType.startsWith('pipeline_')) {
                handlePipelineEvent(evt);
                if (eventType === 'pipeline_started') {
                  pipelineCreated = true;
                  clearTimeout(timeoutId);
                }
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      setState(prev => {
        if (!pipelineCreated && lastError) {
          return { ...prev, loading: false, error: lastError };
        }
        if (!pipelineCreated) {
          return {
            ...prev,
            loading: false,
            error: '流水线未能启动：后端未返回 pipeline_started 事件，请确认 Agent 后端服务正常运行且 LLM 配置正确。',
          };
        }
        return { ...prev, loading: false };
      });
    } catch (err: unknown) {
      if (abortController.signal.aborted) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: `启动流水线超时（${PIPELINE_START_TIMEOUT_MS / 1000}秒内未收到 pipeline_started 事件），请检查后端日志确认 Agent 是否正常运行。`,
        }));
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('ERR_CONNECTION_REFUSED')) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: `无法连接到 Agent 后端 (${getApiUrl()})，请确认后端服务已启动。错误：${message}`,
        }));
      } else {
        setState(prev => ({ ...prev, loading: false, error: message }));
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, []);

  const handlePipelineEvent = useCallback((evt: Record<string, unknown>) => {
    const eventType = evt.type as string;

    // Debug: 记录 Vibe Writing pipeline 事件
    debugLogger.log({
      source: 'vibe-writing',
      category: 'pipeline-event',
      direction: `SSE → ${eventType}`,
      metadata: { ...evt },
    });

    if (eventType === 'pipeline_started') {
      const steps = (evt.steps as Array<{ name: string; status: string }>) || [];
      setState(prev => ({
        ...prev,
        pipeline: {
          id: (evt.pipeline_id as string) || '',
          bookId: (evt.book_id as string) || '',
          volumeId: (evt.volume_id as string) || '',
          userRequest: (evt.user_request as string) || '',
          steps: steps.map((s, i) => ({
            id: `step_${i}`,
            name: s.name,
            description: '',
            status: s.status as PipelineAutoStep['status'],
            retryCount: 0,
          })),
          currentStepIndex: 0,
          status: 'running',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      }));
    } else if (eventType === 'pipeline_step_start') {
      setState(prev => {
        if (!prev.pipeline) return prev;
        const steps = [...prev.pipeline.steps];
        const idx = evt.step_index as number;
        if (idx < steps.length) {
          steps[idx] = { ...steps[idx], status: 'running' };
        }
        return {
          ...prev,
          pipeline: {
            ...prev.pipeline,
            steps,
            currentStepIndex: idx,
            status: 'running',
            updatedAt: Date.now(),
          },
        };
      });
    } else if (eventType === 'pipeline_step_complete') {
      setState(prev => {
        if (!prev.pipeline) return prev;
        const steps = [...prev.pipeline.steps];
        const idx = evt.step_index as number;
        if (idx < steps.length) {
          steps[idx] = {
            ...steps[idx],
            status: (evt.status as PipelineAutoStep['status']) || 'completed',
            result: (evt.result as string) || '',
          };
        }
        return {
          ...prev,
          pipeline: {
            ...prev.pipeline,
            steps,
            updatedAt: Date.now(),
          },
        };
      });
    } else if (eventType === 'pipeline_check_result') {
      // self-check results are informational, no state change needed
    } else if (eventType === 'pipeline_completed') {
      setState(prev => {
        if (!prev.pipeline) return prev;
        return {
          ...prev,
          pipeline: {
            ...prev.pipeline,
            status: 'completed',
            updatedAt: Date.now(),
          },
        };
      });
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      const res = await fetch(`${apiUrl}/api/pipeline/status`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'idle' || data.status === 'unavailable') {
        setState(prev => (prev.pipeline?.status === 'running' ? prev : { ...prev, pipeline: null }));
        return;
      }

      if (data.pipeline) {
        const p = data.pipeline;
        setState(prev => ({
          ...prev,
          pipeline: {
            id: p.id,
            bookId: p.book_id,
            volumeId: p.volume_id,
            userRequest: p.user_request,
            steps: (p.steps || []).map((s: Record<string, unknown>) => ({
              id: s.id as string,
              name: s.name as string,
              description: (s.description as string) || '',
              status: s.status as PipelineAutoStep['status'],
              result: s.result as string | undefined,
              retryCount: (s.retry_count as number) ?? 0,
            })),
            currentStepIndex: p.current_step_index ?? 0,
            status: p.status,
            intervention: p.intervention ? {
              type: p.intervention.type,
              message: p.intervention.message,
              targetStepIndex: p.intervention.target_step_index,
            } as PipelineIntervention : undefined,
            createdAt: p.created_at,
            updatedAt: p.updated_at,
          },
        }));
      }
    } catch {
      // silently ignore
    }
  }, []);

  const intervene = useCallback(async (
    type: 'pause' | 'resume' | 'cancel' | 'redirect' | 'skip',
    message?: string,
    targetStepIndex?: number,
  ) => {
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/pipeline/intervene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, message, target_step_index: targetStepIndex }),
      });
      await fetchStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setState(prev => ({ ...prev, error: msg }));
    }
  }, [fetchStatus]);

  const clearPipeline = useCallback(async () => {
    try {
      const apiUrl = getApiUrl();
      await fetch(`${apiUrl}/api/pipeline/clear`, { method: 'POST' });
      setState({ pipeline: null, loading: false, error: null });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (state.pipeline?.status === 'running') {
      pollTimerRef.current = setInterval(fetchStatus, 3000);
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, [state.pipeline?.status, fetchStatus]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }
    };
  }, []);

  return {
    state,
    startPipeline,
    intervene,
    clearPipeline,
    fetchStatus,
  };
}
