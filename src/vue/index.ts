import { defineComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import type { PinflowConfig, Mode, Theme, Position } from '../core/types';

export type { PinflowConfig } from '../core/types';

export const Annotator = defineComponent({
  name: 'PinflowAnnotator',
  props: {
    project: { type: String, required: true },
    reviewer: { type: String, default: undefined },
    mode: { type: String as () => Mode, default: undefined },
    theme: { type: String as () => Theme, default: undefined },
    position: { type: String as () => Position, default: undefined },
    hidden: { type: Boolean, default: undefined },
    onSubmit: { type: Function as unknown as () => PinflowConfig['onSubmit'], default: undefined },
  },
  setup(props) {
    let handle: { destroy(): void } | null = null;

    const start = async () => {
      if (typeof window === 'undefined') return;
      handle?.destroy();
      const { init } = await import('../core/index');
      handle = init(props as PinflowConfig);
    };

    onMounted(start);

    watch(
      () => [props.project, props.mode, props.reviewer] as const,
      () => start(),
    );

    onBeforeUnmount(() => {
      handle?.destroy();
      handle = null;
    });

    return () => null;
  },
});
