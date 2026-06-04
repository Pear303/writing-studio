export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  file: string;
  stage: 'PLANNING' | 'DETAILED_OUTLINE' | 'CHAPTER_WRITING' | 'CONTINUATION';
  variables: string[];
  version: string;
}

export const PROMPT_TEMPLATES: Record<string, PromptTemplate> = {
  'outline-generate': {
    id: 'outline-generate',
    name: '生成大纲',
    description: '根据用户配置生成小说大纲',
    file: './templates/pipeline/02-outline-generate.md',
    stage: 'PLANNING',
    variables: ['genres', 'plotType', 'protagonistIdentity', 'tone', 'customPrompt'],
    version: '1.0.0',
  },
  'outline-refine': {
    id: 'outline-refine',
    name: '回炉重造大纲',
    description: '根据用户反馈迭代改进大纲',
    file: './templates/pipeline/02-outline-refine.md',
    stage: 'PLANNING',
    variables: ['originalOutline', 'currentOutline', 'historyLines', 'additions', 'deletions', 'modifications'],
    version: '1.0.0',
  },
  'detailed-generate': {
    id: 'detailed-generate',
    name: '生成细纲',
    description: '根据大纲生成章节细纲',
    file: './templates/pipeline/04-detailed-generate.md',
    stage: 'DETAILED_OUTLINE',
    variables: ['outline', 'chapterCount'],
    version: '1.0.0',
  },
  'detailed-refine': {
    id: 'detailed-refine',
    name: '回炉重造细纲',
    description: '根据用户反馈迭代改进细纲',
    file: './templates/pipeline/04-detailed-refine.md',
    stage: 'DETAILED_OUTLINE',
    variables: ['outline', 'chaptersText', 'historyLines', 'additions', 'deletions', 'modifications'],
    version: '1.0.0',
  },
  'detailed-refine-chapter': {
    id: 'detailed-refine-chapter',
    name: '单章回炉细纲',
    description: '对选中的章节细纲进行修改',
    file: './templates/pipeline/04-detailed-refine-chapter.md',
    stage: 'DETAILED_OUTLINE',
    variables: ['outline', 'selectedChaptersText', 'additions', 'deletions', 'modifications'],
    version: '1.0.0',
  },
  'chapter-generate': {
    id: 'chapter-generate',
    name: '生成正文',
    description: '根据章节细纲生成正文',
    file: './templates/pipeline/05-chapter-generate.md',
    stage: 'CHAPTER_WRITING',
    variables: ['outlineSummary', 'chapterIndex', 'chapterTitle', 'chapterOutline', 'previousChapterContent', 'writingStyle', 'storyLength', 'customRules'],
    version: '1.1.0',
  },
  'chapter-batch-generate': {
    id: 'chapter-batch-generate',
    name: '批量生成正文',
    description: '一次性批量生成所有章节正文，大纲只注入一次',
    file: './templates/pipeline/05-chapter-batch-generate.md',
    stage: 'CHAPTER_WRITING',
    variables: ['outlineSummary', 'chaptersOutline', 'writingStyle', 'storyLength', 'customRules'],
    version: '1.0.0',
  },
  'chapter-refine': {
    id: 'chapter-refine',
    name: '回炉重造正文',
    description: '根据用户反馈迭代改进正文',
    file: './templates/pipeline/05-chapter-refine.md',
    stage: 'CHAPTER_WRITING',
    variables: ['outlineSummary', 'chapterContent', 'historyLines', 'additions', 'deletions', 'modifications', 'writingStyle', 'storyLength', 'customRules'],
    version: '1.1.0',
  },
  'continuation': {
    id: 'continuation',
    name: '续写',
    description: '基于光标位置的前文内容续写故事',
    file: './templates/pipeline/06-continuation.md',
    stage: 'CONTINUATION',
    variables: ['previousText', 'taskBook', 'customInstruction', 'wordCountTarget'],
    version: '1.0.0',
  },
};