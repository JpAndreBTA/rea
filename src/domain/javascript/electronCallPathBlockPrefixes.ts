import * as t from "@babel/types";

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
  ): boolean | undefined {
    if (!node || depth >= 128) return false;
    if (!this.admitVisit()) return undefined;
    if (t.isReturnStatement(node) || t.isThrowStatement(node)) return true;
    if (t.isBreakStatement(node) && node.label && this.parents) {
      for (
        let parent = this.parents.get(block), n = 0;
        parent && n < 128;
        parent = this.parents.get(parent), n++
      ) {
        if (!this.admitVisit()) return undefined;
        if (t.isFunction(parent)) return false;
        if (
          t.isLabeledStatement(parent) &&
          parent.label.name === node.label.name
        )
          return true;
      }
      return false;
    }
    if (t.isLabeledStatement(node))
      return this.exits(node.body, block, depth + 1);
    if (t.isBlockStatement(node)) {
      for (const child of node.body) {
        const result = this.exits(child, block, depth + 1);
        if (result === undefined || result) return result;
      }
      return false;
    }
    if (!t.isIfStatement(node)) return false;
    const consequent = this.exits(node.consequent, block, depth + 1);
    if (consequent === undefined || !consequent) return consequent;
    return this.exits(node.alternate, block, depth + 1);
  }

  statement(
    statement: t.Statement,
    block: t.BlockStatement,
  ): ElectronStatementFallthrough | null | undefined {
    const cached = this.#facts.get(statement);
    if (cached !== undefined) return cached;
    let fact: ElectronStatementFallthrough | null;
    if (t.isIfStatement(statement)) {
      if (!this.admitVisit()) return undefined;
      const consequent = this.exits(statement.consequent, block);
      const alternate = this.exits(statement.alternate, block);
      if (consequent === undefined || alternate === undefined) return undefined;
      fact =
        consequent && alternate
          ? { kind: "exit" }
          : {
              kind: "branch",
              test: statement.test,
              consequentExits: consequent,
              alternateExits: alternate,
            };
    } else {
      const result = this.exits(statement, block);
      if (result === undefined) return undefined;
      fact = result ? { kind: "exit" } : null;
    }
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
        if (fact === undefined) return undefined;
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
