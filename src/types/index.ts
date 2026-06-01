// 章节版本相关类型
export interface ChapterVersion {
  id: string; // 格式: chapterId_timestamp
  chapterId: string;
  content: string;
  wordCount: number;
  createdAt: number;
}

// 书籍相关类型
export interface Book {
  id: string;
  userId?: string; // 所属用户（可选，向后兼容旧数据）
  name: string;
  description?: string;
  cover?: string;  // 封面图片 URL
  totalWords: number;
  status: 'ongoing' | 'finished' | 'abandoned';
  lastExportPath?: string;  // 上次导出的路径
  lastImportPath?: string;  // 上次导入的路径
  autoNumbering?: boolean;  // 是否启用自动章节序号
  numberingFormat?: 'arabic' | 'chinese';  // 序号格式：阿拉伯数字 / 汉字数字
  numberingScope?: 'global' | 'volume';  // 序号范围：全局递增 / 按卷递增
  createdAt: number;  // 创建时间
  updatedAt: number;
}

// 大纲条目数据结构（可折叠多级列表）
export interface OutlineItemData {
  id: string;
  content: string;
  children: OutlineItemData[];
  collapsed: boolean;
}

// 卷相关类型
export interface Volume {
  id: string;
  bookId: string;
  parentId?: string | null; // 父卷ID，null表示根卷
  name: string;
  order: number;
  outline?: string; // 大纲内容（JSON 序列化的 OutlineItemData[]）
}

// 章节相关类型
export interface Chapter {
  id: string;
  volumeId: string | null;
  bookId: string;
  title: string;
  content: string;
  wordCount: number;
  detailedOutline?: string;
  autoNumberExcluded?: boolean;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// 素材相关类型
export type MaterialType = 'character' | 'location' | 'item' | 'plot' | 'other' | 'writing_rule' | 'style_rule';

export type BookLevelMaterialType = 'character' | 'location' | 'item' | 'plot' | 'other';
export type AccountLevelMaterialType = 'writing_rule' | 'style_rule';

export interface Material {
  id: string;
  userId?: string;
  bookId?: string;
  type: MaterialType;
  name: string;
  description: string;
  fields: Record<string, any>;
  createdAt: number;
  updatedAt: number;
}

// AI对话相关类型
export interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface AIConversation {
  id: string;
  messages: AIMessage[];
  createdAt: number;
}

// 活动栏类型
export type ActivityId = 'books' | 'materials' | 'agent' | 'pipeline' | 'settings';

export interface ActivityItem {
  id: ActivityId;
  icon: string;
  label: string;
}

export type PipelineStep = 'step1' | 'step2' | 'step3' | 'step4' | 'step5';

export interface ChapterDraft {
  index: number;
  title: string;
  content: string;
  rounds: ChapterDraftRound[];
}

export interface ChapterDraftRound {
  additions: string;
  deletions: string;
  modifications: string;
}

export interface PipelineStep5State {
  chapters: ChapterDraft[];
  currentChapterIndex: number;
  autoMode: boolean;
  completed: boolean;
}

export interface PipelineStep1Config {
  genres: string[];
  plotType: string;
  protagonistIdentity: string;
  customPrompt: string;
  tone: string;
}

export interface PipelineStep3Config {
  writingStyle: string;
  storyLength: string;
  customRules: string;
}

export interface OutlineRound {
  additions: string;
  deletions: string;
  modifications: string;
}

export interface PipelineStep2State {
  originalOutline: string;
  currentOutline: string;
  rounds: OutlineRound[];
}

export interface DetailedOutlineChapter {
  index: number;
  title: string;
  content: string;
}

export interface DetailedOutlineRound {
  additions: string;
  deletions: string;
  modifications: string;
  selectedChapterIndices: number[];
}

export interface PipelineStep4State {
  chapterCount: number;
  chapters: DetailedOutlineChapter[];
  rounds: DetailedOutlineRound[];
}

export interface PipelineSession {
  id: string;
  bookId: string;
  volumeId: string;
  currentStep: PipelineStep;
  step1Config: PipelineStep1Config;
  step3Config: PipelineStep3Config;
  step2State: PipelineStep2State | null;
  step4State: PipelineStep4State | null;
  step5State: PipelineStep5State | null;
  updatedAt: number;
}

export interface PipelineConfig {
  step1: PipelineStep1Config;
  step3: PipelineStep3Config;
  selectedVolumeId: string | null;
}

// 排版设置类型
export interface FormattingSettings {
  paragraphSpacing: string;
  firstLineIndent: string;
  clearExtraBlankLines: boolean;
  clearExtraSpaces: boolean;
  convertPunctuation: boolean;
}

// 字数统计设置类型
export interface WordCountSettings {
  includePunctuation: boolean; // 中文标点是否计入字数
  englishMode: 'word' | 'letter'; // 英文按单词 / 按字母统计
}

// 编辑器状态类型
export interface EditorState {
  currentBookId: string | null;
  currentChapterId: string | null;
  isDirty: boolean; // 是否有未保存的更改
  wordCount: number;
}

// LLM 提供商类型
export type LLMProviderType = 'openai' | 'anthropic' | 'google' | 'azure' | 'glm' | 'qwen' | 'deepseek' | 'minimax' | 'custom';

// LLM 模型配置
export interface LLMConfig {
  id: string;
  name: string;
  provider: LLMProviderType;
  apiKey: string;
  apiUrl: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// 预设的 LLM 配置模板
export interface LLMProviderPreset {
  provider: LLMProviderType;
  name: string;
  defaultApiUrl: string;
  defaultModel: string;
  apiKeyPlaceholder: string;
  docsUrl: string;
  authHeader?: string;
}

// LLM 提供商预设配置
export const LLM_PROVIDER_PRESETS: LLMProviderPreset[] = [
  {
    provider: 'openai',
    name: 'OpenAI (GPT)',
    defaultApiUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    apiKeyPlaceholder: 'sk-xxxx...',
    docsUrl: 'https://platform.openai.com/docs',
    authHeader: 'Authorization',
  },
  {
    provider: 'anthropic',
    name: 'Anthropic (Claude)',
    defaultApiUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-20241022',
    apiKeyPlaceholder: 'sk-ant-xxxx...',
    docsUrl: 'https://docs.anthropic.com/en/api',
    authHeader: 'x-api-key',
  },
  {
    provider: 'google',
    name: 'Google (Gemini)',
    defaultApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
    defaultModel: 'gemini-2.0-flash-exp',
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    authHeader: 'x-goog-api-key',
  },
  {
    provider: 'azure',
    name: 'Azure OpenAI',
    defaultApiUrl: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions',
    defaultModel: 'gpt-4',
    apiKeyPlaceholder: 'Azure API Key',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/',
    authHeader: 'api-key',
  },
  {
    provider: 'glm',
    name: '智谱 AI (GLM)',
    defaultApiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4-flash',
    apiKeyPlaceholder: 'glm-xxx...',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide',
    authHeader: 'Authorization',
  },
  {
    provider: 'qwen',
    name: '阿里云（通义千问）',
    defaultApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    apiKeyPlaceholder: 'sk-xxx...',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions',
    authHeader: 'Authorization',
  },
  {
    provider: 'deepseek',
    name: 'DeepSeek',
    defaultApiUrl: 'https://api.deepseek.com/chat/completions',
    defaultModel: 'deepseek-v4-flash',
    apiKeyPlaceholder: 'sk-xxx...',
    docsUrl: 'https://api-docs.deepseek.com',
    authHeader: 'Authorization',
  },
  {
    provider: 'minimax',
    name: 'MiniMax',
    defaultApiUrl: 'https://api.minimax.io/v1/text/chatcompletion_v2',
    defaultModel: 'MiniMax-M2.5',
    apiKeyPlaceholder: 'MiniMax API Key',
    docsUrl: 'https://platform.minimax.io/docs/api-reference/text-chat',
    authHeader: 'Authorization',
  },
  {
    provider: 'custom',
    name: '自定义',
    defaultApiUrl: '',
    defaultModel: '',
    apiKeyPlaceholder: 'API Key',
    docsUrl: '',
    authHeader: 'Authorization',
  },
];

// 字体相关类型
export interface FontInfo {
  id?: string;
  name: string;
  family: string;
  category: 'chinese' | 'english';
  isCustom: boolean;
  isLoaded: boolean;
}

export interface FontSettings {
  chineseFont: string;
  englishFont: string;
  fontSize: string;
  fontApplyScope: 'global' | 'editor';
}

export interface CustomFontMeta {
  id: string;
  name: string;
  family: string;
  category: 'chinese' | 'english';
  addedAt: number;
}

// 预设字体列表
export const PRESET_FONTS: Omit<FontInfo, 'isLoaded'>[] = [
  // 中文字体
  { name: '微软雅黑', family: 'Microsoft YaHei', category: 'chinese', isCustom: false },
  { name: '宋体', family: 'SimSun', category: 'chinese', isCustom: false },
  { name: '黑体', family: 'SimHei', category: 'chinese', isCustom: false },
  { name: '楷体', family: 'KaiTi', category: 'chinese', isCustom: false },
  // 英文字体
  { name: 'Arial', family: 'Arial', category: 'english', isCustom: false },
  { name: 'Times New Roman', family: 'Times New Roman', category: 'english', isCustom: false },
  { name: 'Georgia', family: 'Georgia', category: 'english', isCustom: false },
];

// 对话消息类型
export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// 对话历史条目
export interface DialogueEntry {
  role: 'user' | 'assistant';
  message: string;
}

// LLM Provider 接口
export interface LLMProvider {
  getProviderName(): string;
  getModelId(): string;
  callApi(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string
  ): Promise<string>;
  // 流式调用方法
  callApiStream?(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string,
    onChunk: (chunk: string) => void,
    signal: AbortSignal
  ): Promise<void>;
  validateConfig(apiKey: string, apiUrl: string): boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  provider: LLMProviderType;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
  error?: string;
}

export interface QARecord {
  id: string;
  bookId: string;
  chapterId?: string;
  stage: string;
  content: string;
  issues: QAIssue[];
  score?: number;
  createdAt: number;
}

export interface QAIssue {
  type: 'error' | 'warning' | 'info';
  message: string;
  location?: string;
  suggestion?: string;
}

export interface WritingGoal {
  dailyTarget: number;
  chapterTarget: number;
  enabled: boolean;
}

export interface PomodoroState {
  isRunning: boolean;
  timeLeft: number;
  mode: 'work' | 'break';
  workDuration: number;
  breakDuration: number;
  completedSessions: number;
}

export type Theme = 'light' | 'dark' | 'eye-care';

export interface ImportResult {
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface FullExportData {
  version: string;
  exportedAt: number;
  books: Book[];
  volumes: Volume[];
  chapters: Chapter[];
  materials: Material[];
  aiConversations: AIConversation[];
  chapterVersions: ChapterVersion[];
  llmConfigs: LLMConfig[];

  qaRecords: QARecord[];
  users: any[];
  userSettings: any[];
  formattingSettings: Record<string, FormattingSettings>;
  writingGoal: WritingGoal | null;
  pomodoro: PomodoroState | null;
  theme: Theme;
  metadata: {
    lastExportPath: string | null;
    lastImportPath: string | null;
  };
}

// Agent 相关类型
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: AgentToolCall[];
  isStreaming?: boolean;
}

export interface AgentToolCall {
  tool: string;
  input: string;
  output?: string;
  status: 'running' | 'completed' | 'error';
  error?: string;
}

export interface AgentConfig {
  apiUrl: string;
  sessionId?: string;
}

export interface AgentTokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface AgentState {
  connected: boolean;
  running: boolean;
  messages: AgentMessage[];
  currentStreamContent: string;
  currentStreamGen: number;
  activityLog: AgentActivityItem[];
  tokenUsage: AgentTokenUsage;
  error: string | null;
}

export interface AgentActivityItem {
  type: string;
  icon: string;
  text: string;
  level: 'info' | 'running' | 'success' | 'error';
}

// 流水线自动化相关类型
export type PipelineAutoStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'checking';

export interface PipelineAutoStep {
  id: string;
  name: string;
  description: string;
  status: PipelineAutoStepStatus;
  subagent?: string;
  result?: string;
  checkResult?: string;
  retryCount: number;
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineAutoState {
  id: string;
  bookId: string;
  volumeId: string;
  userRequest: string;
  steps: PipelineAutoStep[];
  currentStepIndex: number;
  status: 'planning' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  intervention?: PipelineIntervention;
  createdAt: number;
  updatedAt: number;
}

export type InterventionType = 'pause' | 'resume' | 'cancel' | 'redirect' | 'skip';

export interface PipelineIntervention {
  type: InterventionType;
  message?: string;
  targetStepIndex?: number;
  createdAt: number;
}

// Vibe Writing 参考选项类型
export interface VibePreset {
  id: string;
  userId: string;
  name: string;        // 显示名称（标签文字）
  content: string;     // 注入到提示词中的指令内容
  enabled: boolean;    // 当前是否选中
  builtIn: boolean;    // 是否为内置预设（不可删除）
  order: number;
  createdAt: number;
  updatedAt: number;
}

// 默认内置预设列表
export const DEFAULT_VIBE_PRESETS: Omit<VibePreset, 'id' | 'userId' | 'enabled' | 'createdAt' | 'updatedAt'>[] = [
  { name: '不需要生成细纲', content: '注意：跳过细纲生成步骤，直接基于大纲生成正文。', builtIn: true, order: 0 },
  { name: '不需要一致性检查', content: '注意：跳过输出后的一致性检查步骤。', builtIn: true, order: 1 },
  { name: '不需要重试', content: '注意：出错时跳过重试，继续下一步。', builtIn: true, order: 2 },
  { name: '精简模式', content: '注意：精简输出，避免冗余和重复的内容，保持简洁流畅。', builtIn: true, order: 3 },
  { name: '侧重对话', content: '注意：优先保证对话描写的质量和数量，对话要生动自然。', builtIn: true, order: 4 },
  { name: '侧重场景描写', content: '注意：加强场景和环境描写，让读者有身临其境之感。', builtIn: true, order: 5 },
  { name: '注重文学性', content: '注意：使用更具文学性的语言，适当运用修辞手法，增强文字表现力。', builtIn: true, order: 6 },
  { name: '注重可读性', content: '注意：语言简明易懂，句子不宜过长，段落结构清晰。', builtIn: true, order: 7 },
];