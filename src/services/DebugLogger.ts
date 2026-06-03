/**
 * DebugLogger — 开发者调试日志服务
 *
 * 用于记录 Vibe Writing 和手动流水线中每一步的调用方向、提示词内容、
 * 模板来源等详细信息，供 DebugPanel 展示。
 *
 * 设计为单例模块，方便在非 React 代码（NovelLLMService、TaskBookComposer 等）中直接调用。
 */

// ── 数据模型 ──

export type DebugEventSource = 'manual-pipeline' | 'vibe-writing' | 'service';

export type DebugEventCategory =
  | 'llm-call'           // LLM API 调用（generate / generateRaw）
  | 'template-render'    // 模板渲染（renderTemplate）
  | 'taskbook-compose'   // 任务书组装（TaskBookComposer）
  | 'fact-extract'       // 事实提取（FactExtractor）
  | 'review-gate'        // 审查闸门（ReviewGate）
  | 'pipeline-event'     // Vibe Writing SSE 事件
  | 'prompt-compose';    // SmartPromptComposer 组装系统提示词

export interface DebugEvent {
  id: string;
  timestamp: number;
  source: DebugEventSource;
  category: DebugEventCategory;

  /** 调用方向，如 "PLANNING → outline-generate" 或 "pipeline_step_start" */
  direction: string;

  /** 模板 ID，如 "outline-generate"、"chapter-generate" */
  templateId?: string;
  /** 模板文件路径，如 "./templates/pipeline/02-outline-generate.md" */
  templateFile?: string;

  /** 模板变量 */
  variables?: Record<string, unknown>;
  /** 拼接后的系统提示词 */
  systemPrompt?: string;
  /** 拼接后的用户消息 */
  userMessage?: string;
  /** 完整 messages 数组 */
  fullMessages?: Array<{ role: string; content: string }>;

  /** LLM 响应（截断） */
  response?: string;
  /** LLM 响应完整长度 */
  responseLength?: number;
  /** Token 用量 */
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };

  /** 额外元数据（bookId, chapterIndex, pipelineStep 等） */
  metadata?: Record<string, unknown>;
  /** 错误信息 */
  error?: string;
}

// ── 常量 ──

const MAX_EVENTS = 200;
const RESPONSE_TRUNCATE_LENGTH = 2000;

// ── 订阅者类型 ──

type Subscriber = (events: DebugEvent[]) => void;

// ── DebugLogger 单例 ──

class DebugLoggerImpl {
  private events: DebugEvent[] = [];
  private subscribers: Set<Subscriber> = new Set();
  private enabled: boolean = false;
  private idCounter = 0;

  /** 是否启用调试日志（面板关闭时可暂停记录以节省内存） */
  isEnabled(): boolean {
    return this.enabled;
  }

  /** 设置启用状态 */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.events = [];
      this.notify();
    }
  }

  /** 记录一条调试事件 */
  log(event: Omit<DebugEvent, 'id' | 'timestamp'>): void {
    if (!this.enabled) return;

    const fullEvent: DebugEvent = {
      ...event,
      id: `dbg_${++this.idCounter}_${Date.now()}`,
      timestamp: Date.now(),
    };

    // 截断响应内容
    if (fullEvent.response && fullEvent.response.length > RESPONSE_TRUNCATE_LENGTH) {
      fullEvent.responseLength = fullEvent.response.length;
      fullEvent.response = fullEvent.response.slice(0, RESPONSE_TRUNCATE_LENGTH) + '\n...(已截断)';
    }

    this.events.push(fullEvent);

    // 超出上限时丢弃最早的事件
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(-MAX_EVENTS);
    }

    this.notify();
  }

  /** 获取所有事件 */
  getEvents(): DebugEvent[] {
    return this.events;
  }

  /** 清空事件 */
  clear(): void {
    this.events = [];
    this.notify();
  }

  /** 订阅事件变更 */
  subscribe(fn: Subscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }

  private notify(): void {
    const snapshot = [...this.events];
    for (const fn of this.subscribers) {
      try {
        fn(snapshot);
      } catch {
        // 忽略订阅者错误
      }
    }
  }
}

// 导出单例
export const debugLogger = new DebugLoggerImpl();
