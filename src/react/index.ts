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

  // Refs must not be written during render (React concurrent semantics —
  // a render may be thrown away or replayed). Sync after commit instead;
  // declared BEFORE the init effect so each commit sees fresh props.
  useEffect(() => {
    propsRef.current = props;
  });

  useEffect(() => {
    handleRef.current?.destroy();
    const p = propsRef.current;
    // Function props DELEGATE through propsRef: a rerender's fresh closures
    // (new state captured by onChange etc.) take effect without re-init
    // (codex audit #9). Object props (theme/activation/voice/submitTo) are
    // snapshotted at init — change those via a keyed remount.
    handleRef.current = init({
      ...p,
      ...(p.onChange ? { onChange: (s, c) => propsRef.current.onChange?.(s, c) } : {}),
      ...(p.onSubmit ? { onSubmit: (s) => propsRef.current.onSubmit?.(s) } : {}),
      ...(p.source ? { source: () => (propsRef.current.source ?? p.source)!() } : {}),
      ...(p.routeKey ? { routeKey: () => (propsRef.current.routeKey ?? p.routeKey)!() } : {}),
      ...(p.describeRoute
        ? { describeRoute: (k) => (propsRef.current.describeRoute ?? p.describeRoute)!(k) }
        : {}),
    });
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
    props.exportUi,
  ]);

  return null;
}
