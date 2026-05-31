export interface PromptFile {
  fileName: string;
  title: string;
  description: string;
  category: string;
  stages: string[];
  priority: number;
  dependencies: string[];
}

export const PROMPTS_INDEX = new Map<string, PromptFile>([
  ['outline-template.md', {
    fileName: 'outline-template.md',
    title: '大纲模板',
    description: '标准化的大纲格式，包含基本信息、TODO、章节规划、悬念线',
    category: 'planning',
    stages: ['PLANNING'],
    priority: 1,
    dependencies: [],
  }],
  
  ['character-template.md', {
    fileName: 'character-template.md',
    title: '角色模板',
    description: '角色档案模板，包含基本信息、性格核心、背景故事',
    category: 'character',
    stages: ['CHARACTER'],
    priority: 1,
    dependencies: [],
  }],
  
  ['chapter-template.md', {
    fileName: 'chapter-template.md',
    title: '章节模板',
    description: '单章结构模板',
    category: 'chapter',
    stages: ['CHAPTER_WRITING', 'DETAILED_OUTLINE'],
    priority: 2,
    dependencies: [],
  }],
  
  ['start-chapter-guide.md', {
    fileName: 'start-chapter-guide.md',
    title: '章节写作指南',
    description: '前20%原则、十种强力开头技巧、标准章节结构',
    category: 'chapter',
    stages: ['CHAPTER_WRITING'],
    priority: 1,
    dependencies: ['hook-techniques.md'],
  }],
  
  ['character-building.md', {
    fileName: 'character-building.md',
    title: '人物塑造原则',
    description: '矛盾性、侧面揭示、缺陷致命化、人物一致性',
    category: 'character',
    stages: ['CHARACTER'],
    priority: 1,
    dependencies: [],
  }],
  
  ['plot-structures.md', {
    fileName: 'plot-structures.md',
    title: '情节结构模板',
    description: '三幕式、英雄之旅、悬疑、言情、惊悚等7种结构',
    category: 'plot',
    stages: ['PLANNING', 'DETAILED_OUTLINE'],
    priority: 1,
    dependencies: [],
  }],
  
  ['dialogue-writing.md', {
    fileName: 'dialogue-writing.md',
    title: '对话写作规范',
    description: '对话目的、潜台词、角色区分、对话场景类型',
    category: 'dialogue',
    stages: ['DIALOGUE'],
    priority: 1,
    dependencies: [],
  }],
  
  ['hook-techniques.md', {
    fileName: 'hook-techniques.md',
    title: '悬念钩子技巧',
    description: '十种经典悬念钩子、五级强度、悬念升级',
    category: 'hook',
    stages: ['CHAPTER_WRITING'],
    priority: 2,
    dependencies: [],
  }],
  
  ['content-expansion.md', {
    fileName: 'content-expansion.md',
    title: '内容扩充技巧',
    description: '七种扩充方法：场景细节、内心活动、感官体验',
    category: 'expansion',
    stages: ['CONTENT_EXPANSION'],
    priority: 1,
    dependencies: [],
  }],
  
  ['consistency.md', {
    fileName: 'consistency.md',
    title: '连贯性保证',
    description: '人物状态跟踪、伏笔呼应、悬念线延续',
    category: 'consistency',
    stages: ['CHAPTER_WRITING', 'CONSISTENCY'],
    priority: 1,
    dependencies: [],
  }],
  
  ['quality-checklist.md', {
    fileName: 'quality-checklist.md',
    title: '质量检查清单',
    description: '9维度评分（80分制）、展示vs讲述、语言检查',
    category: 'quality',
    stages: ['QUALITY_CHECK'],
    priority: 1,
    dependencies: [],
  }],
]);

export type WritingStage = 
  | 'IDLE'
  | 'PLANNING'       
  | 'CHARACTER'      
  | 'DETAILED_OUTLINE'
  | 'CHAPTER_WRITING'
  | 'DIALOGUE'
  | 'CONTENT_EXPANSION'
  | 'QUALITY_CHECK'
  | 'CONSISTENCY';

export type PromptCategory = 
  | 'planning'    
  | 'character'   
  | 'chapter'     
  | 'plot'        
  | 'dialogue'    
  | 'hook'        
  | 'expansion'   
  | 'consistency'
  | 'quality'     
  | 'general';

export const STAGE_TO_PROMPTS: Record<WritingStage, string[]> = {
  'IDLE': [],
  'PLANNING': ['outline-template.md', 'plot-structures.md'],
  'CHARACTER': ['character-template.md', 'character-building.md'],
  'DETAILED_OUTLINE': ['plot-structures.md', 'chapter-template.md'],
  'CHAPTER_WRITING': ['start-chapter-guide.md', 'hook-techniques.md', 'consistency.md'],
  'DIALOGUE': ['dialogue-writing.md'],
  'CONTENT_EXPANSION': ['content-expansion.md'],
  'QUALITY_CHECK': ['quality-checklist.md'],
  'CONSISTENCY': ['consistency.md'],
};

export const STAGE_NAMES: Record<WritingStage,string> = {
  'IDLE': '空闲',
  'PLANNING': '大纲规划',
  'CHARACTER': '角色创建',
  'DETAILED_OUTLINE': '细纲生成',
  'CHAPTER_WRITING': '章节写作',
  'DIALOGUE': '对话优化',
  'CONTENT_EXPANSION': '内容扩充',
  'QUALITY_CHECK': '质量检查',
  'CONSISTENCY': '连贯性验证',
};