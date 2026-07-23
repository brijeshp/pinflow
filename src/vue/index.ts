import { defineComponent, onBeforeUnmount, onMounted, watch } from 'vue';
// Bare self-reference (NOT '../core/index'): the built wrapper keeps `pinflow`
// external so it shares the consumer's single core module — see tsup.config.ts.
// Resolved to source for typecheck/tests via tsconfig `paths` + vitest alias.
import {
  init,
  type ActivationConfig,
  type Handle,
  type Mode,
  type PinflowConfig,
  type VoiceConfig,
} from 'pinflow';

export type { PinflowConfig } from 'pinflow';

export const Annotator = defineComponent({
  name: 'PinflowAnnotator',
  props: {
    project: { type: String, required: true },
    reviewer: { type: String, default: undefined },
    mode: { type: String as () => Mode, default: undefined },
    /**
     * Maps to core `onSubmit`. Named `submitHandler` because an `on*`-prefixed
     * prop collides with Vue's `v-on`/`@submit` listener convention.
     */
    submitHandler: {
      type: Function as unknown as () => PinflowConfig['onSubmit'],
      default: undefined,
    },
    activation: { type: Object as () => ActivationConfig, default: undefined },
    voice: { type: Object as () => VoiceConfig, default: undefined },
    exportUi: {
      type: String as () => NonNullable<PinflowConfig['exportUi']>,
      default: undefined,
    },
  },
  setup(props) {
    let handle: Handle | null = null;
    const start = (): void => {
      if (typeof window === 'undefined') return;
      handle?.destroy();
      // Snapshot the reactive props — copying the nested objects core retains —
      // so later prop/object mutation can't leak into a live config.
      handle = init({
        project: props.project,
        ...(props.reviewer !== undefined ? { reviewer: props.reviewer } : {}),
        ...(props.mode !== undefined ? { mode: props.mode } : {}),
        ...(props.submitHandler ? { onSubmit: props.submitHandler } : {}),
        ...(props.activation ? { activation: { ...props.activation } } : {}),
        ...(props.voice ? { voice: { ...props.voice } } : {}),
        ...(props.exportUi !== undefined ? { exportUi: props.exportUi } : {}),
      });
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
          props.exportUi,
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
