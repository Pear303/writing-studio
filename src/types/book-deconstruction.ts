import type { ChapterFacts, HookEntry } from './fact-extraction';

// ============ Phase 1: 全书骨架 ============

export interface BookSkeleton {
  meta: {
    title: string;
    author?: string;
    genre: string;
    subGenres: string[];
    coreTone: string;
    targetAudience?: string;
    estimatedWordCount: number;
  };

  coreConflict: string;
  themes: string[];

  chapterSkeletons: ChapterSkeleton[];

  suspenseLines: SuspenseLine[];

  structureType: string;
  structureDescription: string;
}

export interface ChapterSkeleton {
  index: number;
  title: string;
  oneLineSummary: string;
  estimatedWordCount: number;
  role: ChapterRole;
  majorCharacters: string[];
  keyEvent: string;
  chapterType: 'plot_advancing' | 'character_deepening' | 'atmosphere' | 'transition' | 'climax';
}

export type ChapterRole =
  | 'setup'
  | 'inciting_incident'
  | 'rising_action'
  | 'midpoint'
  | 'crisis'
  | 'climax'
  | 'resolution'
  | 'falling_action'
  | 'foreshadowing'
  | 'revelation'
  | 'breathing'
  | 'transition';

export interface SuspenseLine {
  id: string;
  description: string;
  type: 'main' | 'sub';
  hookType: HookEntry['type'];
  raisedInChapter: number;
  resolvedInChapter?: number;
  relatedEntities: string[];
}

// ============ Phase 3: 跨章关联分析 ============

export interface CrossChapterAnalysis {
  characterArcs: CharacterArc[];
  suspenseTracking: SuspenseLineTracking[];
  plotLines: PlotLine[];
  foreshadowingMap: ForeshadowingPair[];
  pacingCurve: PacingPoint[];
  relationshipNetwork: RelationshipNode[];
  worldRules: string[];
}

export interface CharacterArc {
  characterName: string;
  arcType: 'growth' | 'fall' | 'flat' | 'transformation' | 'corruption';
  startState: string;
  endState: string;
  keyTurningPoints: Array<{
    chapterIndex: number;
    description: string;
  }>;
  stateEvolution: string;
}

export interface SuspenseLineTracking {
  suspenseId: string;
  description: string;
  type: 'main' | 'sub';
  chaptersInvolved: number[];
  status: 'resolved' | 'open' | 'abandoned';
  resolutionQuality?: 'satisfying' | 'rushed' | 'unresolved' | 'deus_ex_machina';
}

export interface PlotLine {
  name: string;
  type: 'main' | 'sub_a' | 'sub_b' | 'background';
  chapters: number[];
  description: string;
  interweaveWith: string[];
}

export interface ForeshadowingPair {
  planted: {
    chapterIndex: number;
    description: string;
  };
  harvested?: {
    chapterIndex: number;
    description: string;
  };
  distance: number;
  quality: 'tight' | 'good' | 'loose' | 'orphan';
}

export interface PacingPoint {
  chapterIndex: number;
  tension: number;
  pace: 'slow' | 'moderate' | 'fast' | 'explosive';
  note: string;
}

export interface RelationshipNode {
  from: string;
  to: string;
  type: 'ally' | 'rival' | 'mentor' | 'lover' | 'family' | 'enemy' | 'ambiguous';
  evolution: Array<{
    chapterIndex: number;
    change: string;
  }>;
}

// ============ 完整拆书结果 ============

export type DeconstructionPhase = 1 | 2 | 3;
export type DeconstructionStatus = 'skeleton' | 'extracting' | 'analyzing' | 'completed' | 'failed';

export interface BookDeconstructionResult {
  id: string;
  bookId: string;
  sourceFileName: string;
  sourceFileSize: number;
  totalChapters: number;

  skeleton: BookSkeleton | null;
  chapterFacts: ChapterFacts[];
  crossAnalysis: CrossChapterAnalysis | null;

  status: DeconstructionStatus;
  currentPhase: DeconstructionPhase;
  currentChapterIndex: number;
  error?: string;

  createdAt: number;
  updatedAt: number;
}
