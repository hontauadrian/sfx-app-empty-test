/**
 * contract-flows/resource-graph.ts
 *
 * Resource DAG built from `MergedContract.resources`.
 * Emitters resolve setup chains in topological order; cycles are caught
 * here at load time, not at probe runtime.
 *
 * Cycle detection: tri-colour DFS (white = unseen, grey = on stack,
 * black = finished). White → grey → black; an edge to a grey node is a
 * back-edge → cycle. Walks <100 resources in practice.
 */

import type { Resource } from './contract-flows-schema';
import type {
  TypedError,
  FlowResourceParentMissingError,
  FlowResourceCycleError,
} from './errors';

/**
 * The merger emits AttributedResource[]; we accept the bare Map<string,
 * AttributedResource> from there but only need `resource.parents` and
 * `resource.name`. We model that minimally so this module does not
 * depend on the merger types.
 */
export interface ResourceLike {
  resource: Pick<Resource, 'name' | 'parents'>;
  sourceFile: string;
}

export interface ResourceGraph {
  /** Topological order over resource names. Throws if a cycle exists
   *  (cycles are also surfaced as FLOW_RESOURCE_CYCLE in the build
   *  result, so callers should typically inspect the error list first). */
  topo(): string[];
  ancestors(name: string): string[];
  descendants(name: string): string[];
  parents(name: string): string[];
  children(name: string): string[];
  has(name: string): boolean;
}

export interface BuildResult {
  graph: ResourceGraph;
  errors: TypedError[];
}

export function buildResourceGraph(resources: Map<string, ResourceLike>): BuildResult {
  const errors: TypedError[] = [];

  // 1) Build adjacency. parent → child (NOT child → parent), because
  //    topo-sort yields parents-before-children which is the order the
  //    setup-chain emitter wants.
  const childrenOf = new Map<string, Set<string>>();
  const parentsOf  = new Map<string, Set<string>>();
  for (const name of resources.keys()) {
    childrenOf.set(name, new Set());
    parentsOf.set(name, new Set());
  }

  for (const [name, attributed] of resources) {
    const parents = attributed.resource.parents ?? [];
    for (const parent of parents) {
      if (!resources.has(parent)) {
        const err: FlowResourceParentMissingError = {
          code: 'FLOW_RESOURCE_PARENT_MISSING',
          file: attributed.sourceFile,
          resourceName: name,
          missingParent: parent,
          message: `Resource '${name}' (in ${attributed.sourceFile}) declares parent '${parent}' but no file owns that resource.`,
        };
        errors.push(err);
        continue;
      }
      childrenOf.get(parent)!.add(name);
      parentsOf.get(name)!.add(parent);
    }
  }

  // 2) Tri-colour DFS for cycle detection. White=0, Grey=1, Black=2.
  const color = new Map<string, 0 | 1 | 2>();
  for (const name of resources.keys()) color.set(name, 0);
  const cycle: string[] = [];

  function dfs(node: string, stack: string[]): boolean {
    color.set(node, 1);
    stack.push(node);
    for (const child of childrenOf.get(node) ?? []) {
      const c = color.get(child)!;
      if (c === 1) {
        // Found cycle. Slice from the back-edged node to the current top.
        const startIdx = stack.indexOf(child);
        cycle.push(...stack.slice(startIdx), child);
        return true;
      }
      if (c === 0) {
        if (dfs(child, stack)) return true;
      }
    }
    color.set(node, 2);
    stack.pop();
    return false;
  }

  for (const name of [...resources.keys()].sort()) {
    if (color.get(name) === 0) {
      if (dfs(name, [])) break;
    }
  }

  if (cycle.length > 0) {
    const err: FlowResourceCycleError = {
      code: 'FLOW_RESOURCE_CYCLE',
      cyclePath: cycle,
      message: `Resource graph contains a cycle: ${cycle.join(' → ')}`,
    };
    errors.push(err);
  }

  // 3) Build the public graph view. Topo-sort via Kahn's so callers get
  //    deterministic order (insertion order is unstable across JS engines'
  //    Map iteration when re-built from JSON).
  const graph: ResourceGraph = {
    topo() {
      if (cycle.length > 0) {
        throw new Error(`resource-graph: cannot topologically sort — cycle detected: ${cycle.join(' → ')}`);
      }
      // Kahn's: start from nodes with zero parents, peel off in lex order
      // for determinism.
      const inDegree = new Map<string, number>();
      for (const [name, parents] of parentsOf) inDegree.set(name, parents.size);
      const ready: string[] = [...inDegree.entries()].filter(([_, d]) => d === 0).map(([n]) => n).sort();
      const out: string[] = [];
      while (ready.length > 0) {
        const next = ready.shift()!;
        out.push(next);
        for (const child of [...(childrenOf.get(next) ?? [])].sort()) {
          const d = inDegree.get(child)! - 1;
          inDegree.set(child, d);
          if (d === 0) ready.push(child);
        }
        ready.sort();
      }
      return out;
    },
    ancestors(name) {
      if (!parentsOf.has(name)) return [];
      const seen = new Set<string>();
      const stack: string[] = [...(parentsOf.get(name) ?? [])];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const p of parentsOf.get(cur) ?? []) stack.push(p);
      }
      return [...seen].sort();
    },
    descendants(name) {
      if (!childrenOf.has(name)) return [];
      const seen = new Set<string>();
      const stack: string[] = [...(childrenOf.get(name) ?? [])];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        for (const c of childrenOf.get(cur) ?? []) stack.push(c);
      }
      return [...seen].sort();
    },
    parents(name) {
      return [...(parentsOf.get(name) ?? [])].sort();
    },
    children(name) {
      return [...(childrenOf.get(name) ?? [])].sort();
    },
    has(name) {
      return resources.has(name);
    },
  };

  return { graph, errors };
}
