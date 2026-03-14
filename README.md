# zmod-ember

This repo provides an adapter for [zmod](https://github.com/NaamuKim/zmod) for ember's gjs and gts files via [ember-eslint-parser](https://github.com/ember-tooling/ember-eslint-parser/) as zmod's default parser is [oxc](https://github.com/oxc-project/oxc)-parser, which is ESTree-compatible.

## Installation

```bash
pnpm add zmod-ember zmod @babel/core
```

## Usage

### With `z.withParser()`

```ts
import { z } from 'zmod';
import { emberParser } from 'zmod-ember';

const j = z.withParser(emberParser);

const source = `import Component from '@glimmer/component';

export default class OldComponent extends Component {
  <template>
    <h1>Hello {{@name}}</h1>
  </template>
}
`;

const root = j(source, { filePath: 'my-component.gjs' });

root.find(j.Identifier, { name: 'OldComponent' })
    .replaceWith('NewComponent');

console.log(root.toSource());
```

### As a transform module

```ts
import type { Transform } from 'zmod';
import { emberParser } from 'zmod-ember';

// Export the parser so zmod's `run()` uses it for all files
export const parser = emberParser;

const transform: Transform = ({ source, path }, { z }) => {
  const root = z(source, { filePath: path });

  root.find(z.Identifier, { name: 'OldName' })
      .replaceWith('NewName');

  return root.toSource();
};

export default transform;
```

### Running transforms

```ts
import { run } from 'zmod';
import transform from './my-transform.js';

const result = await run(transform, {
  include: ['src/**/*.gjs', 'src/**/*.gts'],
});

console.log(result.files);
```

## How it works

The adapter wraps `ember-eslint-parser`'s `parseForESLint()` to implement zmod's [`Parser` interface](https://github.com/NaamuKim/zmod/blob/main/packages/zmod/src/parser.ts):

- **`parse(source, options)`** — Calls `parseForESLint` and returns an ESTree-compatible AST with embedded Glimmer template nodes. All nodes are guaranteed to have `start`/`end` byte-offset properties required by zmod's span-based patching.
- **`print(node)`** — Serializes AST nodes back to source code. Handles standard ESTree nodes and Glimmer template nodes (e.g., `GlimmerElementNode`, `GlimmerMustacheStatement`).

Pass `{ filePath: 'name.gjs' }` or `{ filePath: 'name.gts' }` in the parse options to control the file type. `.gts` files require `@typescript-eslint/parser` to be installed.

## Peer dependencies

| Package | Required | Notes |
|---------|----------|-------|
| `zmod` | Yes | Core codemod toolkit |
| `@babel/core` | Yes | Required by ember-eslint-parser |
| `@typescript-eslint/parser` | For `.gts` files | Required to parse TypeScript templates |

