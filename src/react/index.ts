import { useEffect, useRef } from 'react';
import { init, type Handle } from '../core/index';
import type { PinflowConfig } from '../core/types';

export type { PinflowConfig } from '../core/types';
export type AnnotatorProps = PinflowConfig;

export function Annotator(props: AnnotatorProps): null {
  const handleRef = useRef<Handle | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    handleRef.current?.destroy();
    handleRef.current = init(propsRef.current);
    return () => {
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [props.project, props.mode, props.reviewer]);

  return null;
}
