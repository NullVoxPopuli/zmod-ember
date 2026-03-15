declare module "ember-estree" {
  export function toTree(source: string, options?: Record<string, any>): any;
  export function parse(source: string, options?: Record<string, any>): any;
  export function print(node: any): string;
  export function buildGlimmerVisitorKeys(): Record<string, string[]>;
  export class DocumentLines {
    constructor(source: string);
    positionToOffset(pos: { line: number; column: number }): number;
    offsetToPosition(offset: number): { line: number; column: number };
  }
}
