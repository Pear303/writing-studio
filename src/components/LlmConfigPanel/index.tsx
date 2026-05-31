import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, RefreshCw, Download, Upload, Eye, EyeOff, Plug, Copy, ExternalLink, Lightbulb } from 'lucide-react';
import { Toast, type ToastType } from '../Toast';
import type { LLMConfig, LLMProviderType, LLMProviderPreset } from '../../types';
import { 
  getAllLLMConfigs, 
  saveLLMConfig, 
  deleteLLMConfig, 
  setDefaultLLMConfig,
  encodeApiKey,
  decodeApiKey
} from '../../db';
import { testConnection } from '../../llm';

interface LlmConfigPanelProps {
  onClose?: () => void;
  onConfigChange?: (config: LLMConfig | null) => void;
}

const PRESETS: LLMProviderPreset[] = [
  {
    provider: 'openai' as LLMProviderType,
    name: 'OpenAI (GPT)',
    defaultApiUrl: 'https://api.openai.com/v1/chat/completions',
    defaultModel: 'gpt-4o',
    apiKeyPlaceholder: 'sk-xxxx...',
    docsUrl: 'https://platform.openai.com/docs',
    authHeader: 'Authorization',
  },
  {
    provider: 'anthropic' as LLMProviderType,
    name: 'Anthropic (Claude)',
    defaultApiUrl: 'https://api.anthropic.com/v1/messages',
    defaultModel: 'claude-3-5-sonnet-20241022',
    apiKeyPlaceholder: 'sk-ant-xxxx...',
    docsUrl: 'https://docs.anthropic.com/en/api',
    authHeader: 'x-api-key',
  },
  {
    provider: 'google' as LLMProviderType,
    name: 'Google (Gemini)',
    defaultApiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
    defaultModel: 'gemini-2.0-flash-exp',
    apiKeyPlaceholder: 'AIza...',
    docsUrl: 'https://ai.google.dev/gemini-api/docs',
    authHeader: 'x-goog-api-key',
  },
  {
    provider: 'azure' as LLMProviderType,
    name: 'Azure OpenAI',
    defaultApiUrl: 'https://{your-resource}.openai.azure.com/openai/deployments/{deployment}/chat/completions',
    defaultModel: 'gpt-4',
    apiKeyPlaceholder: 'Azure API Key',
    docsUrl: 'https://learn.microsoft.com/azure/ai-services/openai/',
    authHeader: 'api-key',
  },
  {
    provider: 'glm' as LLMProviderType,
    name: '智谱 AI (GLM)',
    defaultApiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    defaultModel: 'glm-4-flash',
    apiKeyPlaceholder: 'glm-xxx...',
    docsUrl: 'https://docs.bigmodel.cn/cn/guide',
    authHeader: 'Authorization',
  },
  {
    provider: 'qwen' as LLMProviderType,
    name: '阿里云 (通义千问)',
    defaultApiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    defaultModel: 'qwen-plus',
    apiKeyPlaceholder: 'sk-xxx...',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions',
    authHeader: 'Authorization',
  },
  {
    provider: 'deepseek' as LLMProviderType,
    name: 'DeepSeek',
    defaultApiUrl: 'https://api.deepseek.com/v1/chat/completions',
    defaultModel: 'deepseek-chat',
    apiKeyPlaceholder: 'sk-xxx...',
    docsUrl: 'https://api-docs.deepseek.com',
    authHeader: 'Authorization',
  },
  {
    provider: 'minimax' as LLMProviderType,
    name: 'MiniMax',
    defaultApiUrl: 'https://api.minimax.io/v1/text/chatcompletion_v2',
    defaultModel: 'MiniMax-M2.5',
    apiKeyPlaceholder: 'MiniMax API Key',
    docsUrl: 'https://platform.minimax.io/docs/api-reference/text-chat',
    authHeader: 'Authorization',
  },
  {
    provider: 'custom' as LLMProviderType,
    name: '自定义',
    defaultApiUrl: '',
    defaultModel: '',
    apiKeyPlaceholder: 'API Key',
    docsUrl: '',
    authHeader: 'Authorization',
  },
];

interface FormData {
  name: string;
  provider: LLMProviderType;
  apiKey: string;
  apiUrl: string;
  model: string;
  isDefault: boolean;
}

interface FormErrors {
  name?: string;
  apiKey?: string;
  apiUrl?: string;
  model?: string;
}

const initialFormData: FormData = {
  name: '',
  provider: 'openai',
  apiKey: '',
  apiUrl: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4o',
  isDefault: false,
};

export const LlmConfigPanel = ({ onClose, onConfigChange }: LlmConfigPanelProps) => {
  const [configs, setConfigs] = useState<LLMConfig[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [errors, setErrors] = useState<FormErrors>({});
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadConfigs();
  }, []);

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type });
  };

  const loadConfigs = async () => {
    try {
      const allConfigs = await getAllLLMConfigs();
      setConfigs(allConfigs);
      
      const defaultConfig = allConfigs.find(c => c.isDefault);
      if (defaultConfig && onConfigChange) {
        onConfigChange(defaultConfig);
      }
    } catch (error) {
      showToast('加载配置失败', 'error');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = '请输入配置名称';
    }
    
    if (!formData.apiKey.trim()) {
      newErrors.apiKey = '请输入 API Key';
    }
    
    if (!formData.apiUrl.trim()) {
      newErrors.apiUrl = '请输入 API URL';
    }
    
    if (!formData.model.trim()) {
      newErrors.model = '请输入模型 ID';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleProviderChange = (provider: LLMProviderType) => {
    const preset = PRESETS.find(p => p.provider === provider);
    setFormData({
      ...formData,
      provider,
      apiUrl: preset?.defaultApiUrl || '',
      model: preset?.defaultModel || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSaving(true);
    
    try {
      const config: LLMConfig = {
        id: editingId || '',
        name: formData.name.trim(),
        provider: formData.provider,
        apiKey: encodeApiKey(formData.apiKey.trim()),
        apiUrl: formData.apiUrl.trim(),
        model: formData.model.trim(),
        isDefault: formData.isDefault,
        createdAt: 0,
        updatedAt: 0,
      };
      
      await saveLLMConfig(config);
      showToast(editingId ? '配置已更新' : '配置已添加', 'success');
      resetForm();
      loadConfigs();
    } catch (error) {
      showToast('保存失败', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (config: LLMConfig) => {
    setEditingId(config.id);
    setFormData({
      name: config.name,
      provider: config.provider,
      apiKey: decodeApiKey(config.apiKey),
      apiUrl: config.apiUrl,
      model: config.model,
      isDefault: config.isDefault,
    });
    setIsEditing(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此配置吗？')) {
      return;
    }
    
    try {
      await deleteLLMConfig(id);
      showToast('配置已删除', 'success');
      loadConfigs();
    } catch (error) {
      showToast('删除失败', 'error');
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await setDefaultLLMConfig(id);
      showToast('已设为默认模型', 'success');
      loadConfigs();
    } catch (error) {
      showToast('设置失败', 'error');
    }
  };

  const handleTestConnection = async () => {
    if (!formData.apiKey.trim() || !formData.apiUrl.trim() || !formData.model.trim()) {
      showToast('请填写完整的 API 信息', 'warning');
      return;
    }
    
    setIsTesting(true);
    
    try {
      const result = await testConnection(
        formData.provider,
        formData.apiKey.trim(),
        formData.apiUrl.trim(),
        formData.model.trim()
      );
      
      if (result.success) {
        showToast(result.latency ? `连接成功！耗时 ${result.latency}ms` : '连接成功！', 'success');
      } else {
        showToast(`连接失败: ${result.message}`, 'error');
      }
    } catch (error) {
      showToast(`连接失败: ${error instanceof Error ? error.message : '未知错误'}`, 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const resetForm = () => {
    setFormData(initialFormData);
    setIsEditing(false);
    setEditingId(null);
    setErrors({});
  };

  const handleExport = () => {
    const exportData = configs.map(c => ({
      ...c,
      apiKey: c.apiKey,
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llm-configs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('配置已导出', 'success');
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const importedConfigs = JSON.parse(text);
        
        if (!Array.isArray(importedConfigs)) {
          throw new Error('Invalid format');
        }
        
        for (const config of importedConfigs) {
          await saveLLMConfig({
            ...config,
            id: '',
            createdAt: 0,
            updatedAt: 0,
          });
        }
        
        showToast('配置已导入', 'success');
        loadConfigs();
      } catch (error) {
        showToast('导入失败: 格式不正确', 'error');
      }
    };
    input.click();
  };

  const defaultConfig = configs.find(c => c.isDefault);
  const preset = PRESETS.find(p => p.provider === formData.provider);

  return (
    <div className="h-full flex flex-col bg-vscode-sidebar overflow-hidden">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="p-4 border-b border-vscode-border flex items-center justify-between">
        <h2 className="text-lg font-semibold text-vscode-text">LLM 配置</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleImport}
            className="p-1.5 rounded hover:bg-vscode-border text-vscode-text opacity-70 hover:opacity-100"
            title="导入配置"
          >
            <Upload size={16} />
          </button>
          <button
            onClick={handleExport}
            className="p-1.5 rounded hover:bg-vscode-border text-vscode-text opacity-70 hover:opacity-100"
            title="导出配置"
          >
            <Download size={16} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-vscode-border text-vscode-text opacity-70 hover:opacity-100"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {configs.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-medium text-vscode-text opacity-60 mb-2">已配置模型</h3>
            <div className="space-y-2">
              {configs.map(config => (
                <div
                  key={config.id}
                  className={`p-3 rounded border ${
                    config.isDefault 
                      ? 'border-vscode-active bg-vscode-active/10' 
                      : 'border-vscode-border'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-vscode-text">{config.name}</span>
                      {config.isDefault && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-vscode-active text-white">
                          默认
                        </span>
                      )}
                      <span className="text-xs text-vscode-text opacity-50">
                        {PRESETS.find(p => p.provider === config.provider)?.name}
                      </span>
                    </div>
                    <div className="flex items-center space-x-1">
                      {!config.isDefault && (
                        <button
                          onClick={() => handleSetDefault(config.id)}
                          className="p-1 rounded hover:bg-vscode-border text-vscode-text opacity-50 hover:opacity-100"
                          title="设为默认"
                        >
                          <Check size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => handleEdit(config)}
                        className="p-1 rounded hover:bg-vscode-border text-vscode-text opacity-50 hover:opacity-100"
                        title="编辑"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(config.id)}
                        className="p-1 rounded hover:bg-vscode-border text-red-500 opacity-50 hover:opacity-100"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-vscode-text opacity-50">
                    {config.model}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-vscode-border pt-4">
          <h3 className="text-xs font-medium text-vscode-text opacity-60 mb-3">
            {isEditing ? '编辑配置' : '添加新配置'}
          </h3>
          
          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <div>
              <label className="block text-xs mb-1 text-vscode-text opacity-60">配置名称</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="如: GPT-4, Claude-3"
                className="w-full px-2 py-1.5 text-sm bg-vscode-input text-vscode-text border border-vscode-border rounded focus:outline-none focus:border-vscode-active input-field"
              />
              {errors.name && <p className="text-xs mt-1" style={{ color: 'var(--color-danger, #ef4444)' }}>{errors.name}</p>}
            </div>

            <div>
              <label className="block text-xs mb-1 text-vscode-text opacity-60">提供商</label>
              <select
                value={formData.provider}
                onChange={e => handleProviderChange(e.target.value as LLMProviderType)}
                className="w-full px-2 py-1.5 text-sm bg-vscode-input text-vscode-text border border-vscode-border rounded focus:outline-none focus:border-vscode-active select-field"
              >
                {PRESETS.map(p => (
                  <option key={p.provider} value={p.provider}>{p.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1 text-vscode-text opacity-60">
                API Key {formData.provider === 'azure' && '(Azure)'}
              </label>
              <div className="relative overflow-visible">
                <div className="relative">
                  <input
                    type="text"
                    value={formData.apiKey}
                    onChange={e => setFormData({ ...formData, apiKey: e.target.value })}
                    placeholder={preset?.apiKeyPlaceholder || 'API Key'}
                    autoComplete="off"
                    inputMode="none"
                    data-lpignore="true"
                    className={`w-full px-2 py-1.5 pr-8 text-sm bg-vscode-input text-vscode-text border border-vscode-border rounded focus:outline-none focus:border-vscode-active input-field ${!showApiKey ? 'password-mask' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="password-toggle-btn absolute right-2 top-1/2 -translate-y-1/2 text-vscode-text opacity-50 hover:opacity-100 z-10"
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {errors.apiKey && <p className="text-xs mt-1" style={{ color: 'var(--color-danger, #ef4444)' }}>{errors.apiKey}</p>}
            </div>

            <div>
              <label className="block text-xs mb-1 text-vscode-text opacity-60">API URL</label>
              <input
                type="text"
                value={formData.apiUrl}
                onChange={e => setFormData({ ...formData, apiUrl: e.target.value })}
                placeholder="API 端点 URL"
                className="w-full px-2 py-1.5 text-sm bg-vscode-input text-vscode-text border border-vscode-border rounded focus:outline-none focus:border-vscode-active input-field"
              />
              {errors.apiUrl && <p className="text-xs mt-1" style={{ color: 'var(--color-danger, #ef4444)' }}>{errors.apiUrl}</p>}
            </div>

            <div>
              <label className="block text-xs mb-1 text-vscode-text opacity-60">模型 ID</label>
              <input
                type="text"
                value={formData.model}
                onChange={e => setFormData({ ...formData, model: e.target.value })}
                placeholder="如: gpt-4o, claude-3-5-sonnet-20241022"
                className="w-full px-2 py-1.5 text-sm bg-vscode-input text-vscode-text border border-vscode-border rounded focus:outline-none focus:border-vscode-active input-field"
              />
              {errors.model && <p className="text-xs mt-1" style={{ color: 'var(--color-danger, #ef4444)' }}>{errors.model}</p>}
            </div>

            <div>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={e => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="mr-2"
                />
                <span className="text-xs text-vscode-text">设为默认模型</span>
              </label>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 px-3 py-2 text-sm rounded flex items-center justify-center space-x-1 transition-colors hover:opacity-80 disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-vscode-active, #007acc)',
                  color: '#ffffff',
                }}
              >
                {isSaving ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <>
                    <Plus size={14} />
                    <span>{isEditing ? '更新配置' : '添加配置'}</span>
                  </>
                )}
              </button>
              
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTesting || !formData.apiKey || !formData.apiUrl || !formData.model}
                className="px-3 py-2 text-sm rounded flex items-center justify-center space-x-1 transition-colors disabled:opacity-50"
                style={{
                  backgroundColor: 'var(--color-success-light, rgba(34, 197, 94, 0.2))',
                  color: 'var(--color-success, #22c55e)',
                }}
                onMouseEnter={(e) => {
                  if (!e.currentTarget.disabled) {
                    e.currentTarget.style.backgroundColor = 'var(--color-success-medium, rgba(34, 197, 94, 0.3))';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--color-success-light, rgba(34, 197, 94, 0.2))';
                }}
              >
                {isTesting ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <>
                    <Plug size={14} />
                    <span>测试</span>
                  </>
                )}
              </button>
              
              {isEditing && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-2 text-sm rounded flex items-center justify-center space-x-1 transition-colors bg-vscode-border text-vscode-text hover:bg-vscode-border/80"
                >
                  <X size={14} />
                  <span>取消</span>
                </button>
              )}
            </div>
          </form>
        </div>

        {defaultConfig && (
          <div 
            className="mt-4 p-3 rounded border"
            style={{
              backgroundColor: 'var(--color-vscode-active-light, rgba(0, 122, 204, 0.1))',
              borderColor: 'var(--color-vscode-active-medium, rgba(0, 122, 204, 0.3))',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-vscode-text opacity-60">当前使用</div>
                <div className="text-sm font-medium text-vscode-text">
                  {defaultConfig.name} ({PRESETS.find(p => p.provider === defaultConfig.provider)?.name})
                </div>
                <div className="text-xs text-vscode-text opacity-50 mt-1">{defaultConfig.model}</div>
              </div>
              <Copy 
                size={16} 
                className="text-vscode-text opacity-40 cursor-pointer hover:opacity-100"
                onClick={() => {
                  navigator.clipboard.writeText(defaultConfig.model);
                  showToast('模型 ID 已复制', 'success');
                }}
              />
            </div>
          </div>
        )}

        <div className="mt-4 p-3 rounded bg-vscode-border/30">
          <h4 className="text-xs font-medium text-vscode-text mb-2 flex items-center gap-1.5">
            <Lightbulb size={14} className="text-yellow-500" />
            快速入门
          </h4>
          <ul className="text-xs text-vscode-text opacity-60 space-y-1">
            <li>• 选择提供商并填写 API Key</li>
            <li>• 大多数提供商使用官方默认配置即可</li>
            <li>• Azure 用户需要填写自定义端点</li>
            <li>• 配置已 Base64 加密存储，安全可靠</li>
          </ul>
          {preset?.docsUrl && (
            <a
              href={preset.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center text-xs text-vscode-active hover:underline"
            >
              <ExternalLink size={12} className="mr-1" />
              查看 {preset.name} 官方文档
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default LlmConfigPanel;