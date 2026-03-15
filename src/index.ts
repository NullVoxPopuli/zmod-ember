import { toTree, print as emberPrint } from "ember-estree";
import type { Parser, ParseOptions } from "zmod";

/**
 * Shift all start/end/range offsets in a Glimmer AST by `offset`.
 */
function shiftOffsets(node: any, offset: number, visited: Set<any> = new Set()): void {
  if (!node || typeof node !== "object" || visited.has(node)) return;
  visited.add(node);

  if (typeof node.start === "number") node.start += offset;
  if (typeof node.end === "number") node.end += offset;
  if (Array.isArray(node.range)) {
    node.range = [node.range[0] + offset, node.range[1] + offset];
  }
  if (node.loc && typeof node.loc === "object") {
    // loc positions are line/column, not byte offsets — leave them as-is
    // (they were computed relative to the template content)
  }

  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc") continue;
    const val = node[key];
    if (Array.isArray(val)) {
      for (const item of val) shiftOffsets(item, offset, visited);
    } else if (val && typeof val === "object") {
      shiftOffsets(val, offset, visited);
    }
  }
}

/**
 * Post-process the AST to handle class body `<template>` tags.
 *
 * ember-estree v0.1.1 only resolves top-level/expression templates
 * (placeholder name `TEMPLATE_TEMPLATE`). Class body templates use
 * a different placeholder (`_TEMPLATE_`) that isn't matched.
 *
 * This function walks the AST, finds remaining `_TEMPLATE_` placeholders,
 * re-parses the template content through ember-estree, and splices the
 * resulting Glimmer nodes back in with correct byte offsets.
 */
function resolveClassBodyTemplates(ast: any, source: string): void {
  const visit = (node: any, parent: any, parentKey: string, parentIndex: number) => {
    if (!node || typeof node !== "object") return;
    if (!node.type) return;

    // Detect the _TEMPLATE_ placeholder inside PropertyDefinition
    if (
      node.type === "PropertyDefinition" &&
      node.key?.type === "CallExpression" &&
      node.key.callee?.name === "_TEMPLATE_"
    ) {
      const templateSource = source.substring(node.start, node.end);
      const templateAst = toTree(templateSource);
      const glimmerTemplate = templateAst?.program?.body?.[0]?.expression;

      if (glimmerTemplate?.type === "GlimmerTemplate") {
        shiftOffsets(glimmerTemplate, node.start);
        // Replace the PropertyDefinition with the GlimmerTemplate in the parent
        if (parent && Array.isArray(parent[parentKey])) {
          parent[parentKey][parentIndex] = glimmerTemplate;
        }
        return;
      }
    }

    // Recurse into child nodes
    for (const key of Object.keys(node)) {
      if (key === "parent" || key === "loc") continue;
      const val = node[key];
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length; i++) {
          if (val[i] && typeof val[i] === "object" && val[i].type) {
            visit(val[i], node, key, i);
          }
        }
      } else if (val && typeof val === "object" && val.type) {
        visit(val, node, key, -1);
      }
    }
  };

  visit(ast, null, "", -1);
}

/**
 * A zmod `Parser` adapter for Ember's `.gjs` and `.gts` files.
 *
 * Uses `ember-estree` to parse files containing `<template>` tags
 * into an ESTree-compatible AST with embedded Glimmer template nodes.
 *
 * @example
 * ```ts
 * import { z } from 'zmod';
 * import { emberParser } from 'zmod-ember';
 *
 * const j = z.withParser(emberParser);
 * const root = j(gjsSource, { filePath: 'my-component.gjs' });
 *
 * root.find(j.Identifier, { name: 'OldName' })
 *     .replaceWith('NewName');
 *
 * console.log(root.toSource());
 * ```
 *
 * @example
 * ```ts
 * // As a transform module export
 * import type { Transform } from 'zmod';
 * import { emberParser } from 'zmod-ember';
 *
 * export const parser = emberParser;
 *
 * const transform: Transform = ({ source }, { z }) => {
 *   const root = z(source);
 *   // ... transform logic
 *   return root.toSource();
 * };
 *
 * export default transform;
 * ```
 */
export const emberParser: Parser = {
  parse(source: string, options?: ParseOptions): any {
    const opts = { ...options } as Record<string, any>;

    // Map .gts/.gjs extensions so oxc-parser recognises the language
    if (typeof opts.filePath === "string") {
      opts.filePath = opts.filePath.replace(/\.gts$/, ".ts").replace(/\.gjs$/, ".js");
    }

    const ast = toTree(source, opts);

    // Handle class body <template> tags that ember-estree doesn't resolve
    resolveClassBodyTemplates(ast, source);

    return ast;
  },
  print(node: any): string {
    return emberPrint(node);
  },
};
