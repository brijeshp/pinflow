import { defineComponent, onBeforeUnmount, onMounted, watch } from 'vue';
import { init, type Handle } from '../core/index';
import type { ActivationConfig, Mode, PinflowConfig, Position, VoiceConfig } from '../core/types';

export type { PinflowConfig } from '../core/types';

export const Annotator = defineComponent({
  name: 'PinflowAnnotator',
  props: {
    project: { type: String, required: true },
    reviewer: { type: String, default: undefined },
    mode: { type: String as () => Mode, default: undefined },
    position: { type: String as () => Position, default: undefined },
    hidden: { type: Boolean, default: undefined },
    onSubmit: { type: Function as unknown as () => PinflowConfig['onSubmit'], default: undefined },
    activation: { type: Object as () => ActivationConfig, default: undefined },
    voice: { type: Object as () => VoiceConfig, default: undefined },
  },
  setup(props) {
    let handle: Handle | null = null;
    const start = (): void => {
      if (typeof window === 'undefined') return;
      handle?.destroy();
      handle = init(props as PinflowConfig);
    };
    onMounted(start);
    // Re-init only on stable primitive keys.
    watch(
      () =>
        [
          props.project,
          props.mode,
          props.reviewer,
          props.activation?.mode,
          props.voice?.tokenEndpoint,
        ] as const,
      start,
    );
    onBeforeUnmount(() => {
      handle?.destroy();
      handle = null;
    });
    return () => null;
  },
});
