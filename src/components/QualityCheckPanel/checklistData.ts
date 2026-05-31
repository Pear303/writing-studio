/** 检查项类型 */
export interface CheckItem {
  id: string;
  text: string;
  subItems?: string[];
}

/** 检查分组 */
export interface CheckSection {
  id: string;
  title: string;
  items: CheckItem[];
}

/** 完整检查清单 */
export const QUALITY_CHECKLIST: CheckSection[] = [
  {
    id: 'overall',
    title: '整体检查',
    items: [
      { id: 'overall-title', text: '章节有明确标题', subItems: ['标题与内容相关', '吸引人但不过度透露'] },
      { id: 'overall-wordcount', text: '字数符合预期', subItems: ['短章节：800-1500 字', '标准章节：1500-3000 字', '长章节：3000-6000 字'] },
      { id: 'overall-completeness', text: '章节完整性', subItems: ['有开头、发展、高潮', '不是片段，是完整叙事单元'] },
      { id: 'overall-setting', text: '时间地点清晰', subItems: ['读者知道何时何地', '转换时有明确标记'] },
    ],
  },
  {
    id: 'opening',
    title: '开头检查',
    items: [
      { id: 'opening-hook', text: '前 3 段内抓住读者', subItems: ['有行动/冲突/悬念', '不是天气或日常流程'] },
      { id: 'opening-connection', text: '与上一章有连接', subItems: ['回应上一章结尾', '或明确时间/地点跳跃'] },
      { id: 'opening-infodump', text: '背景信息不过量', subItems: ['没有大段信息倾倒', '信息自然融入动作'] },
    ],
  },
  {
    id: 'content',
    title: '内容检查',
    items: [
      {
        id: 'content-core-event',
        text: '本章有核心事件',
        subItems: ['发生了不可删除的事', '不是"什么都没发生"的过渡章'],
      },
      {
        id: 'content-plot',
        text: '推动主线剧情',
        subItems: ['揭示新信息', '或改变人物关系', '或升级冲突'],
      },
      {
        id: 'content-logic',
        text: '逻辑自洽',
        subItems: ['事件因果关系合理', '没有巧合驱动剧情', '人物行为符合动机'],
      },
      {
        id: 'content-conflict',
        text: '有明确冲突',
        subItems: ['人与人、人与环境、人与自己', '冲突推动本章事件'],
      },
      {
        id: 'content-tension',
        text: '张力有变化',
        subItems: ['不是平铺直叙', '有紧张和缓解的交替'],
      },
      {
        id: 'content-twist',
        text: '有转折或新信息',
        subItems: ['不是线性可预测', '有意外或新发现'],
      },
    ],
  },
  {
    id: 'character',
    title: '人物检查',
    items: [
      { id: 'character-consistency', text: '人物行为一致', subItems: ['符合已建立的性格', '如不一致，有解释'] },
      { id: 'character-reaction', text: '人物有反应', subItems: ['对事件有情绪/行动', '不是被动道具'] },
      { id: 'character-voice', text: '人物有声音', subItems: ['对话能区分角色', '每人说话方式不同'] },
      { id: 'character-showing', text: '人物展示而非讲述', subItems: ['通过行动/对话表现性格', '不是直接陈述"他很勇敢"'] },
    ],
  },
  {
    id: 'dialogue',
    title: '对话检查',
    items: [
      { id: 'dialogue-purpose', text: '每句对话有目的', subItems: ['推动情节/揭示人物/制造冲突', '没有"你好""吃了吗"等无意义对话'] },
      { id: 'dialogue-concise', text: '对话简洁自然', subItems: ['删除冗余词语', '符合真实说话方式'] },
      { id: 'dialogue-subtext', text: '有潜台词', subItems: ['不是所有话都直说', '有言外之意'] },
      { id: 'dialogue-tags', text: '标签使用正确', subItems: ['能辨识时省略标签', '不过度使用副词'] },
    ],
  },
  {
    id: 'suspense',
    title: '悬念检查',
    items: [
      { id: 'suspense-hook', text: '结尾有钩子', subItems: ['使用至少一种悬念技巧', '让读者想看下一章'] },
      { id: 'suspense-intensity', text: '悬念强度适当', subItems: ['与故事位置匹配', '高潮章节悬念更强'] },
      { id: 'suspense-genuine', text: '不是虚假悬念', subItems: ['不是机械误会', '不是无意义的"突然"'] },
      { id: 'suspense-foreshadow', text: '为下一章铺垫', subItems: ['设置下一章的冲突', '埋下伏笔'] },
    ],
  },
  {
    id: 'showing',
    title: '展示而非讲述检查',
    items: [
      { id: 'showing-emotion', text: '是否直接陈述情绪？（改为身体反应）' },
      { id: 'showing-adjective', text: '是否用形容词总结？（改为具体描写）' },
      { id: 'showing-scene', text: '是否跳过了关键场景？（补充展示）' },
    ],
  },
  {
    id: 'rhythm',
    title: '节奏检查',
    items: [
      { id: 'rhythm-sentence', text: '句子长度有变化', subItems: ['没有连续 3 句长度相同', '长短交错'] },
      { id: 'rhythm-paragraph', text: '段落长度适当', subItems: ['避免大段文字墙', '动作场景用短段落'] },
      { id: 'rhythm-density', text: '信息密度有变化', subItems: ['高密度（动作/对话）', '低密度（描写/内心）'] },
    ],
  },
  {
    id: 'language',
    title: '语言检查',
    items: [
      { id: 'language-ai', text: '没有 AI 写作痕迹', subItems: ['避免"此外""然而""强调"等 AI 词汇', '避免四字成语堆砌', '句式多样化'] },
      { id: 'language-de', text: '"的"字不密集', subItems: ['没有连续多个"的"', '简化修饰结构'] },
      { id: 'language-precision', text: '用词精确', subItems: ['避免模糊词（"一些""某种"）', '使用具体词汇'] },
    ],
  },
  {
    id: 'coherence',
    title: '连贯性检查',
    items: [
      { id: 'coherence-previous', text: '与前文连贯', subItems: ['上一章的悬念有回应', '已知信息一致'] },
      { id: 'coherence-planting', text: '伏笔有呼应', subItems: ['早期埋下的线索有进展', '或即将揭示'] },
      { id: 'coherence-timeline', text: '时间线一致', subItems: ['时间流逝合理', '事件顺序正确'] },
    ],
  },
  {
    id: 'final',
    title: '交付前最终检查',
    items: [
      { id: 'final-proofread', text: '通读全文，无错别字' },
      { id: 'final-punctuation', text: '标点符号正确' },
      { id: 'final-dialogue-tags', text: '对话标签正确' },
      { id: 'final-paragraphs', text: '段落划分清晰' },
      { id: 'final-format', text: '格式一致' },
      { id: 'final-continuity', text: '如果是续章，确认与前文的连贯性' },
    ],
  },
];

/** 评分维度 */
export interface ScoreDimension {
  id: string;
  label: string;
  maxScore: number;
}

export const SCORE_DIMENSIONS: ScoreDimension[] = [
  { id: 'opening', label: '开头吸引力', maxScore: 10 },
  { id: 'plot', label: '情节推进', maxScore: 10 },
  { id: 'character', label: '人物塑造', maxScore: 10 },
  { id: 'dialogue', label: '对话质量', maxScore: 10 },
  { id: 'suspense', label: '悬念设置', maxScore: 10 },
  { id: 'rhythm', label: '节奏控制', maxScore: 10 },
  { id: 'showing', label: '展示而非讲述', maxScore: 10 },
  { id: 'language', label: '语言质量', maxScore: 10 },
];
