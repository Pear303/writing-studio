# 主题适配规范

> 适用于 writing-studio 项目的主题系统开发规范。本项目支持三种主题：dark（深色）、light（浅色）、eye-care（护眼模式）。

## 1. 核心原则

**禁止使用任何硬编码的 Tailwind 颜色类名**。所有颜色必须通过 CSS 变量或对应的 Tailwind 映射类名引用，确保主题切换时全局一致。

### 硬编码颜色（严禁使用）

```tsx
// ❌ 严禁
bg-white, bg-gray-100, bg-gray-700, bg-gray-800, bg-slate-*
text-gray-400, text-gray-500, text-gray-600, text-gray-900, text-slate-*
border-gray-200, border-gray-300, border-slate-*
hover:bg-gray-700, hover:bg-gray-700/30
```

### 对应的主题适配写法

```tsx
// ✅ 正确
bg-vscode-bg          // 主背景
bg-vscode-sidebar     // 侧边栏背景
bg-vscode-activitybar // 活动栏背景
text-vscode-text      // 主文本
border-vscode-border  // 边框
bg-vscode-active      // 激活/选中态
hover:bg-vscode-active/10  // 悬停态
```

## 2. CSS 变量体系

主题变量定义在 `src/App.css` 中，通过 `[data-theme]` 选择器切换：

| CSS 变量 | Tailwind 类名 | 用途 |
|----------|--------------|------|
| `--color-vscode-bg` | `bg-vscode-bg` | 主内容区背景 |
| `--color-vscode-sidebar` | `bg-vscode-sidebar` | 侧边栏背景 |
| `--color-vscode-activitybar` | `bg-vscode-activitybar` | 活动栏背景 |
| `--color-vscode-text` | `text-vscode-text` | 主文本颜色 |
| `--color-vscode-border` | `border-vscode-border` | 边框颜色 |
| `--color-vscode-active` | `bg-vscode-active` | 激活态/强调色 |
| `--color-vscode-active-light` | — | 激活态浅色（用于 hover） |
| `--color-vscode-active-medium` | — | 激活态中等色（用于选中背景） |
| `--color-hover-bg` | — | 通用悬停背景 |
| `--color-modal-overlay` | — | 模态框遮罩 |
| `--color-statusbar-bg` | — | 状态栏背景 |
| `--color-statusbar-text` | — | 状态栏文本 |

## 3. 常见场景映射

### 3.1 悬停效果

```tsx
// ❌ 硬编码
hover:bg-gray-700
hover:bg-gray-700/30
hover:bg-gray-700/20

// ✅ 主题适配
hover:bg-vscode-active/10
```

### 3.2 次要/辅助文本

```tsx
// ❌ 硬编码
text-gray-400    // 图标颜色
text-gray-500    // 占位符/辅助文字
text-slate-500   // 标签文字
text-slate-600   // 描述文字

// ✅ 主题适配
text-vscode-text opacity-40   // 图标颜色
text-vscode-text opacity-50   // 占位符/辅助文字
text-vscode-text opacity-60   // 标签文字（如设置项 label）
text-vscode-text opacity-70   // 描述文字
```

### 3.3 卡片/面板容器

```tsx
// ❌ 硬编码
bg-white border-slate-200
bg-slate-50 border-slate-200

// ✅ 主题适配
bg-vscode-sidebar border-vscode-border
bg-vscode-input border-vscode-border
```

### 3.4 输入框/选择框

```tsx
// ❌ 硬编码
bg-white border-slate-200 text-slate-800

// ✅ 使用预定义 CSS 类
className="input-field"          // <input> 元素
className="select-field"         // <select> 元素

// 或手动组合
className="bg-vscode-bg border-vscode-border text-vscode-text"
```

### 3.5 按钮

```tsx
// ❌ 硬编码
bg-gray-600 hover:bg-gray-700 text-white

// ✅ 主题适配
bg-vscode-input text-vscode-text hover:opacity-80
// 或使用激活色
bg-vscode-active text-white
```

### 3.6 内联样式中的颜色

```tsx
// ❌ 硬编码
style={{ backgroundColor: '#ffffff', color: '#1e293b' }}

// ✅ 使用 CSS 变量
style={{ backgroundColor: 'var(--color-vscode-bg)', color: 'var(--color-vscode-text)' }}
style={{ border: '1px solid var(--color-vscode-border)' }}
style={{ backgroundColor: 'var(--color-vscode-active-light)' }}
```

## 4. 预定义 CSS 类

`App.css` 中已定义以下可复用的样式类，优先使用：

| CSS 类名 | 用途 | 包含的样式 |
|----------|------|-----------|
| `.input-field` | 文本输入框 | bg + border + focus 样式 |
| `.select-field` | 下拉选择框 | bg + border + focus 样式 |
| `.card` | 卡片容器 | bg + border + 圆角 |
| `.card-hover` | 可交互卡片 | card + hover 效果 |
| `.modal-overlay` | 模态框遮罩 | 全屏遮罩 + 动画 |
| `.modal-content` | 模态框内容 | bg + border + 动画 |

## 5. 新增组件检查清单

每次创建或修改组件时，必须检查：

- [ ] 没有使用 `bg-white`、`bg-gray-*`、`bg-slate-*` 等硬编码背景色
- [ ] 没有使用 `text-gray-*`、`text-slate-*` 等硬编码文字色
- [ ] 没有使用 `border-gray-*`、`border-slate-*` 等硬编码边框色
- [ ] 没有使用 `hover:bg-gray-*` 等硬编码悬停色
- [ ] 内联样式中使用 `var(--color-vscode-*)` 而非十六进制颜色
- [ ] 输入框使用 `input-field` 类
- [ ] 选择框使用 `select-field` 类
- [ ] 在 dark / light / eye-care 三种主题下目视验证

## 6. 历史教训

### 6.1 遗漏原因分析

在项目早期开发中，大量组件使用了硬编码颜色，原因如下：

1. **未建立主题意识**：开发时默认在 dark 主题下工作，`bg-gray-700` 等在深色下看起来正常，切换到 light 主题后暴露问题
2. **复制粘贴惯性**：从外部示例代码复制时，未将颜色替换为主题变量
3. **缺乏自动化检查**：没有 lint 规则或 CI 检查来捕获硬编码颜色

### 6.2 已修复的典型问题

| 组件 | 原始写法 | 修复后 |
|------|---------|--------|
| SMTPSettingsPage | `bg-white text-slate-800 border-slate-200` | `bg-vscode-input text-vscode-text border-vscode-border` |
| EditorToolbar | `hover:bg-gray-700` | `hover:bg-vscode-active/10` |
| BookOutlineTree | `hover:bg-gray-700/30`、`text-gray-400` | `hover:bg-vscode-active/10`、`text-vscode-text opacity-40` |
| FontSelector | `hover:bg-gray-700` | `hover:bg-vscode-active/10` |
| App.tsx | `bg-gray-600 hover:bg-gray-700` | `bg-vscode-input text-vscode-text hover:opacity-80` |

## 7. 自动化扫描命令

定期运行以下命令检查是否有遗漏的硬编码颜色：

```powershell
# 在 src 目录下搜索常见的硬编码颜色类名
rg "bg-white|bg-slate-|text-slate-|border-slate-|hover:bg-gray-|text-gray-[0-9]|bg-gray-[0-9]" src/ --type tsx -l
```

如果发现结果，必须立即修复。
