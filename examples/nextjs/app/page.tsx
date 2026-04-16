export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 40 }}>
      <h1>Next.js Prototype</h1>
      <p style={{ color: '#64748b', marginTop: 8 }}>
        Pinflow is loaded via a client component in the root layout. Click anywhere to annotate.
      </p>
      <button
        data-testid="hero-cta"
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
    </main>
  );
}
