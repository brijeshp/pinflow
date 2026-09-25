import { relative, resolve } from 'node:path';
import type * as TypeScript from 'typescript';
import { validateSourcePath } from '../core/source-path';

export interface SourcePluginOptions {
  /** The host's existing compiler. No compiler is bundled or loaded by Pinflow. */
  typescript: typeof TypeScript;
  /** Repository root; only files inside it may acquire source hints. */
  root: string;
  enabled?: boolean;
}

/** Optional Vite-compatible development plugin for JSX/TSX. Never part of the browser core. */
export function pinflowSource(options: SourcePluginOptions) {
  const ts = options.typescript;
  const root = resolve(options.root);
  return {
    name: 'pinflow-source',
    apply: 'serve' as const,
    enforce: 'pre' as const,
    transform(code: string, id: string): { code: string; map: string | null } | null {
      if (options.enabled === false || !/\.[jt]sx$/.test(id)) return null;
      const file = relative(root, id).replace(/\\/g, '/');
      if (file.split('/').includes('node_modules') || validateSourcePath(file) !== file)
        return null;
      const transformer: TypeScript.TransformerFactory<TypeScript.SourceFile> = (context) => {
        const visit: TypeScript.Visitor = (node) => {
          if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
            // Components may forward unknown props unpredictably. Stamp actual DOM
            // elements only, and let an explicit author hint take precedence.
            const tag = node.tagName;
            if (
              ts.isIdentifier(tag) &&
              /^[a-z]/.test(tag.text) &&
              !node.attributes.properties.some(
                (prop) => ts.isJsxAttribute(prop) && prop.name.getText() === 'data-pinflow-source',
              )
            ) {
              const attributes = ts.factory.updateJsxAttributes(node.attributes, [
                ...node.attributes.properties,
                ts.factory.createJsxAttribute(
                  ts.factory.createIdentifier('data-pinflow-source'),
                  ts.factory.createStringLiteral(file),
                ),
              ]);
              node = ts.isJsxOpeningElement(node)
                ? ts.factory.updateJsxOpeningElement(
                    node,
                    node.tagName,
                    node.typeArguments,
                    attributes,
                  )
                : ts.factory.updateJsxSelfClosingElement(
                    node,
                    node.tagName,
                    node.typeArguments,
                    attributes,
                  );
            }
          }
          return ts.visitEachChild(node, visit, context);
        };
        return (source) => ts.visitNode(source, visit) as TypeScript.SourceFile;
      };
      const output = ts.transpileModule(code, {
        fileName: file,
        compilerOptions: {
          jsx: ts.JsxEmit.Preserve,
          target: ts.ScriptTarget.ESNext,
          module: ts.ModuleKind.ESNext,
          sourceMap: true,
          inlineSources: true,
        },
        transformers: { before: [transformer] },
      });
      // The map travels in the return value; the emitted URL comment would
      // point the browser at a .map file that does not exist.
      return {
        code: output.outputText.replace(/\n\/\/# sourceMappingURL=\S+\s*$/, '\n'),
        map: output.sourceMapText ?? null,
      };
    },
  };
}
