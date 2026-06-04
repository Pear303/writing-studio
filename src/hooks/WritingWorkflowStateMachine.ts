import type { WritingStage } from './usePrompt';
import { STAGE_NAMES } from './prompts-index';

export interface WorkflowState {
  stage: WritingStage;
  history: WritingStage[];
  context: Record<string, unknown>;
}

export interface Transition {
  from: WritingStage;
  to: WritingStage;
  allowed: boolean;
  reason?: string;
}

const VALID_TRANSITIONS: Record<WritingStage, WritingStage[]> = {
  'IDLE': ['PLANNING', 'CHARACTER'],
  'PLANNING': ['DETAILED_OUTLINE', 'CHAPTER_WRITING', 'IDLE'],
  'CHARACTER': ['PLANNING', 'CHAPTER_WRITING', 'IDLE'],
  'DETAILED_OUTLINE': ['CHAPTER_WRITING', 'PLANNING', 'IDLE'],
  'CHAPTER_WRITING': ['DIALOGUE', 'CONTENT_EXPANSION', 'QUALITY_CHECK', 'CONSISTENCY', 'CONTINUATION', 'DETAILED_OUTLINE', 'IDLE'],
  'DIALOGUE': ['CHAPTER_WRITING', 'QUALITY_CHECK', 'IDLE'],
  'CONTENT_EXPANSION': ['CHAPTER_WRITING', 'QUALITY_CHECK', 'IDLE'],
  'QUALITY_CHECK': ['CHAPTER_WRITING', 'IDLE'],
  'CONSISTENCY': ['CHAPTER_WRITING', 'IDLE'],
  'CONTINUATION': ['CHAPTER_WRITING', 'QUALITY_CHECK', 'IDLE'],
};

export class WritingWorkflowStateMachine {
  private state: WorkflowState;
  
  constructor(initialStage: WritingStage = 'IDLE') {
    this.state = {
      stage: initialStage,
      history: [initialStage],
      context: {},
    };
  }
  
  getStage(): WritingStage {
    return this.state.stage;
  }
  
  getStageName(): string {
    return STAGE_NAMES[this.state.stage];
  }
  
  getHistory(): WritingStage[] {
    return [...this.state.history];
  }
  
  getContext(): Record<string, unknown> {
    return { ...this.state.context };
  }
  
  canTransition(to: WritingStage): Transition {
    const from = this.state.stage;
    const allowed = VALID_TRANSITIONS[from]?.includes(to) || false;
    
    return {
      from,
      to,
      allowed,
      reason: allowed ? undefined : `${STAGE_NAMES[from]}不能直接转换到${STAGE_NAMES[to]}`,
    };
  }
  
  transition(to: WritingStage): boolean {
    const transition = this.canTransition(to);
    
    if (!transition.allowed) {
      return false;
    }
    
    this.state.stage = to;
    this.state.history.push(to);
    
    return true;
  }
  
  setContext(key: string, value: unknown): void {
    this.state.context[key] = value;
  }
  
  getContextValue<T>(key: string): T | undefined {
    return this.state.context[key] as T | undefined;
  }
  
  reset(to: WritingStage = 'IDLE'): void {
    this.state = {
      stage: to,
      history: [to],
      context: {},
    };
  }
  
  goBack(): WritingStage | null {
    if (this.state.history.length <= 1) {
      return null;
    }
    
    this.state.history.pop();
    this.state.stage = this.state.history[this.state.history.length - 1];
    
    return this.state.stage;
  }
  
  getAvailableTransitions(): WritingStage[] {
    return VALID_TRANSITIONS[this.state.stage] || [];
  }
  
  isTerminal(): boolean {
    return this.state.stage === 'IDLE';
  }
  
  serialize(): string {
    return JSON.stringify(this.state);
  }
  
  static deserialize(data: string): WritingWorkflowStateMachine {
    const parsed = JSON.parse(data) as WorkflowState;
    const machine = new WritingWorkflowStateMachine(parsed.stage);
    machine.state = parsed;
    return machine;
  }
}

export function createWorkflow(initialStage?: WritingStage): WritingWorkflowStateMachine {
  return new WritingWorkflowStateMachine(initialStage);
}