import { useEffect, useRef } from 'react';
import type { PinflowConfig } from '../core/types';

export type { PinflowConfig } from '../core/types';
export type AnnotatorProps = PinflowConfig;

export function Annotator(props: AnnotatorProps): null {
  const handleRef = useRef<{ destroy(): void } | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;
    import('../core/index').then(({ init }) => {
      if (cancelled) return;
      handleRef.current?.destroy();
      handleRef.current = init(propsRef.current);
    });

    return () => {
      cancelled = true;
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [props.project, props.mode, props.reviewer]);

  return null;
}
