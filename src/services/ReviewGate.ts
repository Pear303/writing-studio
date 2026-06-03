import type { ReviewIssue, ReviewSeverity, ReviewCategory, AntiPattern, ReviewContract } from '../types';
import { db } from '../db';
import { debugLogger } from './DebugLogger';

interface RawReviewResult {
  issues?: Array<{
    severity: string;
    category: string;
    location: string;
    description: string;
    evidence: string;
    fixHint: string;
  }>;
  overallScore?: number;
  summary?: string;
}

export interface ReviewGateResult {
  issues: ReviewIssue[];
  blockingIssues: ReviewIssue[];
  score: number;
  passed: boolean;
  summary: string;
  newAntiPatterns: AntiPattern[];
}

const DEFAULT_CONTRACT: ReviewContract = {
  mustCheck: ['continuity', 'character', 'setting', 'timeline'],
  blockingRules: [
    'critical级别的连贯性问题必须修复',
    'critical级别的角色不一致必须修复',
    'high级别的设定矛盾必须修复',
  ],
  genreRisks: [],
  antiPatterns: [],
  thresholds: {
    blockingCount: 0,
    minScore: 60,
  },
};

export class ReviewGate {
  async review(
    bookId: string,
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
    llmCall: (prompt: string) => Promise<string>,
    contract?: Partial<ReviewContract>,
  ): Promise<ReviewGateResult> {
    const fullContract = { ...DEFAULT_CONTRACT, ...contract };
    const existingAntiPatterns = await this.loadAntiPatterns(bookId);
    const prevState = await this.loadStateCommit(bookId, chapterIndex - 1);

    const prompt = this.buildReviewPrompt(
      chapterIndex,
      chapterTitle,
      chapterContent,
      prevState,
      existingAntiPatterns,
      fullContract,
    );

    // Debug: 记录审查闸门调用
    debugLogger.log({
      source: 'service',
      category: 'review-gate',
      direction: `ReviewGate.review → book:${bookId} ch:${chapterIndex}`,
      userMessage: prompt,
      metadata: {
        bookId,
        chapterIndex,
        chapterTitle,
        contentLength: chapterContent.length,
        hasPrevState: !!prevState,
        antiPatternCount: existingAntiPatterns.length,
        mustCheck: fullContract.mustCheck,
      },
    });

    const rawResult = await llmCall(prompt);
    const parsed = this.parseRawResult(rawResult);

    const issues = this.normalizeIssues(parsed);
    const blockingIssues = issues.filter(i => i.blocking);
    const score = parsed.overallScore ?? this.calculateScore(issues);
    const newAntiPatterns = this.detectAntiPatterns(issues, bookId);

    const passed = blockingIssues.length === 0 && score >= fullContract.thresholds.minScore;

    const result: ReviewGateResult = {
      issues,
      blockingIssues,
      score,
      passed,
      summary: parsed.summary || '',
      newAntiPatterns,
    };

    // Debug: 记录审查闸门结果
    debugLogger.log({
      source: 'service',
      category: 'review-gate',
      direction: `ReviewGate.review ← book:${bookId} ch:${chapterIndex}`,
      response: rawResult,
      responseLength: rawResult.length,
      metadata: {
        bookId,
        chapterIndex,
        score,
        passed,
        issueCount: issues.length,
        blockingCount: blockingIssues.length,
        newAntiPatternCount: newAntiPatterns.length,
      },
    });

    return result;
  }

  async saveAntiPatterns(patterns: AntiPattern[]): Promise<void> {
    for (const pattern of patterns) {
      const existing = await db.antiPatterns
        .where({ bookId: pattern.bookId, text: pattern.text })
        .first();

      if (existing) {
        await db.antiPatterns.update(existing.id, {
          frequency: existing.frequency + 1,
          lastSeen: pattern.lastSeen,
        });
      } else {
        await db.antiPatterns.add(pattern);
      }
    }
  }

  async loadAntiPatterns(bookId: string): Promise<AntiPattern[]> {
    return db.antiPatterns.where({ bookId }).toArray();
  }

  private async loadStateCommit(bookId: string, chapterIndex: number) {
    if (chapterIndex < 0) return null;
    return db.chapterStateCommits.get(`${bookId}_ch${chapterIndex}`);
  }

  private buildReviewPrompt(
    chapterIndex: number,
    chapterTitle: string,
    chapterContent: string,
    prevState: any,
    antiPatterns: AntiPattern[],
    contract: ReviewContract,
  ): string {
    const sections: string[] = [];

    sections.push(`你是一个专业的小说审稿编辑，负责对章节进行严格的质量审查。`);

    sections.push(`\n## 审查章节`);
    sections.push(`第${chapterIndex + 1}章：${chapterTitle}`);
    sections.push(`\n${chapterContent.slice(0, 8000)}`);

    if (prevState?.chapterSummary) {
      sections.push(`\n## 前章概要`);
      sections.push(prevState.chapterSummary);
    }

    if (prevState?.entityIndex) {
      const entityNames = Object.keys(prevState.entityIndex);
      if (entityNames.length > 0) {
        sections.push(`\n## 已知实体状态`);
        for (const name of entityNames.slice(0, 15)) {
          const entity = prevState.entityIndex[name];
          const stateEntries = Object.entries(entity.state)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          sections.push(`- ${name}(${entity.type}): ${stateEntries || '无特殊状态'}`);
        }
      }
    }

    if (antiPatterns.length > 0) {
      sections.push(`\n## 已知反模式（必须重点检查）`);
      for (const ap of antiPatterns.slice(0, 10)) {
        sections.push(`- [${ap.category}] ${ap.text} (出现${ap.frequency}次)`);
      }
    }

    sections.push(`\n## 审查重点`);
    for (const cat of contract.mustCheck) {
      const catNames: Record<string, string> = {
        continuity: '连贯性（前后文是否一致）',
        character: '角色一致性（行为是否符合性格）',
        setting: '设定一致性（世界观规则是否矛盾）',
        timeline: '时间线（事件顺序是否合理）',
        ai_flavor: 'AI味（是否有机械化的表达）',
        logic: '逻辑性（因果关系是否成立）',
        pacing: '节奏（是否拖沓或仓促）',
      };
      sections.push(`- ${catNames[cat] || cat}`);
    }

    sections.push(`\n## 阻断规则`);
    for (const rule of contract.blockingRules) {
      sections.push(`- ${rule}`);
    }

    sections.push(`\n## 输出要求`);
    sections.push(`严格按照以下 JSON 格式输出，不要输出任何其他内容：`);
    sections.push(`\n\`\`\`json`);
    sections.push(JSON.stringify({
      issues: [
        {
          severity: 'critical|high|medium|low',
          category: 'continuity|setting|character|timeline|ai_flavor|logic|pacing|other',
          location: '问题位置（引用原文片段）',
          description: '问题描述',
          evidence: '证据',
          fixHint: '修改建议',
        },
      ],
      overallScore: 75,
      summary: '审查总结',
    }, null, 2));
    sections.push(`\n\`\`\``);
    sections.push(`\n严重程度标准：critical=阻断性错误(必须修复), high=严重问题(强烈建议修复), medium=一般问题, low=轻微建议`);

    return sections.join('\n');
  }

  private parseRawResult(raw: string): RawReviewResult {
    const jsonMatch = raw.match(/```json\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1] : raw;

    try {
      return JSON.parse(jsonStr.trim());
    } catch {
      const braceMatch = raw.match(/\{[\s\S]*\}/);
      if (braceMatch) {
        try {
          return JSON.parse(braceMatch[0]);
        } catch {
          return {};
        }
      }
      return {};
    }
  }

  private normalizeIssues(parsed: RawReviewResult): ReviewIssue[] {
    if (!parsed.issues?.length) return [];

    const validSeverities: ReviewSeverity[] = ['critical', 'high', 'medium', 'low'];
    const validCategories: ReviewCategory[] = ['continuity', 'setting', 'character', 'timeline', 'ai_flavor', 'logic', 'pacing', 'other'];

    return parsed.issues
      .filter(i => i.severity && i.category && i.description)
      .map(i => ({
        severity: validSeverities.includes(i.severity as ReviewSeverity) ? (i.severity as ReviewSeverity) : 'medium',
        category: validCategories.includes(i.category as ReviewCategory) ? (i.category as ReviewCategory) : 'other',
        location: i.location || '',
        description: i.description,
        evidence: i.evidence || '',
        fixHint: i.fixHint || '',
        blocking: i.severity === 'critical' || i.severity === 'high',
      }));
  }

  private calculateScore(issues: ReviewIssue[]): number {
    let score = 100;
    for (const issue of issues) {
      switch (issue.severity) {
        case 'critical': score -= 20; break;
        case 'high': score -= 10; break;
        case 'medium': score -= 5; break;
        case 'low': score -= 2; break;
      }
    }
    return Math.max(0, score);
  }

  private detectAntiPatterns(issues: ReviewIssue[], bookId: string): AntiPattern[] {
    const recurringPatterns = new Map<string, { category: ReviewCategory; count: number }>();

    for (const issue of issues) {
      const key = `${issue.category}:${issue.description.slice(0, 50)}`;
      const existing = recurringPatterns.get(key);
      if (existing) {
        existing.count++;
      } else {
        recurringPatterns.set(key, { category: issue.category, count: 1 });
      }
    }

    const patterns: AntiPattern[] = [];
    const now = Date.now();

    for (const [key, val] of recurringPatterns) {
      if (val.count >= 1 && (key.includes('ai_flavor') || key.includes('logic'))) {
        patterns.push({
          id: `ap_${bookId}_${now}_${patterns.length}`,
          bookId,
          text: key.split(':').slice(1).join(':'),
          source: 'review',
          category: val.category,
          frequency: val.count,
          firstSeen: now,
          lastSeen: now,
        });
      }
    }

    return patterns;
  }
}

export const reviewGate = new ReviewGate();
