import { toTree, print as emberPrint } from "ember-estree";
import type { Parser, ParseOptions } from "zmod";

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
    const ast = toTree(source, {
      ...(options as any),
      includeParentLinks: false,
      // zmod walks the tree via visitor keys; keep Glimmer comment nodes
      // in GlimmerTemplate.body (with semantic types + longForm) so
      // `root.find("GlimmerCommentStatement")` / `root.find("GlimmerMustacheCommentStatement")`
      // can reach them. Without this opt-in, ember-estree's default
      // removes them from body and surfaces only Block-typed clones
      // in `ast.comments` — the right contract for ESLint consumers,
      // but invisible to zmod's tree-walker.
      keepCommentsInBody: true,
    });

    return ast;
  },
  print(node: any): string {
    return emberPrint(node);
  },
};
