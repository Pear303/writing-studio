# LLM API 配置模板

## 环境变量模板 (.env.example)

```bash
# LLM API 配置
# 复制此文件为 .env 并填入真实的 API Key

# OpenAI GPT
OPENAI_API_KEY=sk-your-openai-api-key-here

# Google Gemini
GEMINI_API_KEY=your-gemini-api-key-here

# DeepSeek
DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here

# 智谱 GLM
GLM_API_KEY=your-glm-api-key-here

# 阿里云通义千问
QWEN_API_KEY=sk-your-qwen-api-key-here

# 默认使用的模型
DEFAULT_LLM_PROVIDER=GLM
DEFAULT_MODEL_ID=glm-4-flash
```

## YAML 配置模板 (llm-config.yaml)

```yaml
llm:
  # 默认提供商
  default_provider: "GLM"
  
  # 各提供商配置
  providers:
    gpt:
      api_key_env: "OPENAI_API_KEY"
      model_id: "gpt-4o-mini"
      api_url: "https://api.openai.com/v1/chat/completions"
      temperature: 0.95
      max_tokens: 1024
    
    gemini:
      api_key_env: "GEMINI_API_KEY"
      model_id: "gemini-1.5-flash"
      api_url: "https://generativelanguage.googleapis.com/v1beta/openai"
      temperature: 0.95
      max_tokens: 1024
    
    deepseek:
      api_key_env: "DEEPSEEK_API_KEY"
      model_id: "deepseek-v4-flash"
      api_url: "https://api.deepseek.com/chat/completions"
      temperature: 0.95
      max_tokens: 1024
    
    glm:
      api_key_env: "GLM_API_KEY"
      model_id: "glm-4-flash"
      api_url: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
      temperature: 0.95
      max_tokens: 1024
    
    qwen:
      api_key_env: "QWEN_API_KEY"
      model_id: "qwen-plus"
      api_url: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
      temperature: 0.95
      max_tokens: 1024
  
  # 对话历史配置
  dialogue:
    max_history_size: 20
    context_window: 4096
  
  # 重试配置
  retry:
    max_attempts: 3
    backoff_multiplier: 2
    initial_delay_ms: 1000
```

## JSON 配置模板 (llm-config.json)

```json
{
  "llm": {
    "default_provider": "GLM",
    "providers": {
      "gpt": {
        "api_key_env": "OPENAI_API_KEY",
        "model_id": "gpt-4o-mini",
        "api_url": "https://api.openai.com/v1/chat/completions",
        "temperature": 0.95,
        "max_tokens": 1024
      },
      "glm": {
        "api_key_env": "GLM_API_KEY",
        "model_id": "glm-4-flash",
        "api_url": "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        "temperature": 0.95,
        "max_tokens": 1024
      },
      "qwen": {
        "api_key_env": "QWEN_API_KEY",
        "model_id": "qwen-plus",
        "api_url": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        "temperature": 0.95,
        "max_tokens": 1024
      }
    },
    "dialogue": {
      "max_history_size": 20
    },
    "retry": {
      "max_attempts": 3,
      "backoff_multiplier": 2,
      "initial_delay_ms": 1000
    }
  }
}
```

## 安全提醒

- ⚠️ **永远不要**在代码中硬编码 API Key
- ⚠️ 将 `.env` 添加到 `.gitignore`
- ⚠️ 使用环境变量或密钥管理服务

## 环境变量读取示例

### Node.js / TypeScript

```typescript
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.GLM_API_KEY;
if (!apiKey) {
  throw new Error('GLM_API_KEY is not set');
}
```

### Python

```python
import os
from dotenv import load_dotenv

load_dotenv()

api_key = os.getenv('GLM_API_KEY')
if not api_key:
    raise ValueError('GLM_API_KEY is not set')
```

### Java

```java
import java.util.Map;

public class Config {
    public static String getApiKey(String provider) {
        Map<String, String> env = System.getenv();
        return env.get(provider + "_API_KEY");
    }
}
```