import { init } from 'pinflow';

// The install-snippet tabs double as pinflow "frames": `routeKey` scopes pins
// to the active tab (like a wizard or phased single-URL experience), and
// `refreshRoute()` re-evaluates visibility on every switch.
let activeTab = 'script';

const FRAME_LABELS: Record<string, string> = {
  script: 'Install — Script tag',
  npm: 'Install — npm',
  react: 'Install — React',
};

// Seeded via `source` (the read half of PROTOCOL.md) so the resolution UI has
// something to show on first visit: a ✓ done pin, a struck declined pin, and
// an open pin scoped to the npm tab.
const SEEDED_AT = '2026-07-01T09:00:00.000Z';

interface SeedOverrides {
  id: string;
  route: string;
  text: string;
  anchor: unknown;
  status?: string;
  resolution?: string;
}

function seedComment(overrides: SeedOverrides): unknown {
  return {
    createdAt: SEEDED_AT,
    updatedAt: SEEDED_AT,
    fullUrl: 'https://pinflow.dev/',
    modality: 'text',
    ...overrides,
  };
}

const seededComments = [
  seedComment({
    id: 'cmt_demodone01',
    route: 'script',
    text: "The Upgrade button doesn't stand out enough against the featured card.",
    status: 'done',
    resolution: 'Bumped the CTA contrast — shipped.',
    anchor: {
      selectors: {
        testid: 'tier-pro',
        id: null,
        css: '[data-testid="tier-pro"]',
        xpath: '',
      },
      textFingerprint: 'Pro',
      positionPercent: { x: 50, y: 90 },
      viewport: { width: 1280, height: 800 },
      context: { name: 'Pro', role: 'div', heading: 'Acme SaaS' },
    },
  }),
  seedComment({
    id: 'cmt_demodecl01',
    route: 'script',
    text: "Show a real price for Enterprise instead of 'Custom'.",
    status: 'declined',
    resolution: 'Intentional — Enterprise pricing stays quote-based.',
    anchor: {
      selectors: {
        testid: 'tier-enterprise',
        id: null,
        css: '[data-testid="tier-enterprise"]',
        xpath: '',
      },
      textFingerprint: 'Enterprise',
      positionPercent: { x: 50, y: 22 },
      viewport: { width: 1280, height: 800 },
      context: { name: 'Enterprise', role: 'div', heading: 'Acme SaaS' },
    },
  }),
  seedComment({
    id: 'cmt_demonpm001',
    route: 'npm', // only visible on the npm tab — frame scoping in action
    text: 'Add a pnpm variant of this snippet.',
    anchor: {
      selectors: {
        testid: null,
        id: null,
        css: 'pre[data-panel="npm"]',
        xpath: '',
      },
      textFingerprint: 'npm install pinflow',
      positionPercent: { x: 80, y: 50 },
      viewport: { width: 1280, height: 800 },
      context: { name: 'npm install pinflow', role: 'pre' },
    },
  }),
];

const handle = init({
  project: 'pinflow-dev-demo',
  theme: {
    // Matches the demo page's own palette (style.css).
    accent: '#2563eb',
    accentContrast: '#ffffff',
    surface: '#ffffff',
    text: '#0f172a',
    textMuted: '#64748b',
    radius: '10px',
  },
  routeKey: () => activeTab,
  describeRoute: (key) => FRAME_LABELS[key] ?? '',
  submitTo: { email: 'builder@example.com', subject: 'Feedback: pinflow demo' },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  source: () => Promise.resolve(seededComments as any),
});

// Tab switcher for install snippets — each tab is a pinflow frame.
document.querySelectorAll<HTMLButtonElement>('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    const target = tab.dataset['tab'];
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll<HTMLPreElement>('[data-panel]').forEach((panel) => {
      panel.style.display = panel.dataset['panel'] === target ? 'block' : 'none';
    });
    if (target) {
      activeTab = target;
      handle.refreshRoute();
    }
  });
});
