import { useState, useCallback, useRef, useEffect } from 'react';
import type { PipelineAutoState, PipelineAutoStep, PipelineIntervention } from '../types';

const DEFAULT_API_URL = 'http://localhost:8765';

function getApiUrl(): string {
  try {
    return localStorage.getItem('agent_api_url') || DEFAULT_API_URL;
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

  const startPipeline = useCallback(async (
    bookId: string,
    volumeId: string,
    userRequest: string,
  ) => {
    setState(prev => ({ ...prev, loading: true, error: null }));

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
      });

      if (!res.ok) {
        throw new Error(`启动流水线失败: ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('无法读取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

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
              handlePipelineEvent(evt);
            } catch {
              // ignore parse errors
            }
          }
        }
      }

      setState(prev => ({ ...prev, loading: false }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setState(prev => ({ ...prev, loading: false, error: message }));
    }
  }, []);

  const handlePipelineEvent = useCallback((evt: Record<string, unknown>) => {
    const eventType = evt.type as string;

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
