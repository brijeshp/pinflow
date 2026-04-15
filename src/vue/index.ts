import { defineComponent, onMounted } from 'vue';
import { init } from '../core/index';
import type { PinflowConfig } from '../core/types';

export const Annotator = defineComponent({
  name: 'PinflowAnnotator',
  props: {
    project: { type: String, required: true },
    reviewer: { type: String, default: undefined },
    mode: { type: String as () => PinflowConfig['mode'], default: undefined },
    theme: { type: String as () => PinflowConfig['theme'], default: undefined },
    position: { type: String as () => PinflowConfig['position'], default: undefined },
    hidden: { type: Boolean, default: undefined },
  },
  setup(props) {
    onMounted(() => {
      init(props as PinflowConfig);
    });
    return () => null;
  },
});
