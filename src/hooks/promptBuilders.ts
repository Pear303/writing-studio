import type { WritingStage, WritingContext } from './usePrompt';
import { STAGE_TO_PROMPTS, STAGE_NAMES } from './prompts-index';

let cachedTaskBookText: string | null = null;

export function setTaskBookText(text: string | null): void {
  cachedTaskBookText = text;
}

export function getTaskBookText(): string | null {
  return cachedTaskBookText;
}

function getPromptsByStage(stage: WritingStage, promptsMap: Map<string, string>): string[] {
  const fileNames = STAGE_TO_PROMPTS[stage] || [];
  return fileNames.map(fn => promptsMap.get(fn) || '').filter(Boolean);
}

function wrapPrompt(title: string, content: string): string {
  return `【${title}】\n${content}\n`;
}

function buildContextSection(ctx: Partial<WritingContext>, stage: WritingStage): string {
  const sections: string[] = [];
  
  if (ctx.novelType) sections.push(`写作类型：${ctx.novelType}`);
  if (ctx.targetAudience) sections.push(`目标读者：${ctx.targetAudience}`);
  
  if (stage === 'PLANNING') {
    if (ctx.protagonistTypes?.length) 
      sections.push(`主角类型：${ctx.protagonistTypes.join('、')}`);
    if (ctx.plotTypes?.length) 
      sections.push(`情节类型：${ctx.plotTypes.join('、')}`);
    if (ctx.coreIdea) 
      sections.push(`核心创意：\n${ctx.coreIdea}`);
    if (ctx.inspirationBits) 
      sections.push(`灵感片段：\n${ctx.inspirationBits}`);
    if (ctx.avoidElements) 
      sections.push(`避免元素：\n${ctx.avoidElements}`);
    if (ctx.chapterNumber) 
      sections.push(`预计章节数：${ctx.chapterNumber}章`);
    if (ctx.wordCountTarget) 
      sections.push(`总字数目标：${ctx.wordCountTarget / 10000}万字`);
  }
  
  if (stage === 'CHARACTER') {
    if (ctx.characterName) 
      sections.push(`角色姓名：${ctx.characterName}`);
    if (ctx.characterType) 
      sections.push(`角色类型：${ctx.characterType === 'protagonist' ? '主角' : ctx.characterType === 'antagonist' ? '反派' : '配角'}`);
    if ((ctx as any).age) 
      sections.push(`年龄：${(ctx as any).age}`);
    if ((ctx as any).occupation) 
      sections.push(`职业：${(ctx as any).occupation}`);
    if ((ctx as any).personalityCore) 
      sections.push(`性格核心：${(ctx as any).personalityCore}`);
    if ((ctx as any).coreValue) 
      sections.push(`核心价值观：${(ctx as any).coreValue}`);
    if ((ctx as any).greatestFear) 
      sections.push(`最大恐惧：${(ctx as any).greatestFear}`);
    if ((ctx as any).fatalFlaw) 
      sections.push(`致命缺陷：${(ctx as any).fatalFlaw}`);
    if ((ctx as any).innerDesire) 
      sections.push(`内心渴望：${(ctx as any).innerDesire}`);
    if ((ctx as any).backstory) 
      sections.push(`背景故事：\n${(ctx as any).backstory}`);
    if ((ctx as any).appearance) 
      sections.push(`外貌特征：\n${(ctx as any).appearance}`);
  }
  
  if (stage === 'CHAPTER_WRITING') {
    if (cachedTaskBookText) {
      sections.push(cachedTaskBookText);
    } else {
      if (ctx.chapterNumber) 
        sections.push(`章节序号：第${ctx.chapterNumber}章`);
      if (ctx.chapterTitle) 
        sections.push(`章节标题：${ctx.chapterTitle}`);
      if (ctx.previousChapterSummary) 
        sections.push(`上章摘要：\n${ctx.previousChapterSummary}`);
      if (ctx.previousHook) 
        sections.push(`上章悬念：${ctx.previousHook}`);
      if (ctx.currentMystery) 
        sections.push(`本阶段悬念：${ctx.currentMystery}`);
      if (ctx.wordCountTarget) 
        sections.push(`目标字数：约${ctx.wordCountTarget}字`);
      if ((ctx as any).emotionalTone) 
        sections.push(`情感基调：${(ctx as any).emotionalTone}`);
      if ((ctx as any).keyPlotPoints) 
        sections.push(`关键情节点：\n${(ctx as any).keyPlotPoints}`);
      if ((ctx as any).povCharacter) 
        sections.push(`视角角色：${(ctx as any).povCharacter}`);
      
      const planningCtx = (ctx as any).planningContext;
      if (planningCtx) {
        sections.push('\n【大纲规划信息】');
        if (planningCtx.novelType) sections.push(`题材类型：${planningCtx.novelType}`);
        if (planningCtx.coreIdea) sections.push(`核心创意：\n${planningCtx.coreIdea}`);
        if (planningCtx.protagonistTypes?.length) sections.push(`主角类型：${planningCtx.protagonistTypes.join('、')}`);
      }
      
      const characterCtx = (ctx as any).characterContext;
      if (characterCtx && characterCtx.characterName) {
        sections.push('\n【角色信息】');
        sections.push(`角色姓名：${characterCtx.characterName}`);
        if (characterCtx.personalityCore) sections.push(`性格特点：${characterCtx.personalityCore}`);
      }
      
      const detailedOutlineCtx = (ctx as any).detailedOutlineContext;
      if (detailedOutlineCtx) {
        sections.push('\n【详细纲目】');
        if (detailedOutlineCtx.chaptersToGenerate) 
          sections.push(`生成章节数：${detailedOutlineCtx.chaptersToGenerate}章`);
        if (detailedOutlineCtx.startChapter) 
          sections.push(`起始章节：第${detailedOutlineCtx.startChapter}章`);
        
        const outlineChapters = detailedOutlineCtx.chapters;
        if (outlineChapters?.length) {
          sections.push(`\n已有纲目章节：`);
          const targetChapter = ctx.chapterNumber;
          const relevantChapters = targetChapter 
            ? outlineChapters.filter((c: any) => c.chapterNumber === targetChapter || c.chapter === targetChapter)
            : outlineChapters.slice(0, 3);
          relevantChapters.forEach((c: any) => {
            const chNum = c.chapterNumber || c.chapter;
            const chTitle = c.title || c.chapterTitle || `第${chNum}章`;
            const chSummary = c.summary || c.summary || '';
            const chHook = c.hook || c.悬念 || '';
            sections.push(`- ${chTitle}: ${chSummary}${chHook ? ' | 悬念: ' + chHook : ''}`);
          });
        }
      }
    }
  }
  
  if (stage === 'DIALOGUE') {
    if (ctx.selectedText) 
      sections.push(`待优化对话：\n${ctx.selectedText}`);
    if (ctx.scene) 
      sections.push(`场景：${ctx.scene}`);
    if (ctx.emotion) 
      sections.push(`情感基调：${ctx.emotion}`);
    if ((ctx as any).dialoguePurpose) {
      const purposes: Record<string, string> = {
        plot: '推动情节发展',
        character: '揭示人物性格',
        conflict: '制造冲突张力'
      };
      sections.push(`对话目的：${purposes[(ctx as any).dialoguePurpose] || '推动情节发展'}`);
    }
    if ((ctx as any).subtextHint) 
      sections.push(`潜台词提示：${(ctx as any).subtextHint}`);
  }

  if (stage === 'DETAILED_OUTLINE') {
    const detailCtx = ctx as any;
    if (detailCtx.chaptersToGenerate) 
      sections.push(`本次生成章节数：${detailCtx.chaptersToGenerate}章`);
    if (detailCtx.startChapter) 
      sections.push(`起始章节：第${detailCtx.startChapter}章`);
    if (detailCtx.includeHook) 
      sections.push(`包含悬念钩子：是`);
    if (detailCtx.includeSummary) 
      sections.push(`包含章节概要：是`);
    if (detailCtx.generateWithCharacters) 
      sections.push(`结合角色生成：是`);
    
    const planningCtx = detailCtx.planningContext;
    if (planningCtx) {
      sections.push('\n【大纲规划信息】');
      if (planningCtx.novelType) sections.push(`题材类型：${planningCtx.novelType}`);
      if (planningCtx.coreIdea) sections.push(`核心创意：\n${planningCtx.coreIdea}`);
      if (planningCtx.protagonistTypes?.length) sections.push(`主角类型：${planningCtx.protagonistTypes.join('、')}`);
      if (planningCtx.plotTypes?.length) sections.push(`情节类型：${planningCtx.plotTypes.join('、')}`);
      if (planningCtx.targetAudience) sections.push(`目标读者：${planningCtx.targetAudience}`);
      if (planningCtx.chapterCount) sections.push(`计划章节数：${planningCtx.chapterCount}章`);
      if (planningCtx.wordCountTarget) sections.push(`目标字数：${(planningCtx.wordCountTarget / 10000).toFixed(0)}万字`);
    }
    
    const characterCtx = detailCtx.characterContext;
    if (characterCtx && characterCtx.characterName) {
      sections.push('\n【已创建角色】');
      sections.push(`角色姓名：${characterCtx.characterName}`);
      if (characterCtx.characterType) {
        const typeMap: Record<string, string> = { protagonist: '主角', antagonist: '反派', supporting: '配角' };
        sections.push(`角色类型：${typeMap[characterCtx.characterType] || characterCtx.characterType}`);
      }
      if (characterCtx.occupation) sections.push(`职业：${characterCtx.occupation}`);
      if (characterCtx.personalityCore) sections.push(`性格核心：${characterCtx.personalityCore}`);
      if (characterCtx.backstory) sections.push(`背景故事：\n${characterCtx.backstory}`);
    }
  }
  
  if (stage === 'QUALITY_CHECK') {
    if (ctx.selectedText) 
      sections.push(`待检查内容：\n${ctx.selectedText}`);
    if (ctx.chapterNumber) 
      sections.push(`章节序号：第${ctx.chapterNumber}章`);
    if ((ctx as any).focusAreas?.length) 
      sections.push(`重点关注：${(ctx as any).focusAreas.join('、')}`);
    if ((ctx as any).strictMode) 
      sections.push(`评分模式：严格模式`);
  }
  
  return sections.length > 0 ? sections.join('\n') : '';
}

function buildOutputRequirements(stage: WritingStage): string[] {
  const requirements: Record<WritingStage, string[]> = {
    'PLANNING': [
      '严格按照模板格式输出大纲',
      '包含基本信息、TODO、章节规划、悬念线',
    ],
    'CHARACTER': [
      '按照角色档案模板创建',
      '核心价值观明确，最大恐惧和致命缺陷设定',
      '背景故事有深度，行为模式独特可辨',
    ],
    'DETAILED_OUTLINE': [
      '按要求生成指定数量的章节细纲',
      '每章包含：标题、核心情节点、悬念钩子（除非用户禁用）',
      '说明与前后章节的关联',
      '如果是首批章节，需要为整部书奠定基础',
    ],
    'CHAPTER_WRITING': [
      '严格遵循前20%原则 - 开头必须立即抓住读者',
      '使用十种强力开头技巧之一',
      '标准章节结构：开头(20%)→发展(60%)→高潮(15%)→结尾(5%)',
      '结尾必须设置悬念钩子',
      '与前文保持连贯性',
    ],
    'DIALOGUE': [
      '每句对话有目的（推动情节/揭示人物/制造冲突）',
      '对话简洁自然',
      '有潜台词（言外之意）',
      '能区分说话的角色',
    ],
    'CONTENT_EXPANSION': [
      '扩充内容要自然融入故事',
      '保持张力，即使扩充场景也不能失去冲突',
      '所有扩充最终都要指向核心剧情',
    ],
    'QUALITY_CHECK': [
      '输出9维度评分（单项1-10分，总分/80）',
      '列出主要优点和需要改进的地方',
      '给出具体修改建议',
      '质量标准：>60可交付，>70优秀',
    ],
    'CONSISTENCY': [
      '检查人物行为是否符合其性格设定',
      '检查前后伏笔是否有呼应',
      '检查时间线是否连贯',
      '检查悬念线是否延续',
    ],
    'IDLE': [],
  };
  
  return requirements[stage] || [];
}

export function buildPromptForStage(
  stage: WritingStage,
  ctx: Partial<WritingContext>,
  promptsMap: Map<string, string>
): string {
  if (stage === 'IDLE') return '';
  
  const stageName = STAGE_NAMES[stage];
  const promptContents = getPromptsByStage(stage, promptsMap);
  const contextSection = buildContextSection(ctx, stage);
  const outputRequirements = buildOutputRequirements(stage);
  
  let prompt = `你是一位专业的小说作家，专注于${stageName}。\n\n`;
  
  for (const content of promptContents) {
    if (content) {
      prompt += content + '\n\n';
    }
  }
  
  if (contextSection) {
    prompt += `【当前任务上下文】\n${contextSection}\n\n`;
  }
  
  if (outputRequirements.length > 0) {
    prompt += `【输出要求】\n`;
    for (let i = 0; i < outputRequirements.length; i++) {
      prompt += `${i + 1}. ${outputRequirements[i]}\n`;
    }
  }
  
  return prompt;
}

export function getStageName(stage: WritingStage): string {
  return STAGE_NAMES[stage] || stage;
}

export function getPromptsForStage(stage: WritingStage): string[] {
  return STAGE_TO_PROMPTS[stage] || [];
}