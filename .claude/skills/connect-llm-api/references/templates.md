# LLM API 代码模板

## TypeScript 接口定义

```typescript
// 对话条目
export interface DialogueEntry {
  role: 'user' | 'assistant';
  message: string;
}

// LLM Provider 接口
export interface LlmProvider {
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

## TypeScript Provider 实现模板

```typescript
import { LlmProvider, DialogueEntry } from '../LlmProvider';

export class GlmProvider implements LlmProvider {
  private apiKey: string;
  private apiUrl: string;
  private modelId: string;

  constructor(apiKey: string, apiUrl?: string, modelId?: string) {
    this.apiKey = apiKey;
    this.apiUrl = apiUrl || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
    this.modelId = modelId || 'glm-4-flash';
  }

  getProviderName(): string {
    return 'GLM';
  }

  getModelId(): string {
    return this.modelId;
  }

  async callApi(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string
  ): Promise<string> {
    const messages = this.buildMessages(userMessage, dialogueHistory, systemPrompt);
    const body = JSON.stringify({
      model: this.modelId,
      messages,
      temperature: 0.95,
      max_tokens: 1024
    });

    const response = await this.sendRequest(this.apiUrl, this.apiKey, body);
    return this.parseResponse(response);
  }

  validateConfig(apiKey: string, apiUrl: string): boolean {
    return !!apiKey && !!apiUrl;
  }

  private buildMessages(
    userMessage: string,
    dialogueHistory: DialogueEntry[],
    systemPrompt: string
  ): object[] {
    const messages: object[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    dialogueHistory.forEach(entry => {
      messages.push({ role: entry.role, content: entry.message });
    });

    messages.push({ role: 'user', content: userMessage });
    return messages;
  }

  private async sendRequest(url: string, apiKey: string, body: string): Promise<string> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body
    });

    if (!response.ok) {
      throw new Error(`API call failed: ${response.status} ${response.statusText}`);
    }

    return await response.text();
  }

  private parseResponse(responseJson: string): string {
    const data = JSON.parse(responseJson);
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error('API response has no content');
    }
    return content;
  }
}
```

## Python 接口定义

```python
from abc import ABC, abstractmethod
from typing import List, Optional

class DialogueEntry:
    def __init__(self, role: str, message: str):
        self.role = role  # 'user' or 'assistant'
        self.message = message

class LlmProvider(ABC):
    @abstractmethod
    def get_provider_name(self) -> str:
        pass

    @abstractmethod
    def get_model_id(self) -> str:
        pass

    @abstractmethod
    def call_api(
        self,
        user_message: str,
        dialogue_history: List[DialogueEntry],
        system_prompt: str
    ) -> str:
        pass

    @abstractmethod
    def validate_config(self, api_key: str, api_url: str) -> bool:
        pass
```

## Python Provider 实现模板

```python
import json
import urllib.request
import urllib.error
from typing import List

class GlmProvider(LlmProvider):
    def __init__(self, api_key: str, api_url: str = None, model_id: str = None):
        self.api_key = api_key
        self.api_url = api_url or 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
        self.model_id = model_id or 'glm-4-flash'

    def get_provider_name(self) -> str:
        return 'GLM'

    def get_model_id(self) -> str:
        return self.model_id

    def call_api(
        self,
        user_message: str,
        dialogue_history: List[DialogueEntry],
        system_prompt: str
    ) -> str:
        messages = self._build_messages(user_message, dialogue_history, system_prompt)
        body = json.dumps({
            'model': self.model_id,
            'messages': messages,
            'temperature': 0.95,
            'max_tokens': 1024
        })

        response = self._send_request(self.api_url, self.api_key, body)
        return self._parse_response(response)

    def validate_config(self, api_key: str, api_url: str) -> bool:
        return bool(api_key) and bool(api_url)

    def _build_messages(self, user_message: str, dialogue_history: List[DialogueEntry], system_prompt: str) -> List[dict]:
        messages = []
        if system_prompt:
            messages.append({'role': 'system', 'content': system_prompt})
        for entry in dialogue_history:
            messages.append({'role': entry.role, 'content': entry.message})
        messages.append({'role': 'user', 'content': user_message})
        return messages

    def _send_request(self, url: str, api_key: str, body: str) -> str:
        req = urllib.request.Request(
            url,
            data=body.encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {api_key}'
            },
            method='POST'
        )
        req.add_header('Authorization', f'Bearer {api_key}')

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return response.read().decode('utf-8')
        except urllib.error.HTTPError as e:
            raise Exception(f'HTTP Error {e.code}: {e.read().decode("utf-8")}')
        except urllib.error.URLError as e:
            raise Exception(f'URL Error: {e.reason}')

    def _parse_response(self, response_json: str) -> str:
        data = json.loads(response_json)
        content = data.get('choices', [{}])[0].get('message', {}).get('content')
        if not content:
            raise Exception('API response has no content')
        return content
```

## Java 接口定义

```java
package com.example.llm.provider;

import java.util.List;

public interface LlmProvider {
    String getProviderName();
    String getModelId();
    String callApi(String userMessage, List<DialogueEntry> dialogueHistory, String systemPrompt) throws Exception;
    boolean validateConfig(String apiKey, String apiUrl);
}
```

## Java Provider 实现模板

```java
package com.example.llm.provider;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.List;

public class GlmProvider implements LlmProvider {

    private String apiKey;
    private String apiUrl;
    private String modelId;

    public GlmProvider(String apiKey, String apiUrl, String modelId) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl != null && !apiUrl.isEmpty() 
            ? apiUrl 
            : "https://open.bigmodel.cn/api/paas/v4/chat/completions";
        this.modelId = modelId != null ? modelId : "glm-4-flash";
    }

    @Override
    public String getProviderName() {
        return "GLM";
    }

    @Override
    public String getModelId() {
        return modelId;
    }

    @Override
    public String callApi(String userMessage, List<DialogueEntry> dialogueHistory, String systemPrompt) throws Exception {
        String requestBody = buildRequestBody(userMessage, dialogueHistory, systemPrompt);
        String response = sendHttpRequest(apiUrl, apiKey, requestBody);
        return parseResponse(response);
    }

    @Override
    public boolean validateConfig(String apiKey, String apiUrl) {
        return apiKey != null && !apiKey.isEmpty() && apiUrl != null && !apiUrl.isEmpty();
    }

    private String buildRequestBody(String userMessage, List<DialogueEntry> dialogueHistory, String systemPrompt) {
        StringBuilder messages = new StringBuilder();

        if (systemPrompt != null && !systemPrompt.isEmpty()) {
            messages.append("{\"role\":\"system\",\"content\":\"")
                   .append(escapeJsonString(systemPrompt)).append("\"},");
        }

        for (DialogueEntry entry : dialogueHistory) {
            String role = entry.getType() == DialogueEntry.DialogueType.USER ? "user" : "assistant";
            messages.append("{\"role\":\"").append(role)
                   .append("\",\"content\":\"")
                   .append(escapeJsonString(entry.getMessage())).append("\"},");
        }

        messages.append("{\"role\":\"user\",\"content\":\"")
               .append(escapeJsonString(userMessage)).append("\"}");

        return "{\"model\":\"" + modelId + "\",\"messages\":[" + messages + "],\"temperature\":0.95,\"max_tokens\":1024}";
    }

    private String sendHttpRequest(String apiUrl, String apiKey, String requestBody) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(apiUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setRequestProperty("Authorization", "Bearer " + apiKey);
            conn.setConnectTimeout(30000);
            conn.setReadTimeout(60000);
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                byte[] input = requestBody.getBytes(StandardCharsets.UTF_8);
                os.write(input, 0, input.length);
            }

            int responseCode = conn.getResponseCode();
            if (responseCode != 200) {
                throw new IOException("HTTP error: " + responseCode);
            }

            try (BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) {
                    response.append(line);
                }
                return response.toString();
            }
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }

    private String parseResponse(String responseJson) throws Exception {
        // 简单 JSON 解析 - 生产环境建议使用 Jackson/Gson
        // 从 choices[0].message.content 提取内容
        // 这里需要实现 JSON 解析逻辑
        // ...
    }

    private String escapeJsonString(String input) {
        if (input == null) return "";
        return input.replace("\\", "\\\\")
                   .replace("\"", "\\\"")
                   .replace("\n", "\\n")
                   .replace("\r", "\\r")
                   .replace("\t", "\\t");
    }
}
```

## 工厂类模板

### TypeScript 工厂

```typescript
import { LlmProvider } from './LlmProvider';
import { GlmProvider } from './providers/GlmProvider';
import { QwenProvider } from './providers/QwenProvider';
import { GptProvider } from './providers/GptProvider';
import { GeminiProvider } from './providers/GeminiProvider';
import { DeepSeekProvider } from './providers/DeepSeekProvider';

export enum LlmProviderType {
  GLM = 'GLM',
  QWEN = 'QWEN',
  GPT = 'GPT',
  GEMINI = 'GEMINI',
  DEEPSEEK = 'DEEPSEEK'
}

export class LlmProviderFactory {
  static createProvider(
    type: LlmProviderType,
    apiKey: string,
    modelId?: string,
    apiUrl?: string
  ): LlmProvider {
    switch (type) {
      case LlmProviderType.GLM:
        return new GlmProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.QWEN:
        return new QwenProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.GPT:
        return new GptProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.GEMINI:
        return new GeminiProvider(apiKey, apiUrl, modelId);
      case LlmProviderType.DEEPSEEK:
        return new DeepSeekProvider(apiKey, apiUrl, modelId);
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
  }
}
```

### Python 工厂

```python
from enum import Enum
from typing import Optional

class LlmProviderType(Enum):
    GLM = 'GLM'
    QWEN = 'QWEN'
    GPT = 'GPT'
    GEMINI = 'GEMINI'
    DEEPSEEK = 'DEEPSEEK'

class LlmProviderFactory:
    @staticmethod
    def create_provider(
        provider_type: LlmProviderType,
        api_key: str,
        model_id: Optional[str] = None,
        api_url: Optional[str] = None
    ) -> 'LlmProvider':
        if provider_type == LlmProviderType.GLM:
            from .providers.glm_provider import GlmProvider
            return GlmProvider(api_key, api_url, model_id)
        elif provider_type == LlmProviderType.QWEN:
            from .providers.qwen_provider import QwenProvider
            return QwenProvider(api_key, api_url, model_id)
        # ... 其他 provider
        else:
            raise ValueError(f'Unknown provider type: {provider_type}')
```

## 对话历史管理

### TypeScript

```typescript
export class DialogueManager {
  private history: DialogueEntry[] = [];
  private maxHistorySize: number;

  constructor(maxHistorySize: number = 20) {
    this.maxHistorySize = maxHistorySize;
  }

  addUserMessage(message: string): void {
    this.history.push({ role: 'user', message });
    this.trimHistory();
  }

  addAssistantMessage(message: string): void {
    this.history.push({ role: 'assistant', message });
    this.trimHistory();
  }

  private trimHistory(): void {
    while (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }
  }

  getHistory(): DialogueEntry[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}
```

### Python

```python
from typing import List

class DialogueManager:
    def __init__(self, max_history_size: int = 20):
        self._history: List[DialogueEntry] = []
        self._max_history_size = max_history_size

    def add_user_message(self, message: str):
        self._history.append(DialogueEntry('user', message))
        self._trim_history()

    def add_assistant_message(self, message: str):
        self._history.append(DialogueEntry('assistant', message))
        self._trim_history()

    def _trim_history(self):
        while len(self._history) > self._max_history_size:
            self._history.pop(0)

    def get_history(self) -> List[DialogueEntry]:
        return list(self._history)

    def clear_history(self):
        self._history = []
```