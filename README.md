# Writing Studio

AI 小说创作工作台：流水线写作、提示词模板、本地存储、富文本编辑。基于 Tauri+React。

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

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS
- **桌面端**: Tauri 2.0 (Rust)
- **AI Agent**: LangChain + 多模型 LLM (DeepSeek / GPT / Claude / GLM)
- **数据存储**: IndexedDB (Dexie) + 本地文件系统

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
