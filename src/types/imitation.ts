import type { ChapterSkeleton, SuspenseLine, CharacterArc, PacingPoint } from './book-deconstruction';

// ============ 仿写强度 ============

/** 仿写强度 — 语义化标签 */
export type ImitationStrength = 'strict' | 'rhythmic' | 'loose';

/** 仿写强度的用户可见标签 */
export const STRENGTH_LABELS: Record<ImitationStrength, { label: string; desc: string }> = {
  strict: { label: '严格复刻', desc: '章节角色和悬念布局尽量靠近原书' },
  rhythmic: { label: '参考节奏', desc: '保留整体节奏走势，内容自由发挥' },
  loose: { label: '自由发挥', desc: '只参考原书的结构类型和叙事手法' },
};

/** 节奏偏好 */
export type PacingPreference = 'tighter' | 'same' | 'looser';

// ============ 仿写配置 ============

/** 仿写配角设定 */
export interface ImitationCharacter {
  name: string;           // 角色名
  role: string;           // 角色定位（如"导师""对手""恋人"）
  description: string;    // 人设描述
  correspondsTo?: string; // 对应原书中的哪个角色（可选）
}

/** 仿写配置 — 用户输入 */
export interface ImitationConfig {
  // 必填
  protagonistName: string;        // 新主角姓名
  protagonistDescription: string; // 新主角人设
  coreConflict: string;           // 新核心冲突
  genre: string;                  // 新题材/世界观

  // 推荐
  characters: ImitationCharacter[];  // 配角设定
  customPlotHint?: string;           // 自定义剧情走向

  // 可选
  title?: string;                     // 新书名（可选，不填则 LLM 生成）
  strength: ImitationStrength;         // 仿写强度，默认 'rhythmic'
  pacingPreference: PacingPreference;  // 节奏偏好，默认 'same'
}

// ============ 仿写大纲 ============

/** 仿写章节大纲 — 复用原书 ChapterSkeleton，增加追溯字段 */
export interface ImitationChapter extends ChapterSkeleton {
  correspondsToChapter: number;  // 对应原书第几章（用于追溯）
}

/** 仿写悬念线 — 复用原书 SuspenseLine，增加追溯字段 */
export interface ImitationSuspenseLine extends SuspenseLine {
  correspondsToSuspenseId?: string;  // 对应原书悬念线 ID
}

/** 仿写角色弧线 — 复用原书 CharacterArc */
export type ImitationCharacterArc = CharacterArc;

/** 仿写节奏点 — 复用原书 PacingPoint */
export type ImitationPacingPoint = PacingPoint;

/** 仿写状态 */
export type ImitationStatus = 'generating' | 'completed' | 'failed';

/** 仿写大纲 — 完整结果 */
export interface ImitationOutline {
  id: string;

  /** 关联的拆书结果 — 数组设计预留多书融合 */
  deconstructionRefs: Array<{
    deconstructionId: string;
    sourceBookId: string;        // 原书 ID
    sourceBookTitle: string;     // 原书标题（UI 展示用）
  }>;

  config: ImitationConfig;       // 用户输入的配置

  // 生成结果
  title: string;                  // 新书标题
  genre: string;                  // 新题材
  coreConflict: string;           // 新核心冲突
  themes: string[];               // 新主题词

  chapters: ImitationChapter[];
  suspenseLines: ImitationSuspenseLine[];
  characterArcs: ImitationCharacterArc[];
  pacingCurve: ImitationPacingPoint[];

  status: ImitationStatus;
  error?: string;

  /** Step 1 中间结果 — Step 2 失败时可从此恢复 */
  partialResult?: {
    chapters: ImitationChapter[];
    suspenseLines: ImitationSuspenseLine[];
    characterArcs: ImitationCharacterArc[];
  };

  createdAt: number;
  updatedAt: number;
}

// ============ 生成进度 ============

/** 仿写生成进度 */
export interface GenerateProgress {
  step: 'chapters' | 'pacing';  // 当前步骤
  progress: number;              // 0.0 ~ 1.0
  detail: string;                // 进度描述
}

// ============ 状态管理 ============

/** 仿写流程阶段 */
export type ImitationPhase = 'idle' | 'configuring' | 'generating' | 'previewing' | 'importing';

/** 仿写流程状态 */
export interface ImitationState {
  phase: ImitationPhase;
  config: ImitationConfig | null;
  outline: ImitationOutline | null;
  error: string | null;
}

/** 仿写流程 Action */
export type ImitationAction =
  | { type: 'START_CONFIG' }
  | { type: 'SET_CONFIG'; config: ImitationConfig }
  | { type: 'START_GENERATE'; config: ImitationConfig }
  | { type: 'GENERATE_PROGRESS'; progress: GenerateProgress }
  | { type: 'GENERATE_SUCCESS'; outline: ImitationOutline }
  | { type: 'GENERATE_FAIL'; error: string }
  | { type: 'REGENERATE' }
  | { type: 'START_IMPORT' }
  | { type: 'IMPORT_SUCCESS' }
  | { type: 'RESET' };

/** 仿写流程 Reducer */
export function imitationReducer(state: ImitationState, action: ImitationAction): ImitationState {
  switch (action.type) {
    case 'START_CONFIG':
      return { phase: 'configuring', config: null, outline: null, error: null };
    case 'SET_CONFIG':
      return { ...state, config: action.config };
    case 'START_GENERATE':
      return { phase: 'generating', config: action.config, outline: null, error: null };
    case 'GENERATE_PROGRESS':
      return { ...state }; // 进度信息由组件自行管理
    case 'GENERATE_SUCCESS':
      return { phase: 'previewing', config: state.config, outline: action.outline, error: null };
    case 'GENERATE_FAIL':
      return { phase: 'configuring', config: state.config, outline: null, error: action.error };
    case 'REGENERATE':
      return { phase: 'configuring', config: state.config, outline: null, error: null };
    case 'START_IMPORT':
      return { ...state, phase: 'importing' };
    case 'IMPORT_SUCCESS':
      return { phase: 'idle', config: null, outline: null, error: null };
    case 'RESET':
      return { phase: 'idle', config: null, outline: null, error: null };
    default:
      return state;
  }
}

/** 初始状态 */
export const INITIAL_IMITATION_STATE: ImitationState = {
  phase: 'idle',
  config: null,
  outline: null,
  error: null,
};
