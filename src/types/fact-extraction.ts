export interface EntitySnapshot {
  name: string;
  type: 'character' | 'location' | 'item' | 'faction';
  state: Record<string, string>;
  firstAppearance: number;
  lastSeen: number;
}

export interface StateChange {
  entity: string;
  attribute: string;
  from?: string;
  to: string;
  reason?: string;
}

export interface NarrativeEvent {
  description: string;
  participants: string[];
  location?: string;
  significance: 'major' | 'minor';
}

export interface TimelineEntry {
  chapterIndex: number;
  timeMarker?: string;
  description: string;
}

export interface HookEntry {
  description: string;
  type: 'mystery' | 'crisis' | 'promise' | 'revelation';
  status: 'open' | 'resolved';
  raisedInChapter: number;
  resolvedInChapter?: number;
}

export interface ChapterFacts {
  chapterIndex: number;
  entities: EntitySnapshot[];
  stateChanges: StateChange[];
  events: NarrativeEvent[];
  timeline: TimelineEntry[];
  hooks: HookEntry[];
  summary: string;
  extractedAt: number;
  isFailed?: boolean;
  wasTruncated?: boolean;
}

export interface ChapterStateCommit {
  id: string;
  bookId: string;
  chapterIndex: number;
  entityIndex: Record<string, EntitySnapshot>;
  openHooks: HookEntry[];
  timeline: TimelineEntry[];
  chapterSummary: string;
  committedAt: number;
}
