import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  CheckCircle, Circle, ChevronDown, ChevronRight, ClipboardList,
  Save, RotateCcw, Star, CheckSquare, Square, Sparkles, Loader, Bot, Wrench, Lightbulb,
  AlertTriangle, Shield, ShieldOff, SkipForward
} from 'lucide-react';
import { QUALITY_CHECKLIST, SCORE_DIMENSIONS, type CheckSection } from './checklistData';
import type { Chapter, ReviewIssue, ReviewSeverity } from '../../types';
import { db, getDefaultLLMConfig, decodeApiKey } from '../../db';
import { LlmProviderFactory } from '../../llm';
import { generateId } from '../../utils/helpers';
import { debugLogger } from '../../services/DebugLogger';

/** AI 质检返回的单一维度评分 */
interface AIDimensionScore {
  id: string;
  name: string;
  score: number;
  comment: string;
}

/** AI 质检的完整返回结果 */
interface AIQualityResult {
  overallScore: number;
  dimensions: AIDimensionScore[];
  strengths: string[];
  improvements: string[];
  suggestions: string[];
  summary: string;
}

interface QualityCheckPanelProps {
  bookId?: string;
  currentChapter?: Chapter | null;
  onCheckComplete?: (result: { passed: number; total: number; score: number }) => void;
  reviewIssues?: ReviewIssue[];
  reviewScore?: number;
  reviewPassed?: boolean;
  onSkipReviewBlock?: () => void;
}

function buildQualityCheckSystemPrompt(
  checklistContent: string,
  selectedSectionTitles: string[]
): string {
  const focusLine = selectedSectionTitles.length > 0
    ? `\n用户已自查并标记以下方面为重点关注：${selectedSectionTitles.join('、')}。请在评分时对这些方面给予额外关注。`
    : '';

  return `你是一位资深的出版级小说编辑，拥有20年以上的文学审稿经验。你的任务是按照以下质量检查清单，对用户提交的小说章节进行严格的、建设性的质量评估。

${checklistContent}

【评分标准】
- 每个维度满分10分，总分80分
- 9分及以上：该维度表现卓越，堪称范例
- 7-8分：表现良好，有亮点
- 5-6分：基本达标，但仍有提升空间
- 3-4分：存在明显不足
- 1-2分：严重欠缺，需大幅改进
- 评分必须客观、有区分度，不要给所有维度打相同的分数

【重要原则】
1. 坦诚直接地指出问题，同时给出可操作的改进建议
2. 避免泛泛而谈的评语，每个评价都要引用章节中的具体内容
3. 优点和缺点都应具体明确，避免「写得不错」「需要改进」等空话
4. 评分要严格按照标准，不要吝啬高分也不要随意给高分
${focusLine}

【输出格式要求】
<<<<<<< HEAD
请严格按照以下JSON格式返回（不要包含代码块标记，只返回纯JSON）：
=======
请严格按照以下JSON格式返回（不要包含markdown代码块标记，只返回纯JSON）：
>>>>>>> a3c3812c35f7ea215c38605f0651c42cca74529c
{
  "overallScore": 65,
  "dimensions": [
    { "id": "opening", "name": "开头吸引力", "score": 8, "comment": "具体评语..." },
    { "id": "plot", "name": "情节推进", "score": 7, "comment": "具体评语..." },
    { "id": "character", "name": "人物塑造", "score": 6, "comment": "具体评语..." },
    { "id": "dialogue", "name": "对话质量", "score": 7, "comment": "具体评语..." },
    { "id": "suspense", "name": "悬念设置", "score": 8, "comment": "具体评语..." },
    { "id": "rhythm", "name": "节奏控制", "score": 7, "comment": "具体评语..." },
    { "id": "showing", "name": "展示而非讲述", "score": 6, "comment": "具体评语..." },
    { "id": "language", "name": "语言质量", "score": 7, "comment": "具体评语..." }
  ],
  "strengths": ["优点1（具体，引用原文）", "优点2"],
  "improvements": ["改进点1（具体，指出位置）", "改进点2"],
  "suggestions": ["建议1（可操作）", "建议2"],
  "summary": "总体评价总结（2-3句话）"
}`;
}

/** 从本地加载 quality-checklist.md 内容 */
function loadQualityChecklistContent(): string {
  try {
    const modules = import.meta.glob('../../references/*.md', {
      query: '?raw',
      eager: true,
      import: 'default',
    }) as Record<string, string>;
    const content = modules['../../references/quality-checklist.md'];
    if (content && typeof content === 'string') return content;
  } catch {
    console.warn('[QualityCheckPanel] 无法通过 glob 加载 quality-checklist.md');
  }
  return buildFallbackChecklist();
}

function buildFallbackChecklist(): string {
  const lines: string[] = ['# 质量检查清单', ''];
  for (const section of QUALITY_CHECKLIST) {
    lines.push(`## ${section.title}`, '');
    for (const item of section.items) {
      lines.push(`- **${item.text}**`);
      if (item.subItems) {
        for (const sub of item.subItems) {
          lines.push(`  - ${sub}`);
        }
      }
    }
    lines.push('');
  }
  lines.push('## 评分维度');
  for (const dim of SCORE_DIMENSIONS) {
    lines.push(`- ${dim.label}（满分${dim.maxScore}分）`);
  }
  return lines.join('\n');
}

function parseAIQualityResponse(rawText: string): AIQualityResult | null {
  let jsonStr = rawText.trim();

  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  if (jsonStr.startsWith('{')) {
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) {
      jsonStr = jsonStr.slice(0, lastBrace + 1);
    }
  }

  try {
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.overallScore !== 'number') return null;
    if (!Array.isArray(parsed.dimensions) || parsed.dimensions.length === 0) return null;

    const dimensions: AIDimensionScore[] = parsed.dimensions.map((d: any) => ({
      id: String(d.id || ''),
      name: String(d.name || ''),
      score: Math.max(0, Math.min(10, Number(d.score) || 0)),
      comment: String(d.comment || ''),
    }));

    return {
      overallScore: Math.max(0, Math.min(80, Number(parsed.overallScore) || 0)),
      dimensions,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String) : [],
      improvements: Array.isArray(parsed.improvements) ? parsed.improvements.map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      summary: String(parsed.summary || ''),
    };
  } catch {
    console.error('[QualityCheckPanel] JSON 解析失败，原始回复:', rawText.slice(0, 500));
    return null;
  }
}

export const QualityCheckPanel: React.FC<QualityCheckPanelProps> = ({
  bookId,
  currentChapter,
  onCheckComplete,
  reviewIssues,
  reviewScore,
  reviewPassed,
  onSkipReviewBlock,
}) => {
  const storageKey = bookId ? `qa_checked_${bookId}` : null;

  const [checkedItems, setCheckedItems] = useState<Set<string>>(() => {
    if (!storageKey) return new Set();
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(QUALITY_CHECKLIST.map(s => s.id))
  );
  const [scores, setScores] = useState<Record<string, { score: number; reason: string }>>(() => {
    if (!storageKey) return {};
    try {
      const saved = localStorage.getItem(`${storageKey}_scores`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<AIQualityResult | null>(null);
  const [showAIResultModal, setShowAIResultModal] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    if (!storageKey) {
      setCheckedItems(new Set());
      setScores({});
      return;
    }
    try {
      const saved = localStorage.getItem(storageKey);
      setCheckedItems(saved ? new Set(JSON.parse(saved)) : new Set());
      const savedScores = localStorage.getItem(`${storageKey}_scores`);
      setScores(savedScores ? JSON.parse(savedScores) : {});
    } catch {
      setCheckedItems(new Set());
      setScores({});
    }
  }, [bookId]);

  const persistChecked = useCallback((items: Set<string>) => {
    if (!storageKey) return;
    localStorage.setItem(storageKey, JSON.stringify([...items]));
  }, [storageKey]);

  const persistScores = useCallback((s: Record<string, { score: number; reason: string }>) => {
    if (!storageKey) return;
    localStorage.setItem(`${storageKey}_scores`, JSON.stringify(s));
  }, [storageKey]);

  const totalItems = useMemo(() => {
    return QUALITY_CHECKLIST.reduce((sum, section) => sum + section.items.length, 0);
  }, []);

  const passedItems = checkedItems.size;

  const totalScore = useMemo(() => {
    return Object.values(scores).reduce((sum, s) => sum + (s.score || 0), 0);
  }, [scores]);

  const toggleItem = (itemId: string) => {
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      persistChecked(next);
      return next;
    });
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  const toggleSectionAll = (section: CheckSection) => {
    const allChecked = section.items.every(i => checkedItems.has(i.id));
    setCheckedItems(prev => {
      const next = new Set(prev);
      if (allChecked) {
        section.items.forEach(i => next.delete(i.id));
      } else {
        section.items.forEach(i => next.add(i.id));
      }
      persistChecked(next);
      return next;
    });
  };

  const getSectionProgress = (section: CheckSection) => {
    const checked = section.items.filter(i => checkedItems.has(i.id)).length;
    return { checked, total: section.items.length };
  };

  const handleScoreChange = (dimensionId: string, value: number) => {
    setScores(prev => {
      const next = {
        ...prev,
        [dimensionId]: {
          score: Math.max(0, Math.min(10, value)),
          reason: prev[dimensionId]?.reason || '',
        },
      };
      persistScores(next);
      return next;
    });
  };

  const handleReasonChange = (dimensionId: string, reason: string) => {
    setScores(prev => {
      const next = {
        ...prev,
        [dimensionId]: {
          score: prev[dimensionId]?.score || 0,
          reason,
        },
      };
      persistScores(next);
      return next;
    });
  };

  const handleReset = () => {
    setCheckedItems(new Set());
    setScores({});
    setSaveMessage(null);
    setAiResult(null);
    setShowAIResultModal(false);
    setAnalysisError(null);
    if (storageKey) {
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`${storageKey}_scores`);
    }
  };

  const handleSave = async () => {
    if (!bookId) {
      setSaveMessage('请先选择一本书');
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string; suggestion?: string }> = [];
      const dimensionScores = Object.entries(scores).map(([id, s]) => ({
        id,
        score: s.score,
        reason: s.reason,
      }));

      QUALITY_CHECKLIST.forEach(section => {
        section.items.forEach(item => {
          if (!checkedItems.has(item.id)) {
            const severity = section.id === 'final' || section.id === 'overall' ? 'error' : 'warning';
            issues.push({
              type: severity,
              message: `[${section.title}] ${item.text}`,
              suggestion: item.subItems?.join('；'),
            });
          }
        });
      });

      const record = {
        id: generateId(),
        bookId,
        chapterId: currentChapter?.id,
        stage: 'QUALITY_CHECK' as const,
        content: `手动质检 - ${currentChapter?.title || '未知章节'}`,
        issues,
        score: totalScore,
        dimensionScores,
        createdAt: Date.now(),
      };

      await db.qaRecords.add(record);

      setSaveMessage('质检结果已保存');
      setShowResultModal(true);
      onCheckComplete?.({ passed: passedItems, total: totalItems, score: totalScore });
    } catch (err) {
      setSaveMessage('保存失败，请重试');
      console.error('[QualityCheckPanel] 保存失败:', err);
    } finally {
      setIsSaving(false);
    }
  };

  /** AI 智能质检 */
  const handleAIQualityCheck = async () => {
    if (!currentChapter) {
      setAnalysisError('请先选择一个章节');
      return;
    }

    const config = await getDefaultLLMConfig();
    if (!config) {
      setAnalysisError('请先在设置中配置默认 LLM 模型');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    setAiResult(null);

    try {
      const checklistContent = loadQualityChecklistContent();

      const selectedSectionTitles = QUALITY_CHECKLIST
        .filter(section => section.items.some(item => checkedItems.has(item.id)))
        .map(s => s.title);

      const systemPrompt = buildQualityCheckSystemPrompt(checklistContent, selectedSectionTitles);

      const rawContent = currentChapter.content?.replace(/<[^>]*>/g, '') || '';
      const chapterTitle = currentChapter.title || '未命名章节';

      const userMessage = `请对以下小说章节进行质量评估。

【章节标题】${chapterTitle}
【章节字数】${currentChapter.wordCount || '未知'} 字

【章节内容】
${rawContent}

请按照系统提示词中的质量检查清单，对上述章节进行全面评估，并严格按照JSON格式返回结果。`;

      const provider = LlmProviderFactory.createProvider(config);
      const apiKey = decodeApiKey(config.apiKey);

      if (!provider.validateConfig(apiKey, config.apiUrl)) {
        throw new Error('LLM 配置验证失败，请检查 API Key 和 API URL');
      }

      const correlationId = `qc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      debugLogger.log({
        source: 'service',
        category: 'llm-call',
        direction: `QualityCheck → ${config.provider}/${config.model}`,
        correlationId,
        systemPrompt,
        userMessage,
        metadata: { provider: config.provider, model: config.model, chapterId: currentChapter?.id },
      });

      const responseText = await provider.callApi(userMessage, [], systemPrompt);

      debugLogger.log({
        source: 'service',
        category: 'llm-call',
        direction: `QualityCheck ← ${config.provider}/${config.model}`,
        correlationId,
        response: responseText,
        responseLength: responseText.length,
        metadata: { provider: config.provider, model: config.model },
      });

      const result = parseAIQualityResponse(responseText);
      if (!result) {
        throw new Error(
          `AI 返回结果无法解析。原始回复（前200字）：\n${responseText.slice(0, 200)}...`
        );
      }

      setAiResult(result);
      setShowAIResultModal(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI 质检请求失败';
      setAnalysisError(message);
      console.error('[QualityCheckPanel] AI 质检失败:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  /** 保存 AI 质检结果到历史记录 */
  const handleSaveAIResult = async () => {
    if (!bookId || !aiResult) return;

    try {
      const issues: Array<{ type: 'error' | 'warning' | 'info'; message: string; suggestion?: string }> = [];

      aiResult.dimensions.forEach(dim => {
        if (dim.score <= 4) {
          issues.push({
            type: 'error',
            message: `[${dim.name}] 得分 ${dim.score}/10 - ${dim.comment}`,
          });
        } else if (dim.score <= 6) {
          issues.push({
            type: 'warning',
            message: `[${dim.name}] 得分 ${dim.score}/10 - ${dim.comment}`,
          });
        }
      });

      aiResult.improvements.forEach(imp => {
        issues.push({ type: 'info', message: imp });
      });

      const dimensionScores = aiResult.dimensions.map(dim => ({
        id: dim.id,
        score: dim.score,
        reason: dim.comment,
      }));

      const record = {
        id: generateId(),
        bookId,
        chapterId: currentChapter?.id,
        stage: 'QUALITY_CHECK' as const,
        content: `AI 质检 - ${currentChapter?.title || '未知章节'} (${aiResult.overallScore}/80)`,
        issues,
        score: aiResult.overallScore,
        dimensionScores,
        createdAt: Date.now(),
      };

      await db.qaRecords.add(record);
      setSaveMessage('AI 质检结果已保存到历史记录');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('[QualityCheckPanel] 保存 AI 结果失败:', err);
      setSaveMessage('保存失败，请重试');
    }
  };

  // ── 辅助渲染函数 ──

  /** 获取颜色类名 */
  const getScoreColor = (score: number, max: number) => {
    const pct = (score / max) * 100;
    if (pct >= 80) return { text: 'text-green-500', bg: 'var(--color-success, #22c55e)' };
    if (pct >= 60) return { text: 'text-yellow-500', bg: 'var(--color-warning, #eab308)' };
    return { text: 'text-red-500', bg: 'var(--color-danger, #ef4444)' };
  };

  /** 获取总评等级 */
  const getVerdict = (score: number) => {
    if (score >= 70) return { text: '优秀', color: 'text-green-400' };
    if (score >= 60) return { text: '可交付', color: 'text-green-500' };
    if (score >= 40) return { text: '需改进', color: 'text-yellow-500' };
    return { text: '需重写', color: 'text-red-500' };
  };

  // ── 未选书时 ──
  if (!bookId) {
    return (
      <div className="flex items-center justify-center h-full text-vscode-text opacity-50">
        <div className="text-center">
          <ClipboardList size={48} className="mx-auto mb-2 opacity-50" />
          <p>请先选择一本书</p>
        </div>
      </div>
    );
  }

  const blockingIssues = reviewIssues?.filter(i => i.blocking) || [];
  const hasBlockingIssues = blockingIssues.length > 0;
  const [skipConfirmed, setSkipConfirmed] = useState(false);

  return (
    <div className="flex flex-col h-full bg-vscode-sidebar">
      {hasBlockingIssues && !skipConfirmed && (
        <div style={{
          padding: '10px 12px',
          backgroundColor: 'var(--color-danger-light, rgba(220, 38, 38, 0.15))',
          borderBottom: '2px solid var(--color-danger, rgba(220, 38, 38, 0.6))',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <Shield size={16} style={{ color: 'var(--color-danger, #dc2626)' }} />
            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-danger, #dc2626)' }}>
              审查硬闸门：{blockingIssues.length} 个阻断性问题
            </span>
          </div>
          <div style={{ maxHeight: '120px', overflowY: 'auto', marginBottom: '8px' }}>
            {blockingIssues.map((issue, idx) => (
              <div key={idx} style={{
                padding: '4px 8px',
                marginBottom: '4px',
                borderRadius: '3px',
                backgroundColor: 'var(--color-danger-light, rgba(220, 38, 38, 0.1))',
                fontSize: '11px',
                color: 'var(--color-vscode-text)',
              }}>
                <span style={{
                  display: 'inline-block',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  fontSize: '10px',
                  fontWeight: 600,
                  backgroundColor: issue.severity === 'critical' ? 'var(--color-danger, #dc2626)' : 'var(--color-warning, #d97706)',
                  color: 'white',
                  marginRight: '6px',
                }}>
                  {issue.severity === 'critical' ? '严重' : '高危'}
                </span>
                <span style={{ opacity: 0.7 }}>[{issue.category}]</span>
                {' '}
                {issue.description}
                {issue.fixHint && (
                  <div style={{ marginTop: '2px', opacity: 0.6, paddingLeft: '12px' }}>
                    💡 {issue.fixHint}
                  </div>
                )}
              </div>
            ))}
          </div>
          {reviewScore !== undefined && (
            <div style={{ fontSize: '11px', color: 'var(--color-vscode-text)', opacity: 0.7, marginBottom: '6px' }}>
              审查评分：{reviewScore}/100 {reviewPassed ? '✅ 通过' : '❌ 未通过'}
            </div>
          )}
          <div style={{ display: 'flex', gap: '6px' }}>
            {onSkipReviewBlock && (
              <button
                type="button"
                onClick={() => setSkipConfirmed(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  border: '1px solid var(--color-vscode-border)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  color: 'var(--color-vscode-text)',
                  opacity: 0.7,
                }}
              >
                <SkipForward size={12} />
                跳过闸门（确认）
              </button>
            )}
          </div>
        </div>
      )}

      {skipConfirmed && (
        <div style={{
          padding: '6px 12px',
          backgroundColor: 'var(--color-warning-light, rgba(217, 119, 6, 0.15))',
          borderBottom: '1px solid var(--color-warning, rgba(217, 119, 6, 0.4))',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <ShieldOff size={14} style={{ color: 'var(--color-warning, #d97706)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-warning, #d97706)' }}>
            闸门已跳过 — 存在未修复的阻断性问题
          </span>
        </div>
      )}

      {reviewIssues && reviewIssues.length > 0 && !hasBlockingIssues && (
        <div style={{
          padding: '6px 12px',
          backgroundColor: 'var(--color-success-light, rgba(22, 163, 74, 0.1))',
          borderBottom: '1px solid var(--color-success, rgba(22, 163, 74, 0.3))',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <CheckCircle size={14} style={{ color: 'var(--color-success, #16a34a)' }} />
          <span style={{ fontSize: '11px', color: 'var(--color-success, #16a34a)' }}>
            审查通过 — {reviewIssues.length} 个问题（无阻断性）
          </span>
        </div>
      )}

      <div className="p-3 border-b border-vscode-border space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-vscode-text">质量检查清单</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="icon-btn p-1"
              title="重置所有检查项"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {currentChapter && (
          <p className="text-xs text-vscode-text opacity-60 truncate">
            当前章节：{currentChapter.title}
          </p>
        )}

        <div>
          <div className="flex items-center justify-between text-xs text-vscode-text mb-1">
            <span>检查进度</span>
            <span>{passedItems}/{totalItems}</span>
          </div>
          <div className="w-full h-1.5 bg-vscode-border rounded">
            <div
              className="h-full bg-vscode-active rounded transition-all duration-300"
              style={{ width: `${totalItems > 0 ? (passedItems / totalItems) * 100 : 0}%` }}
            />
          </div>
        </div>

        {Object.keys(scores).length > 0 && (
          <div className="text-xs text-vscode-text">
            <span className="opacity-60">当前评分：</span>
            <span className={totalScore >= 60 ? 'text-green-500' : totalScore >= 40 ? 'text-yellow-500' : 'text-red-500'}>
              {totalScore}/80
            </span>
            {totalScore >= 60 && <span className="text-green-500 ml-1">✓ 可交付</span>}
            {totalScore >= 70 && <span className="text-green-400 ml-1">✓ 优秀</span>}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {QUALITY_CHECKLIST.map(section => {
          const { checked, total } = getSectionProgress(section);
          const isExpanded = expandedSections.has(section.id);
          const sectionDone = checked === total;

          return (
            <div key={section.id} className="border-b border-vscode-border last:border-b-0">
              <div className="w-full flex items-center gap-2 px-3 py-2 hover:bg-vscode-border/30 transition-colors">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="flex items-center gap-2 flex-1 text-left bg-transparent border-none outline-none cursor-pointer"
                >
                  {isExpanded ? <ChevronDown size={14} className="flex-shrink-0" /> : <ChevronRight size={14} className="flex-shrink-0" />}
                  <span className={`text-sm font-medium ${sectionDone ? 'text-green-500' : 'text-vscode-text'}`}>
                    {section.title}
                  </span>
                  <span className="text-xs text-vscode-text opacity-60">
                    {checked}/{total}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleSectionAll(section); }}
                  className="icon-btn p-0.5 flex-shrink-0"
                  title={section.items.every(i => checkedItems.has(i.id)) ? '取消全选' : '全选'}
                >
                  {section.items.every(i => checkedItems.has(i.id))
                    ? <CheckSquare size={14} className="text-green-500" />
                    : <Square size={14} />
                  }
                </button>
              </div>

              {isExpanded && (
                <div className="pb-2">
                  {section.items.map(item => {
                    const isChecked = checkedItems.has(item.id);
                    return (
                      <div key={item.id}>
                        <button
                          onClick={() => toggleItem(item.id)}
                          className="w-full flex items-start gap-2 px-6 py-1.5 hover:bg-vscode-border/20 transition-colors text-left"
                        >
                          {isChecked ? (
                            <CheckCircle size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Circle size={14} className="text-vscode-text opacity-40 flex-shrink-0 mt-0.5" />
                          )}
                          <span className={`text-xs ${isChecked ? 'text-green-500 line-through opacity-70' : 'text-vscode-text'}`}>
                            {item.text}
                          </span>
                        </button>
                        {item.subItems && item.subItems.length > 0 && (
                          <div className="px-10 pb-1">
                            {item.subItems.map((sub, idx) => (
                              <p key={idx} className="text-xs text-vscode-text opacity-40 leading-5">
                                ─ {sub}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}


        <div className="p-3 border-t border-vscode-border">
          <div className="flex items-center gap-1 mb-2">
            <Star size={14} className="text-yellow-500" />
            <span className="text-sm font-semibold text-vscode-text">手动评分</span>
          </div>
          <div className="space-y-3">
            {SCORE_DIMENSIONS.map(dim => (
              <div key={dim.id}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-vscode-text w-20 flex-shrink-0">{dim.label}</span>
                  <input
                    type="range"
                    min={0}
                    max={dim.maxScore}
                    value={scores[dim.id]?.score ?? 0}
                    onChange={e => handleScoreChange(dim.id, parseInt(e.target.value))}
                    className="flex-1 h-1.5"
                    style={{ accentColor: 'var(--color-vscode-active)' }}
                  />
                  <span className="text-xs text-vscode-text w-6 text-right">{scores[dim.id]?.score ?? 0}</span>
                </div>
                <input
                  type="text"
                  value={scores[dim.id]?.reason ?? ''}
                  onChange={e => handleReasonChange(dim.id, e.target.value)}
                  placeholder="评分理由（可选）"
                  className="w-full mt-1 px-2 py-1 text-xs bg-transparent border rounded-none outline-none"
                  style={{
                    color: 'var(--color-vscode-text)',
                    borderColor: 'var(--color-vscode-border)',
                    backgroundColor: 'var(--color-vscode-bg)',
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-vscode-border">
            <span className="text-xs font-semibold text-vscode-text">总分 /80</span>
            <span className={`text-sm font-bold ${totalScore >= 60 ? 'text-green-500' : totalScore >= 40 ? 'text-yellow-500' : 'text-red-500'}`}>
              {totalScore}
            </span>
          </div>
        </div>
      </div>

      <div className="p-3 border-t border-vscode-border space-y-2">
        <button
          onClick={handleAIQualityCheck}
          disabled={isAnalyzing || !currentChapter}
          className="w-full py-2 bg-gradient-to-r from-purple-400 to-violet-400 hover:from-purple-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded flex items-center justify-center gap-2 text-sm transition-all"
        >
          {isAnalyzing ? (
            <>
              <Loader size={14} className="animate-spin" />
              AI 正在分析中...
            </>
          ) : (
            <>
              <Sparkles size={14} />
              AI 智能质检
            </>
          )}
        </button>

        {isAnalyzing && (
          <div className="flex items-center justify-center gap-2 py-1">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-vscode-text opacity-60">
              正在将章节内容提交至 AI 进行深度分析，预计需要 10-30 秒...
            </span>
          </div>
        )}

        {analysisError && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-500 leading-relaxed whitespace-pre-wrap">
            {analysisError}
          </div>
        )}

        {/* 手动保存按钮 */}
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full py-2 bg-vscode-active hover:bg-vscode-active/80 disabled:opacity-50 text-white rounded flex items-center justify-center gap-2 text-sm transition-colors"
        >
          <Save size={14} />
          {isSaving ? '保存中...' : '保存手动质检'}
        </button>
        {saveMessage && (
          <p className={`text-xs mt-1 text-center ${saveMessage.includes('失败') ? 'text-red-500' : 'text-green-500'}`}>
            {saveMessage}
          </p>
        )}
      </div>

      {showResultModal && (
        <div className="modal-overlay" onClick={() => setShowResultModal(false)}>
          <div className="modal-content w-[520px] max-h-[80vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-vscode-border">
              <h2 className="text-lg font-semibold text-vscode-text">手动质检结果</h2>
              <button onClick={() => setShowResultModal(false)} className="icon-btn">✕</button>
            </div>

            <div className="py-4 space-y-3">
              {SCORE_DIMENSIONS.map(dim => {
                const dimScore = scores[dim.id];
                const s = dimScore?.score ?? 0;
                const reason = dimScore?.reason ?? '';
                const pct = (s / dim.maxScore) * 100;
                return (
                  <div key={dim.id} className="pb-3 border-b border-vscode-border last:border-b-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-vscode-text">{dim.label}</span>
                      <span className={`text-sm font-bold ${pct >= 80 ? 'text-green-500' : pct >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>
                        {s} / {dim.maxScore}
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-vscode-border mb-1.5">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: pct >= 80 ? 'var(--color-success, #22c55e)' : pct >= 60 ? 'var(--color-warning, #eab308)' : 'var(--color-danger, #ef4444)',
                        }}
                      />
                    </div>
                    {reason && (
                      <p className="text-xs text-vscode-text opacity-70 leading-relaxed">{reason}</p>
                    )}
                    {!reason && (
                      <p className="text-xs text-vscode-text opacity-30 italic">未填写理由</p>
                    )}
                  </div>
                );
              })}

              <div className="pt-2 border-t border-vscode-border flex items-center justify-between">
                <span className="text-base font-semibold text-vscode-text">
                  总分 <span className={totalScore >= 60 ? 'text-green-500' : totalScore >= 40 ? 'text-yellow-500' : 'text-red-500'}>{totalScore}</span> / 80
                </span>
                <span className="text-xs">
                  {totalScore >= 70 && <span className="text-green-400">优秀</span>}
                  {totalScore >= 60 && totalScore < 70 && <span className="text-green-500">可交付</span>}
                  {totalScore >= 40 && totalScore < 60 && <span className="text-yellow-500">需改进</span>}
                  {totalScore < 40 && <span className="text-red-500">需重写</span>}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAIResultModal && aiResult && (
        <div className="modal-overlay" onClick={() => setShowAIResultModal(false)}>
          <div
            className="modal-content w-[600px] max-h-[85vh] overflow-auto p-0"
            onClick={e => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 p-6 pb-4 border-b border-vscode-border bg-vscode-sidebar">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot size={18} className="text-purple-500" />
                  <h2 className="text-lg font-semibold text-vscode-text">AI 智能质检报告</h2>
                </div>
                <button onClick={() => setShowAIResultModal(false)} className="icon-btn text-lg">✕</button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={`text-3xl font-bold ${getScoreColor(aiResult.overallScore, 80).text}`}>
                      {aiResult.overallScore}
                    </span>
                    <span className="text-lg text-vscode-text opacity-50">/ 80</span>
                  </div>
                  <span className={`text-sm font-medium ${getVerdict(aiResult.overallScore).color}`}>
                    {getVerdict(aiResult.overallScore).text}
                  </span>
                </div>
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--color-vscode-border)" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke={getScoreColor(aiResult.overallScore, 80).bg}
                      strokeWidth="3"
                      strokeDasharray={`${(aiResult.overallScore / 80) * 97.4} 97.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-vscode-text">
                    {Math.round((aiResult.overallScore / 80) * 100)}%
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 pt-4 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-vscode-text mb-3 flex items-center gap-1.5">
                  <Star size={14} className="text-yellow-500" />
                  各维度评分
                </h3>
                <div className="space-y-3">
                  {aiResult.dimensions.map(dim => {
                    const pct = (dim.score / 10) * 100;
                    const color = getScoreColor(dim.score, 10);
                    return (
                      <div key={dim.id} className="pb-3 border-b border-vscode-border last:border-b-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-vscode-text">{dim.name}</span>
                          <span className={`text-sm font-bold ${color.text}`}>
                            {dim.score} / 10
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-vscode-border mb-1.5 rounded overflow-hidden">
                          <div
                            className="h-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: color.bg }}
                          />
                        </div>
                        <p className="text-xs text-vscode-text opacity-70 leading-relaxed">{dim.comment}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {aiResult.summary && (
                <div>
                  <h3 className="text-sm font-semibold text-vscode-text mb-2">总体评价</h3>
                  <p className="text-sm text-vscode-text opacity-80 leading-relaxed bg-vscode-bg p-3 rounded border border-vscode-border">
                    {aiResult.summary}
                  </p>
                </div>
              )}

              {aiResult.strengths.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-green-500 mb-2 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-green-500" />
                    主要优点
                  </h3>
                  <ul className="space-y-1.5">
                    {aiResult.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-vscode-text leading-relaxed">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">•</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResult.improvements.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-yellow-500 mb-2 flex items-center gap-1.5">
                    <Wrench size={14} className="text-yellow-500" />
                    需要改进
                  </h3>
                  <ul className="space-y-1.5">
                    {aiResult.improvements.map((imp, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-vscode-text leading-relaxed">
                        <span className="text-yellow-500 mt-0.5 flex-shrink-0">•</span>
                        <span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {aiResult.suggestions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-vscode-text mb-2 flex items-center gap-1.5">
                    <Lightbulb size={14} className="text-vscode-text" />
                    修改建议
                  </h3>
                  <ul className="space-y-1.5">
                    {aiResult.suggestions.map((sg, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-vscode-text leading-relaxed">
                        <span className="text-vscode-text mt-0.5 flex-shrink-0">→</span>
                        <span>{sg}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 p-4 border-t border-vscode-border bg-vscode-sidebar flex gap-2">
              <button
                onClick={handleSaveAIResult}
                className="flex-1 py-2 bg-vscode-active hover:bg-vscode-active/80 text-white rounded flex items-center justify-center gap-2 text-sm transition-colors"
              >
                <Save size={14} />
                保存到历史记录
              </button>
              <button
                onClick={() => setShowAIResultModal(false)}
                className="flex-1 py-2 bg-vscode-border hover:bg-vscode-border/60 text-vscode-text rounded text-sm transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QualityCheckPanel;
