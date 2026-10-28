import * as t from "@babel/types";
import { symbolicDefiniteExit } from "./javascriptSymbolicControlFlow.js";

/** Syntax alone can establish an exit, but never a branch's contextual truth. */
export type ElectronStatementFallthrough =
  | { readonly kind: "exit" }
  | {
      readonly kind: "branch";
      readonly test: t.Expression;
      readonly consequentExits: boolean;
      readonly alternateExits: boolean;
    };

interface PrefixEntry {
  readonly position: number;
  readonly fact: ElectronStatementFallthrough;
}

interface BlockIndex {
  readonly positions: WeakMap<t.Node, number>;
  readonly entries: readonly PrefixEntry[];
}

/**
 * One collector's immutable syntax facts. Positions replace repeated body
 * searches; ordinary fallthrough statements need no replay. Conditional tests
 * remain present even when neither branch exits, since evaluating them belongs
 * to the invocation's symbolic environment and can establish unknown coverage.
 */
export class ElectronCallPathBlockPrefixes {
  readonly #blocks = new WeakMap<t.BlockStatement, BlockIndex>();
  readonly #facts = new WeakMap<
    t.Statement,
    ElectronStatementFallthrough | null
  >();

  constructor(
    private readonly admitVisit: () => boolean,
    private readonly parents?: WeakMap<t.Node, t.Node>,
  ) {}

  /** A labelled break leaves this block only when its target encloses it. */
  private exits(
    node: t.Node | null | undefined,
    block: t.BlockStatement,
    depth = 0,
  ): boolean {
    if (!node || depth >= 128) return false;
    if (symbolicDefiniteExit(node)) return true;
    if (t.isBreakStatement(node) && node.label && this.parents) {
      for (
        let parent = this.parents.get(block), n = 0;
        parent && n < 128;
        parent = this.parents.get(parent), n++
      ) {
        if (!this.admitVisit() || t.isFunction(parent)) return false;
        if (
          t.isLabeledStatement(parent) &&
          parent.label.name === node.label.name
        )
          return true;
      }
      return false;
    }
    if (t.isBlockStatement(node))
      return node.body.some((child) => this.exits(child, block, depth + 1));
    return (
      t.isIfStatement(node) &&
      this.exits(node.consequent, block, depth + 1) &&
      this.exits(node.alternate, block, depth + 1)
    );
  }

  statement(
    statement: t.Statement,
    block?: t.BlockStatement,
  ): ElectronStatementFallthrough | null {
    const cached = this.#facts.get(statement);
    if (cached !== undefined) return cached;
    const exits = (node: t.Node | null | undefined) =>
      block === undefined
        ? symbolicDefiniteExit(node)
        : this.exits(node, block);
    const fact: ElectronStatementFallthrough | null = exits(statement)
      ? { kind: "exit" }
      : t.isIfStatement(statement)
        ? {
            kind: "branch",
            test: statement.test,
            consequentExits: exits(statement.consequent),
            alternateExits: exits(statement.alternate),
          }
        : null;
    this.#facts.set(statement, fact);
    return fact;
  }

  *before(
    block: t.BlockStatement,
    child: t.Node,
  ): Generator<
    void,
    | { readonly entries: readonly PrefixEntry[]; readonly before: number }
    | undefined
  > {
    let index = this.#blocks.get(block);
    if (index === undefined) {
      const positions = new WeakMap<t.Node, number>();
      const entries: PrefixEntry[] = [];
      for (const [position, statement] of block.body.entries()) {
        if (!this.admitVisit()) return undefined;
        positions.set(statement, position);
        const fact = this.statement(statement, block);
        if (fact !== null) entries.push({ position, fact });
        if ((position + 1) % 1024 === 0) yield;
      }
      index = { positions, entries };
      this.#blocks.set(block, index);
    }
    const before = index.positions.get(child);
    return before === undefined
      ? undefined
      : { entries: index.entries, before };
  }
}
