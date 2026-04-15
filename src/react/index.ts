import { useEffect } from 'react';
import { init } from '../core/index';
import type { PinflowConfig } from '../core/types';

export type AnnotatorProps = PinflowConfig;

export function Annotator(props: AnnotatorProps): null {
  useEffect(() => {
    init(props);
  }, [props]);
  return null;
}
