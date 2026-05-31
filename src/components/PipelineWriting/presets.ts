export interface PresetOption {
  label: string;
  value: string;
}

export const GENRE_PRESETS: PresetOption[] = [
  { label: '玄幻', value: '玄幻' },
  { label: '都市', value: '都市' },
  { label: '科幻', value: '科幻' },
  { label: '悬疑', value: '悬疑' },
  { label: '言情', value: '言情' },
  { label: '历史', value: '历史' },
  { label: '军事', value: '军事' },
  { label: '游戏', value: '游戏' },
  { label: '末世', value: '末世' },
  { label: '仙侠', value: '仙侠' },
  { label: '奇幻', value: '奇幻' },
  { label: '武侠', value: '武侠' },
  { label: '灵异', value: '灵异' },
  { label: '校园', value: '校园' },
  { label: '职场', value: '职场' },
  { label: '古言', value: '古言' },
  { label: '现言', value: '现言' },
  { label: '轻小说', value: '轻小说' },
];

export const PLOT_TYPE_PRESETS: PresetOption[] = [
  { label: '升级流', value: '升级流' },
  { label: '复仇流', value: '复仇流' },
  { label: '重生流', value: '重生流' },
  { label: '系统流', value: '系统流' },
  { label: '种田流', value: '种田流' },
  { label: '探险流', value: '探险流' },
  { label: '宫斗', value: '宫斗' },
  { label: '商战', value: '商战' },
  { label: '推理破案', value: '推理破案' },
  { label: '争霸', value: '争霸' },
  { label: '养成', value: '养成' },
  { label: '逆袭', value: '逆袭' },
];

export const PROTAGONIST_PRESETS: PresetOption[] = [
  { label: '废柴逆袭', value: '废柴逆袭' },
  { label: '天才崛起', value: '天才崛起' },
  { label: '穿越者', value: '穿越者' },
  { label: '重生者', value: '重生者' },
  { label: '普通人', value: '普通人' },
  { label: '落魄贵族', value: '落魄贵族' },
  { label: '隐世高手', value: '隐世高手' },
  { label: '复仇者', value: '复仇者' },
  { label: '探险家', value: '探险家' },
  { label: '商人', value: '商人' },
  { label: '学生', value: '学生' },
  { label: '军人', value: '军人' },
];

export const TONE_PRESETS: PresetOption[] = [
  { label: '热血', value: '热血' },
  { label: '轻松', value: '轻松' },
  { label: '黑暗', value: '黑暗' },
  { label: '温馨', value: '温馨' },
  { label: '悬疑', value: '悬疑' },
  { label: '悲壮', value: '悲壮' },
  { label: '幽默', value: '幽默' },
  { label: '治愈', value: '治愈' },
  { label: '史诗', value: '史诗' },
  { label: '讽刺', value: '讽刺' },
];

export const WRITING_STYLE_PRESETS: PresetOption[] = [
  { label: '简洁明快', value: '简洁明快' },
  { label: '细腻优美', value: '细腻优美' },
  { label: '幽默诙谐', value: '幽默诙谐' },
  { label: '古风雅致', value: '古风雅致' },
  { label: '硬核写实', value: '硬核写实' },
  { label: '诗意抒情', value: '诗意抒情' },
  { label: '紧张刺激', value: '紧张刺激' },
  { label: '白描朴素', value: '白描朴素' },
  { label: '华丽辞藻', value: '华丽辞藻' },
];

export const STORY_LENGTH_PRESETS: PresetOption[] = [
  { label: '短篇 (2000-2万字)', value: '短篇' },
  { label: '中篇 (2万-6万字)', value: '中篇' },
  { label: '中长篇 (6万-15万字)', value: '中长篇' },
  { label: '长篇 (15万字+)', value: '长篇' },
];

export const CUSTOM_RULE_TEMPLATES: PresetOption[] = [
  { label: '每章结尾必须有悬念', value: '每章结尾必须有悬念' },
  { label: '避免使用网络用语', value: '避免使用网络用语' },
  { label: '对话占比不低于30%', value: '对话占比不低于30%' },
  { label: '每章字数控制在3000-5000字', value: '每章字数控制在3000-5000字' },
  { label: '重要角色必须有弧光', value: '重要角色必须有弧光' },
  { label: '每卷结尾需有高潮', value: '每卷结尾需有高潮' },
];
