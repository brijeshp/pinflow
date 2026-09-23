import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { pinflowSource } from '../../src/instrumentation/index';
const plugin = pinflowSource({ typescript: ts, root: '/project' });
describe('optional development source instrumentation', () => {
  it('adds relative source hints to intrinsic JSX nodes and preserves existing explicit hints', () => {
    const result = plugin.transform(
      'export const Card = () => <section><Button/><button data-pinflow-source="src/Explicit.tsx">Buy</button><input /></section>',
      '/project/src/Card.tsx',
    );
    expect(result!.code).toContain('data-pinflow-source="src/Card.tsx"');
    expect(result!.code).toContain('<Button />');
    expect(result!.code).toContain('data-pinflow-source="src/Explicit.tsx"');
    expect(result!.code).not.toContain('/project');
    expect(JSON.parse(result!.map!).sources).toEqual(['Card.tsx']);
    expect(plugin.apply).toBe('serve');
  });
  it('does not stamp dependencies, foreign files, query modules, non-JSX, or instruction files', () => {
    for (const id of [
      '/elsewhere/X.tsx',
      '/project/node_modules/a/X.tsx',
      '/project/.private/X.tsx',
      '/project/src/X.ts',
      '/project/src/X.tsx?raw',
      '/project/AGENTS.tsx',
    ]) {
      expect(plugin.transform('export const X = () => <div/>', id)).toBeNull();
    }
  });
  it('leaves disabled instrumentation inert and emits usable source maps', () => {
    const disabled = pinflowSource({ typescript: ts, root: '/project', enabled: false });
    expect(disabled.transform('<div/>', '/project/src/X.tsx')).toBeNull();
    const result = plugin.transform('export const X = () => <div/>', '/project/src/X.tsx')!;
    expect(JSON.parse(result.map!).mappings.length).toBeGreaterThan(0);
  });
});
