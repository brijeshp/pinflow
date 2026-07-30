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
} from '@brijeshp/pinflow';

export type { PinflowConfig } from '@brijeshp/pinflow';

export const Annotator = defineComponent({
  name: 'PinflowAnnotator',
  // Constructor-shorthand prop declarations (`reviewer: String`) — optional
  // props default to undefined without an explicit `default`, and the compact
  // form is what keeps this wrapper inside its size budget.
  props: {
    project: { type: String, required: true },
    reviewer: String,
    mode: String as () => Mode,
    /**
     * Maps to core `onSubmit`. Named `submitHandler` because an `on*`-prefixed
     * prop collides with Vue's `v-on`/`@submit` listener convention.
     */
    submitHandler: Function as unknown as () => PinflowConfig['onSubmit'],
    /**
     * Maps to core `onChange`. Named `changeHandler` for the same reason as
     * `submitHandler`: `on*` props collide with Vue's `v-on` convention.
     */
    changeHandler: Function as unknown as () => PinflowConfig['onChange'],
    source: Function as unknown as () => PinflowConfig['source'],
    theme: Object as () => NonNullable<PinflowConfig['theme']>,
    routeKey: Function as unknown as () => PinflowConfig['routeKey'],
    describeRoute: Function as unknown as () => PinflowConfig['describeRoute'],
    submitTo: Object as () => NonNullable<PinflowConfig['submitTo']>,
    activation: Object as () => ActivationConfig,
    voice: Object as () => VoiceConfig,
    exportUi: String as () => NonNullable<PinflowConfig['exportUi']>,
  },
  setup(props) {
    let handle: Handle | null = null;
    const start = (): void => {
      if (typeof window === 'undefined') return;
      handle?.destroy();
      // Snapshot the reactive props — copying the nested objects core retains —
      // so later prop/object mutation can't leak into a live config. Absent
      // props are pruned rather than passed as `undefined` keys: byte-cheaper
      // than per-key conditional spreads, identical to core's `?.`/`??` reads.
      type LooseConfig = { [K in keyof PinflowConfig]?: PinflowConfig[K] | undefined };
      const config: LooseConfig = {
        project: props.project,
        reviewer: props.reviewer,
        mode: props.mode,
        onSubmit: props.submitHandler,
        onChange: props.changeHandler,
        source: props.source,
        theme: props.theme && { ...props.theme },
        routeKey: props.routeKey,
        describeRoute: props.describeRoute,
        submitTo: props.submitTo && { ...props.submitTo },
        activation: props.activation && { ...props.activation },
        voice: props.voice && { ...props.voice },
        exportUi: props.exportUi,
      };
      for (const k of Object.keys(config) as (keyof PinflowConfig)[]) {
        if (config[k] === undefined) delete config[k];
      }
      handle = init(config as PinflowConfig);
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
