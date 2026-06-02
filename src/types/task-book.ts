import type { EntitySnapshot, HookEntry, TimelineEntry } from './fact-extraction';

export interface WritingTaskBook {
  meta: {
    bookId: string;
    chapterIndex: number;
    chapterTitle: string;
    generatedAt: number;
  };

  locked: {
    genre: string;
    coreTone: string;
    worldRules: string[];
    characterConstraints: Array<{
      name: string;
      personality: string;
      currentGoal: string;
    }>;
  };

  chapterMission: {
    plotPoints: string[];
    emotionalArc: string;
    hookRequirement: string;
    wordCountTarget: number;
  };

  stateContext?: {
    activeEntities: EntitySnapshot[];
    openHooks: HookEntry[];
    recentTimeline: TimelineEntry[];
    previousChapterSummary: string;
  };

  warnings?: {
    antiPatterns: string[];
    blockingRules: string[];
    genreRisks: string[];
  };

  style: {
    writingStyle: string;
    customRules: string[];
    povCharacter?: string;
  };
}

export interface TaskBookSources {
  chapterTitle: string;
  chapterOutline?: string;
  plotPoints?: string[];
  emotionalArc?: string;
  hookRequirement?: string;
  wordCountTarget?: number;
  step3Config?: {
    writingStyle: string;
    storyLength: string;
    customRules: string;
  };
  reviewContract?: {
    mustCheck: string[];
    blockingRules: string[];
    genreRisks: string[];
    antiPatterns: string[];
  };
}
