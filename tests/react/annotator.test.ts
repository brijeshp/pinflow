import { afterEach, describe, expect, it, vi } from 'vitest';

const initMock = vi.fn().mockReturnValue({ destroy: vi.fn() });
const destroyMock = vi.fn();

vi.mock('../../src/core/index', () => ({
  init: (...args: unknown[]) => {
    const handle = initMock(...args);
    handle.destroy = destroyMock;
    return handle;
  },
}));

describe('React <Annotator />', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('calls init on mount and destroy on unmount', async () => {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { Annotator } = await import('../../src/react/index');
    const { act } = await import('react');

    const root = createRoot(document.createElement('div'));
    await act(async () => {
      root.render(React.createElement(Annotator, { project: 'test-proj' }));
    });
    await vi.dynamicImportSettled();
    await act(async () => {});
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ project: 'test-proj' }));

    await act(async () => {
      root.unmount();
    });
    expect(destroyMock).toHaveBeenCalled();
  });

  it('renders nothing into the DOM', async () => {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { Annotator } = await import('../../src/react/index');
    const { act } = await import('react');

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(React.createElement(Annotator, { project: 'test-proj' }));
    });
    expect(container.innerHTML).toBe('');
    await act(async () => {
      root.unmount();
    });
  });

  it('exports the component and types', async () => {
    const mod = await import('../../src/react/index');
    expect(typeof mod.Annotator).toBe('function');
  });

  it('re-inits when exportUi changes (codex #9: wrapper contract parity)', async () => {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { Annotator } = await import('../../src/react/index');
    const { act } = await import('react');

    const root = createRoot(document.createElement('div'));
    await act(async () => {
      root.render(React.createElement(Annotator, { project: 'p', exportUi: 'never' }));
    });
    await vi.dynamicImportSettled();
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ exportUi: 'never' }));
    const calls = initMock.mock.calls.length;

    await act(async () => {
      root.render(React.createElement(Annotator, { project: 'p', exportUi: 'always' }));
    });
    expect(initMock.mock.calls.length).toBe(calls + 1);
    expect(initMock).toHaveBeenLastCalledWith(expect.objectContaining({ exportUi: 'always' }));

    await act(async () => {
      root.unmount();
    });
  });
});
