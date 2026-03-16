import { toTree, print as emberPrint, removeParentReferences } from "ember-estree";
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
    const ast = toTree(source, options as any);

    // zmod errors with circular refs unless these are removed
    // for codemodding, this isn't so important to retain these references
    // its more important for linting or build transforms
    removeParentReferences(ast);

    return ast;
  },
  print(node: any): string {
    return emberPrint(node);
  },
};
