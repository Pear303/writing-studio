# 设置持久化规范

> 适用于 writing-studio 项目的用户偏好与设置持久化开发规范。确保用户设置在刷新/重启 Tauri 应用后不丢失。

## 1. 核心原则

**所有用户可配置的设置项必须持久化到 localStorage**。用户修改设置后，应立即写入；应用启动时，应从 localStorage 读取并作为初始值。

### 持久化模式

```tsx
// ✅ 标准模式：useState 初始化从 localStorage 读取，变更时同步写入
const [theme, setTheme] = useState<Theme>(() => {
  return (localStorage.getItem('theme') as Theme) || 'light';
});

const handleThemeChange = (newTheme: Theme) => {
  setTheme(newTheme);
  localStorage.setItem('theme', newTheme);
};
```

### 反模式（严禁）

```tsx
// ❌ 硬编码初始值，不读取 localStorage
const [theme, setTheme] = useState<Theme>('dark');

// ❌ 修改状态但不写入 localStorage
const handleThemeChange = (newTheme: Theme) => {
  setTheme(newTheme);
  // 缺少 localStorage.setItem('theme', newTheme);
};
```

## 2. 需要持久化的设置项清单

### 2.1 通用设置（SettingsPanel - 通用 Tab）

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 主题 | `theme` | `'dark' \| 'light' \| 'eye-care'` | `'light'` | ✅ 已实现 |
| 启动窗口模式 | `startupWindowMode` | `'maximized' \| 'fullscreen'` | `'maximized'` | ✅ 已实现 |
| 自动保存间隔 | `autoSaveInterval` | `number` | `30` | ✅ 已实现 |
| 编辑器默认字号 | `editorFontSize` | `number` | `16` | ✅ 已实现 |

### 2.2 字体设置（SettingsPanel - 通用 Tab - 字体区）

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 字体设置整体 | `fontSettings` | `FontSettings` (JSON) | 见下方 | ✅ 已实现（useFontManager） |
| 自定义字体元数据 | `customFontMetaList` | `CustomFontMeta[]` (JSON) | `[]` | ✅ 已实现（useFontManager） |

`FontSettings` 默认值：
```typescript
{
  chineseFont: 'Microsoft YaHei',
  englishFont: 'Arial',
  fontSize: '16',
  fontWeight: '400',
  letterSpacing: '0',
  fontApplyScope: 'editor',
}
```

### 2.3 排版设置（SettingsPanel - 通用 Tab - 排版区）

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 全局排版设置 | `formattingSettings` | `FormattingSettings` (JSON) | 见类型定义 | ✅ 已实现 |
| 每本书排版设置 | `formattingSettings_{bookId}` | `FormattingSettings` (JSON) | 继承全局 | ✅ 已实现 |

### 2.4 字数统计设置

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 字数统计设置 | `wordCountSettings` | `WordCountSettings` (JSON) | 见类型定义 | ✅ 已实现 |

### 2.5 写作目标

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 写作目标 | `writingGoal` | `object` (JSON) | — | ✅ 已实现 |
| 写作目标日期 | `writingGoalDate` | `string` | — | ✅ 已实现 |
| 今日已写字数 | `todayWordCount` | `string` | `'0'` | ✅ 已实现 |
| 上次总字数 | `lastWordCount` | `string` | `'0'` | ✅ 已实现 |

### 2.6 UI 状态

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 卷展开状态 | `expandedVolumes_{bookId}` | `Set<string>` (JSON Array) | — | ✅ 已实现 |
| 质检面板状态 | `qualityCheck_{chapterId}` | `object` (JSON) | — | ✅ 已实现 |
| 质检面板评分 | `qualityCheck_{chapterId}_scores` | `object` (JSON) | — | ✅ 已实现 |

### 2.7 路径记忆

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 最后导出路径 | `lastExportPath` | `string` | `''` | ✅ 已实现 |
| 备份导出路径 | `lastBackupExportPath` | `string` | `''` | ✅ 已实现 |
| 备份导入路径 | `lastBackupImportPath` | `string` | `''` | ✅ 已实现 |

### 2.8 认证相关

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| 认证令牌 | `auth_token` | `AuthToken` (JSON) | — | ✅ 已实现 |
| 记住我 | `remember_me` | `'true' \| null` | `null` | ✅ 已实现 |
| 用户会话 | `user_session` | `object` (JSON) | — | ✅ 已实现 |
| 游客 ID | `guest_id` | `string` | 自动生成 | ✅ 已实现 |
| 当前用户 ID | `currentUserId` | `string` | — | ✅ 已实现 |
| 加密密钥 | `encryption_key_{userId}` | `string` | — | ✅ 已实现 |

### 2.9 LLM / Agent

| 设置项 | localStorage Key | 类型 | 默认值 | 持久化状态 |
|--------|-----------------|------|--------|-----------|
| Agent API URL | `agentApiUrl` | `string` | 默认 URL | ✅ 已实现 |

## 3. 新增设置项时的检查流程

每次新增用户可配置的设置项时，必须完成以下步骤：

1. **确定 localStorage Key**：使用 camelCase 命名，与设置项名称对应
2. **确定默认值**：在 `useState` 初始化函数中提供合理的默认值
3. **实现读取**：`useState(() => { const saved = localStorage.getItem('key'); return saved ? parse(saved) : defaultValue; })`
4. **实现写入**：在 onChange 回调中同步写入 `localStorage.setItem('key', value)`
5. **处理复杂对象**：使用 `JSON.stringify` / `JSON.parse`，并包裹 try-catch
6. **数据导出/导入**：如果设置项需要在数据备份中包含，需在 `db/index.ts` 的 `exportAllData` / `importAllData` 中添加对应逻辑
7. **验证**：修改设置 → 刷新页面 → 确认设置已保留

## 4. 数据流架构

```
SettingsPanel (UI 层)
    ↓ onChange
App.tsx / Sidebar (状态管理层)
    ↓ setState + localStorage.setItem
localStorage (持久化层)
    ↑ useState 初始化函数
App.tsx / Sidebar (状态管理层)
    ↓ props
SettingsPanel (UI 层)
```

关键规则：
- **单一数据源**：设置的真实状态保存在 App.tsx 中，SettingsPanel 通过 props 接收和回调
- **即时写入**：状态变更时立即写入 localStorage，不延迟、不批量
- **初始化读取**：useState 使用函数初始化器从 localStorage 读取，避免额外渲染

## 5. 复杂对象的持久化模板

```tsx
// 读取
const [settings, setSettings] = useState<MySettings>(() => {
  const saved = localStorage.getItem('mySettings');
  if (saved) {
    try {
      return { ...defaultSettings, ...JSON.parse(saved) };
    } catch {
      return defaultSettings;
    }
  }
  return defaultSettings;
});

// 写入
const handleSettingsChange = (newSettings: MySettings) => {
  setSettings(newSettings);
  localStorage.setItem('mySettings', JSON.stringify(newSettings));
};

// 部分更新
const updateSettings = (partial: Partial<MySettings>) => {
  setSettings(prev => {
    const updated = { ...prev, ...partial };
    localStorage.setItem('mySettings', JSON.stringify(updated));
    return updated;
  });
};
```

## 6. 历史教训

### 6.1 遗漏原因分析

1. **状态定义与持久化分离**：在 SettingsPanel 中定义了本地状态，但没有将变更同步到 App.tsx 和 localStorage
2. **默认值硬编码**：`useState(30)` 等写法忽略了 localStorage 中已保存的值
3. **props 传递断裂**：App.tsx 中的定时器使用硬编码常量，未与设置面板的值关联

### 6.2 已修复的典型问题

| 设置项 | 原始问题 | 修复方式 |
|--------|---------|---------|
| 主题 | `useState('light')` 硬编码，切换后不保存 | 从 localStorage 读取初始值，onChange 时写入 |
| 自动保存间隔 | SettingsPanel 本地状态，App.tsx 定时器写死 30 秒 | App.tsx 新增状态 + props 传递 + localStorage |
| 编辑器字号 | SettingsPanel 本地状态，不保存 | 通过 props 与 App.tsx 联动 + localStorage |

## 7. 自动化检查

新增设置项后，运行以下检查确保持久化完整：

```powershell
# 检查所有 useState 是否有对应的 localStorage 读取
rg "useState\(\s*\d+\s*\)" src/ --type tsx -n
# 上述命令查找硬编码数字初始值，可能遗漏 localStorage 读取

# 检查 localStorage.setItem 是否覆盖所有设置项
rg "localStorage.setItem" src/ --type tsx -n
```
