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

  it('forwards exportUi to init (review #1: wrapper contract parity)', async () => {
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

  it('maps the changeHandler prop to core onChange (renamed off Vue on* convention)', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const changeHandler = vi.fn();
    const wrapper = mount(Annotator, { project: 'vue-test', changeHandler });
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({ project: 'vue-test', onChange: changeHandler }),
    );
    wrapper.unmount();
  });

  it('forwards theme, source, routeKey, describeRoute, and activation to init (full config parity)', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const source = vi.fn(async () => []);
    const routeKey = (): string => 'frame-1';
    const describeRoute = (key: string): string => `Frame ${key}`;
    const wrapper = mount(Annotator, {
      project: 'vue-test',
      theme: { accent: '#ff00ff' },
      source,
      routeKey,
      describeRoute,
      activation: { mode: 'toggle' },
    });
    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'vue-test',
        theme: expect.objectContaining({ accent: '#ff00ff' }),
        source,
        routeKey,
        describeRoute,
        activation: expect.objectContaining({ mode: 'toggle' }),
      }),
    );
    wrapper.unmount();
  });

  it('snapshots theme and activation at init: later mutation does not leak (P4.5 parity)', async () => {
    const { Annotator } = await import('../../src/vue/index');
    const theme = { accent: '#ff00ff' };
    const activation = { mode: 'toggle' as const, longPressMs: 500 };
    const wrapper = mount(Annotator, { project: 'vue-test', theme, activation });

    theme.accent = '#000000';
    activation.longPressMs = 9999;

    const config = initMock.mock.calls[0]?.[0] as {
      theme?: { accent?: string };
      activation?: { longPressMs?: number };
    };
    expect(config.theme).not.toBe(theme);
    expect(config.theme?.accent).toBe('#ff00ff');
    expect(config.activation).not.toBe(activation);
    expect(config.activation?.longPressMs).toBe(500);
    wrapper.unmount();
  });
});
