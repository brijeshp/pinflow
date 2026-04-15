export type Mode = 'reviewer' | 'builder';
export type Theme = 'light' | 'dark' | 'auto';
export type Position = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface SelectorCandidates {
  testid: string | null;
  id: string | null;
  css: string;
  xpath: string;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface PositionPercent {
  x: number;
  y: number;
}

export interface Anchor {
  selectors: SelectorCandidates;
  textFingerprint: string;
  positionPercent: PositionPercent;
  viewport: Viewport;
}

export interface Comment {
  id: string;
  createdAt: string;
  updatedAt: string;
  route: string;
  fullUrl: string;
  text: string;
  anchor: Anchor;
}

export interface ReviewerStore {
  reviewer: string;
  project: string;
  createdAt: string;
  comments: Comment[];
}

export interface PinflowConfig {
  project: string;
  reviewer?: string;
  mode?: Mode;
  onSubmit?: (payload: ReviewerStore) => void | Promise<void>;
  theme?: Theme;
  position?: Position;
  hidden?: boolean;
}
