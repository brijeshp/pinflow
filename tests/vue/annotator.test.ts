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
});
