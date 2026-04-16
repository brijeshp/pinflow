import { Annotator } from 'pinflow/react';

export function App() {
  return (
    <>
      <Annotator project="react-vite-demo" />
      <div style={{ fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto', padding: 40 }}>
        <h1>React + Vite Prototype</h1>
        <p style={{ color: '#64748b', marginTop: 8 }}>
          Pinflow is loaded. Click anywhere to leave feedback.
        </p>
        <button
          data-testid="primary-cta"
          style={{
            marginTop: 24,
            padding: '12px 24px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            cursor: 'pointer',
          }}
        >
          Get started
        </button>

        <section style={{ marginTop: 48 }}>
          <h2>How this works</h2>
          <p style={{ lineHeight: 1.7, color: '#475569', marginTop: 8 }}>
            The <code>&lt;Annotator /&gt;</code> component is imported from{' '}
            <code>pinflow/react</code> and rendered once at the app root. That is the entire
            integration.
          </p>
        </section>
      </div>
    </>
  );
}
