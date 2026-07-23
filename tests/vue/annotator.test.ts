import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount } from './mount-helper';

const initMock = vi.fn();
const destroyMock = vi.fn();

vi.mock('../../src/core/index', () => ({
  init: (...args: unknown[]) => {
    initMock(...args);
    return { destroy: destroyMock };
  },
}));

describe('Vue <Annotator />', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('calls init on mount and destroy on unmount', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const wrapper = mount(Annotator, { project: 'vue-test' });
    await vi.dynamicImportSettled();
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ project: 'vue-test' }));
    wrapper.unmount();
    expect(destroyMock).toHaveBeenCalled();
  });

  it('renders nothing', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const wrapper = mount(Annotator, { project: 'vue-test' });
    expect(wrapper.el.textContent).toBe('');
    wrapper.unmount();
  });

  it('forwards exportUi to init (codex #1: wrapper contract parity)', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const wrapper = mount(Annotator, { project: 'vue-test', exportUi: 'always' });
    await vi.dynamicImportSettled();
    expect(initMock).toHaveBeenCalledWith(expect.objectContaining({ exportUi: 'always' }));
    wrapper.unmount();
  });

  it('snapshots props at init: later mutation of a passed object does not leak (P4.5)', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const activation = { mode: 'stealth' as const };
    const voice = { tokenEndpoint: 'https://x/token' };
    const wrapper = mount(Annotator, { project: 'vue-test', activation, voice });

    activation.mode = 'toggle' as never;
    voice.tokenEndpoint = 'https://evil/token';

    const config = initMock.mock.calls[0]?.[0] as {
      activation?: { mode?: string };
      voice?: { tokenEndpoint?: string };
    };
    expect(config.activation).not.toBe(activation);
    expect(config.activation?.mode).toBe('stealth');
    expect(config.voice).not.toBe(voice);
    expect(config.voice?.tokenEndpoint).toBe('https://x/token');
    wrapper.unmount();
  });

  it('maps the submitHandler prop to core onSubmit (renamed off Vue on* convention)', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const submitHandler = vi.fn();
    const wrapper = mount(Annotator, { project: 'vue-test', submitHandler });
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'vue-test', onSubmit: submitHandler }),
    );
    wrapper.unmount();
  });
});
