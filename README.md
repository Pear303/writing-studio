# Writing Studio

基于 Tauri + React + TypeScript 开发的小说创作集成环境，支持书籍管理、大纲编辑、富文本写作、AI 辅助写作、质检等功能。

## 项目结构

```
writing-studio/
├── src/                    # 前端 React 代码
│   ├── App.tsx            # 主组件
│   ├── App.css            # 样式文件
│   └── main.tsx           # 入口文件
├── src-tauri/             # 后端 Rust 代码
│   ├── src/
│   │   ├── lib.rs         # 库入口
│   │   └── main.rs        # 二进制入口
│   ├── Cargo.toml         # Rust 依赖配置
│   └── tauri.conf.json    # Tauri 配置文件
├── package.json           # Node.js 依赖配置
└── vite.config.ts         # Vite 配置文件
```

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **桌面端**: Tauri 2.0 (Rust)
- **样式**: CSS

## 快速开始

### 前置要求

- Node.js（最新 LTS 版本）
- Rust 工具链

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run tauri dev
```

### 构建生产版本

```bash
# 构建生产版本
npm run tauri build
```

## 可用脚本

- `npm run dev` - 启动 Vite 开发服务器
- `npm run build` - 构建前端
- `npm run preview` - 预览生产构建
- `npm run tauri dev` - 启动 Tauri 开发环境
- `npm run tauri build` - 构建 Tauri 应用程序
