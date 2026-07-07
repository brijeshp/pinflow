export type Mode = 'reviewer' | 'builder';

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
  /**
   * Best-effort human context captured at pin time: accessible name, role,
   * and the nearest preceding/ancestor heading text (≤80 chars each) — lets
   * exports say "the 'Continue' button under 'Next section'". Additive in v3.
   */
  context?: { name?: string; role?: string; heading?: string };
}

export type Modality = 'text' | 'voice';

export interface VoiceMeta {
  durationMs: number;
  /** 0..1, clamped on read; the provider value is treated as untrusted. */
  confidence?: number;
  /** true when the reviewer hand-corrected the transcript. */
  edited?: boolean;
  /**
   * true when the salvaged text includes un-finalized interim results
   * (session torn down mid-utterance, e.g. network dropped before finalize).
   */
  interim?: boolean;
  /** provenance, e.g. `deepgram:nova-3` — matters for the paid compiler + quality debugging. */
  engine?: string;
}

export interface Comment {
  id: string;
  createdAt: string;
  updatedAt: string;
  route: string;
  fullUrl: string;
  text: string;
  anchor: Anchor;
  /** Required. v1 stores are migrated to `'text'`; the default is applied at creation too. */
  modality: Modality;
  /** Present iff `modality === 'voice'`. */
  voice?: VoiceMeta;
  /**
   * Lifecycle disposition, set by the TEAM via the host — never the reviewer.
   * Server-owned; delivered through hydration. Absent = open.
   */
  status?: 'open' | 'done' | 'declined';
  /** Team's one-line resolution note (≤500 chars). Server-owned, like `status`. */
  resolution?: string;
}

export interface ReviewerStore {
  reviewer: string;
  project: string;
  createdAt: string;
  comments: Comment[];
}

/** How the reviewer activates the annotation layer. */
export interface ActivationConfig {
  /**
   * `toggle` (default) = the visible v1 control button.
   * `stealth` = no chrome; long-press (touch) or Alt+click (desktop) only.
   * `both` = control button AND the stealth gesture.
   */
  mode?: 'toggle' | 'stealth' | 'both';
}

/**
 * Opt-in voice annotation. Presence enables voice; absence keeps pure v1 behavior
 * with no network. The library never holds a Deepgram API key — see `tokenEndpoint`.
 *
 * Credential resolution order: `getToken` → `tokenEndpoint` → `devOnlyToken`.
 */
export interface VoiceConfig {
  /**
   * Escape hatch: mint the short-lived Deepgram grant-token JWT yourself
   * (custom auth, credentials, project scoping). Takes precedence over
   * `tokenEndpoint`. A rejection degrades to the text fallback like any other
   * token failure.
   */
  getToken?: () => Promise<string>;
  /** Preferred: endpoint that mints a short-lived grant-token JWT (`GrantTokenResponse`). */
  tokenEndpoint?: string;
  /**
   * LOCAL DEV ONLY. An opaque, short-lived Deepgram grant-token JWT — NEVER a raw API key.
   * Exposed to every visitor; pinflow throws at init if this is set on a non-local origin.
   */
  devOnlyToken?: string;
}

/** Wire shape returned by a token-mint endpoint (snake_case mirrors Deepgram). */
export interface GrantTokenResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Design tokens applied as CSS custom properties (`--pf-*`) on the widget's
 * shadow host. All optional; omitted tokens keep the stock look.
 */
export interface PinflowTheme {
  fontFamily?: string;
  /** Primary action color: buttons, pins, active states. */
  accent?: string;
  /** Text/icon color on accent surfaces. */
  accentContrast?: string;
  /** Panel/popup background. */
  surface?: string;
  /** Primary text color inside panels/popups. */
  text?: string;
  /** Secondary/hint text color. */
  textMuted?: string;
  /** Destructive actions and the recording indicator. */
  danger?: string;
  /** Corner radius for panels and inputs, e.g. `'14px'`. */
  radius?: string;
  /** Elevation shadow for panels and inputs. */
  shadow?: string;
}

export interface PinflowConfig {
  project: string;
  reviewer?: string;
  mode?: Mode;
  onSubmit?: (payload: ReviewerStore) => void | Promise<void>;
  /**
   * Fired after each persisted comment mutation with the fresh store and the
   * change. The host owns debouncing/batching/network; exceptions are caught
   * and logged. Builder-mode "Clear all" does not emit.
   */
  onChange?: (
    store: ReviewerStore,
    change: { type: 'add' | 'update' | 'delete'; comment: Comment },
  ) => void;
  /** Visual design tokens; applied once at init. See {@link PinflowTheme}. */
  theme?: PinflowTheme;
  /**
   * Logical screen key used to anchor, show, and group comments. Defaults to
   * the URL (`pathname+search`) — correct for route-per-screen apps. Hosts
   * whose screens change WITHOUT a URL change (wizards, framed/phased
   * experiences) return their own frame id here, and call
   * `handle.refreshRoute()` whenever it changes so pins from other frames
   * hide immediately. The value is stored on each comment and becomes the
   * per-screen grouping in exports/ingestion.
   */
  routeKey?: () => string;
  /**
   * Optional friendly label for a route/frame key, used in export headings
   * (`## Section 2 — Employment details` with the stable key in backticks
   * beneath). Return an empty string for keys without a label — those keep
   * the plain `## Route: <key>` heading. Pairs naturally with `routeKey`.
   */
  describeRoute?: (key: string) => string;
  /** Activation strategy. Defaults to `{ mode: 'toggle' }` for v1 back-compat. */
  activation?: ActivationConfig;
  /** Opt-in voice annotation config. Omit for pure pin/text behavior. */
  voice?: VoiceConfig;
}
