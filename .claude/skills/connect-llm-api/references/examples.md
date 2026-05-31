# LLM API 使用示例

## Python 示例

### 基础调用

```python
import os
from llm_provider import LlmProviderFactory, LlmProviderType

# 创建 Provider
provider = LlmProviderFactory.createProvider(
    LlmProviderType.GLM,
    api_key=os.getenv("GLM_API_KEY"),
    model_id="glm-4-flash"
)

# 调用 API
response = provider.callApi(
    "请介绍一下你自己",
    dialogue_history=[],
    system_prompt="你是一个有用的AI助手"
)
print(response)
```

### 带对话历史

```python
from dialogue_manager import DialogueManager

# 创建对话管理器
dialogue = DialogueManager(max_history_size=20)

# 第一次对话
dialogue.add_user_message("什么是人工智能？")
response1 = provider.callApi(
    "什么是人工智能？",
    dialogue.get_history(),
    "你是一个专业的AI教师"
)
dialogue.add_assistant_message(response1)

# 跟进问题
dialogue.add_user_message("能举个实际应用的例子吗？")
response2 = provider.callApi(
    "能举个实际应用的例子吗？",
    dialogue.get_history(),
    "你是一个专业的AI教师"
)
print(response2)
```

### 模型切换

```python
# 切换到 Qwen
qwen_provider = LlmProviderFactory.createProvider(
    LlmProviderType.QWEN,
    api_key=os.getenv("QWEN_API_KEY"),
    model_id="qwen-plus"
)

response = qwen_provider.callApi(
    "用一句话总结今天天气",
    [],
    "你是一个简洁的天气预报员"
)
print(response)
```

### 使用 ReplyService（推荐）

```python
from reply_service import ReplyService

# 创建服务
service = ReplyService(
    provider_name="GLM",
    api_key=os.getenv("GLM_API_KEY"),
    system_prompt="你是一个专业的写作助手"
)

# 发送消息
reply = service.send_message("帮我写一段Python代码")
print(reply)

# 继续对话（自动维护历史）
follow_up = service.send_message("能加上注释吗？")
print(follow_up)

# 切换模型
service.switch_provider("QWEN", os.getenv("QWEN_API_KEY"))
```

## TypeScript 示例

### 基础调用

```typescript
import { LlmProviderFactory, LlmProviderType } from './LlmProviderFactory';

const provider = LlmProviderFactory.createProvider(
  LlmProviderType.GLM,
  process.env.GLM_API_KEY!,
  'glm-4-flash'
);

const response = await provider.callApi(
  '请介绍一下你自己',
  [],
  '你是一个有用的AI助手'
);
console.log(response);
```

### 带对话历史

```typescript
import { DialogueManager } from './DialogueManager';

const dialogue = new DialogueManager(20);

// 第一次对话
dialogue.addUserMessage('什么是人工智能？');
const response1 = await provider.callApi(
  '什么是人工智能？',
  dialogue.getHistory(),
  '你是一个专业的AI教师'
);
dialogue.addAssistantMessage(response1);

// 跟进问题
dialogue.addUserMessage('能举个实际应用的例子吗？');
const response2 = await provider.callApi(
  '能举个实际应用的例子吗？',
  dialogue.getHistory(),
  '你是一个专业的AI教师'
);
console.log(response2);
```

## Java 示例

### 基础调用

```java
import com.example.llm.*;
import com.example.llm.provider.LlmProvider;
import java.util.List;

public class Main {
    public static void main(String[] args) {
        try {
            // 创建 Provider
            LlmProvider provider = LlmProviderFactory.createProvider(
                LlmProviderType.GLM,
                System.getenv("GLM_API_KEY"),
                "glm-4-flash"
            );

            // 调用 API
            String response = provider.callApi(
                "请介绍一下你自己",
                List.of(), // 空的历史记录
                "你是一个有用的AI助手"
            );
            System.out.println(response);
        } catch (Exception e) {
            System.err.println("调用失败: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
```

### 使用 ReplyService

```java
// 创建服务
ReplyService service = new ReplyService(
    "GLM",
    System.getenv("GLM_API_KEY"),
    "你是一个专业的写作助手"
);

// 发送消息
String reply = service.sendMessage("帮我写一段Java代码");
System.out.println(reply);

// 继续对话
String followUp = service.sendMessage("能加上注释吗？");
System.out.println(followUp);

// 切换模型
service.switchProvider("QWEN", System.getenv("QWEN_API_KEY"));
```

## 流式响应示例（如果启用）

### Python

```python
import requests

url = "https://open.bigmodel.cn/api/paas/v4/chat/completions"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}
data = {
    "model": "glm-4-flash",
    "messages": [{"role": "user", "content": "讲一个故事"}],
    "stream": True
}

response = requests.post(url, headers=headers, json=data, stream=True)

for line in response.iter_lines():
    if line:
        line = line.decode('utf-8')
        if line.startswith('data: '):
            content = parse_sse_data(line)
            print(content, end='', flush=True)
```

## 错误处理示例

```python
import time

def call_with_retry(provider, message, max_retries=3):
    for attempt in range(max_retries):
        try:
            return provider.callApi(message, [], "你是一个有用的助手")
        except Exception as e:
            if attempt == max_retries - 1:
                raise e
            # 指数退避
            delay = (2 ** attempt) * 1000
            print(f"重试 {attempt + 1}/{max_retries}, 等待 {delay}ms")
            time.sleep(delay / 1000)
```

## 模型选择建议

| 场景 | 推荐模型 | 参数建议 |
|------|---------|---------|
| 创意写作 | GPT-4, Qwen-Max | temperature: 0.9-1.0 |
| 代码生成 | DeepSeek Coder, GPT-4 | temperature: 0.2-0.5 |
| 快速问答 | GLM-Flash, Gemini-Flash | 低延迟优先 |
| 长文本处理 | Qwen-Long, GPT-4-Turbo | 大上下文窗口 |