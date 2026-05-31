---
name: connect-llm-api
description: 帮助开发者快速集成主流大语言模型（LLM）API 到项目中。当用户想要增加云端大语言模型服务，通过 API Key 来获得大语言模型服务时使用此技能。
---

# LLM API 连接器

## 快速开始

### Step 1: 收集用户需求

向用户确认以下信息：

1. **目标编程语言**：Java / Python / TypeScript / Go / Rust
2. **项目构建工具**：Maven / Gradle / npm / pip / cargo / plain
3. **需要支持的 LLM 提供商**（至少选2个）：
   - GLM（智谱 AI）- 默认推荐，国内访问快
   - Qwen（阿里云通义千问）- 默认推荐
   - GPT（OpenAI）
   - Gemini（Google）
   - DeepSeek
4. **是否需要流式响应**：是/否
5. **输出目录**：默认 `./src/llm`

### Step 2: 生成代码

根据用户选择的语言和提供商，生成以下文件：

- **Provider 接口**：统一抽象层
- **Provider 实现**：各模型的具体调用逻辑
- **工厂类**：动态切换模型
- **对话管理**：维护对话历史
- **配置模板**：环境变量和配置文件

详细代码模板见 [templates.md](references/templates.md)。

### Step 3: 验证配置

确保用户知道：
- API Key 必须通过环境变量管理，绝不硬编码
- 将 `.env` 添加到 `.gitignore`
- 各模型 API 文档地址：
  - GLM: https://docs.bigmodel.cn/cn/guide
  - Qwen: https://bailian.console.aliyun.com
  - DeepSeek: https://api-docs.deepseek.com
  - Gemini: https://ai.google.dev/gemini-api/docs
  - GPT: https://platform.openai.com/docs

## 核心接口定义

所有 Provider 实现统一的接口规范：

```typescript
interface LlmProvider {
  getProviderName(): string;
  getModelId(): string;
  callApi(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string
  ): Promise<string>;
  validateConfig(apiKey: string, apiUrl: string): boolean;
}
```

各语言的接口定义和实现模板在 [templates.md](references/templates.md)。

## 支持的模型配置

| Provider | 默认模型 | 默认 API URL |
|----------|---------|-------------|
| GLM | glm-4-flash | https://open.bigmodel.cn/api/paas/v4/chat/completions |
| Qwen | qwen-plus | https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions |
| DeepSeek | deepseek-v4-flash | https://api.deepseek.com/chat/completions |
| GPT | gpt-4o-mini | https://api.openai.com/v1/chat/completions |
| Gemini | gemini-1.5-flash | https://generativelanguage.googleapis.com/v1beta/openai |

## 配置文件模板

配置模板在 [configs.md](references/configs.md)：
- `.env.example` 环境变量模板
- `llm-config.yaml` 配置文件模板
- `llm-config.json` 配置文件模板

## 使用示例

```python
# 创建 Provider（Python 示例）
from llm_provider_factory import LlmProviderFactory

provider = LlmProviderFactory.createProvider(
    "GLM",
    api_key=os.getenv("GLM_API_KEY"),
    model_id="glm-4-flash"
)

# 调用 API
response = provider.callApi(
    "你好",
    dialogue_history=[],
    system_prompt="你是一个有用的AI助手"
)
print(response)
```

完整示例代码见 [examples.md](references/examples.md)。

## 质量检查

交付前确保：
- [ ] 所有接口有完整文档注释
- [ ] 字符串拼接使用转义函数（防止 JSON 注入）
- [ ] HTTP 连接正确关闭
- [ ] 异常处理完整
- [ ] 无硬编码 API Key
- [ ] 配置文件模板格式正确