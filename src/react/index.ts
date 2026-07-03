import { useEffect, useRef } from 'react';
// Bare self-reference (NOT '../core/index'): the built wrapper keeps `pinflow`
// external so it shares the consumer's single core module — see tsup.config.ts.
// Resolved to source for typecheck/tests via tsconfig `paths` + vitest alias.
import { init, type Handle, type PinflowConfig } from 'pinflow';

export type { PinflowConfig } from 'pinflow';
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
    // Re-init only on stable PRIMITIVE keys — inline `activation`/`voice` objects
    // are new references each render, so callers should memoize those props.
  }, [
    props.project,
    props.mode,
    props.reviewer,
    props.activation?.mode,
    props.voice?.tokenEndpoint,
  ]);

  return null;
}
