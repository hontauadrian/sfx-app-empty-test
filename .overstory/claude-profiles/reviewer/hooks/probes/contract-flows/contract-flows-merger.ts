/**
 * contract-flows/contract-flows-merger.ts
 *
 * Unifies N validated AttributedContractFile[] into one logical
 * MergedContract. Decision 2's table is the spec.
 *
 *   - actors:         union by name; deep-equal payload conflict → hard error.
 *   - resources:      union by name; deep-equal full Resource
 *                     (every declarative behaviour block included) → hard error.
 *   - special_flows:  concat; duplicate id across files → hard error.
 *
 * Cross-file checks (extends targets, dependsOn ids, setup.create
 * resources, setup.by actors) run after the union pass.
 *
 * Determinism: specialFlows is sorted by id (lex) at the end so the
 * downstream emitter sees a stable order regardless of file load order.
 */

import type {
  Actor,
  AttributedContractFile,
  ContractConfig,
  Resource,
  SpecialFlow,
} from './contract-flows-schema';
import type {
  TypedError,
  FlowMergeConflictError,
  FlowDuplicateIdError,
  FlowExtendsTargetMissingError,
  FlowDependsOnTargetMissingError,
  FlowResourceParentMissingError,
  FlowActorReferenceMissingError,
} from './errors';

export interface AttributedActor       { actor: Actor;       sourceFile: string }
export interface AttributedResource    { resource: Resource; sourceFile: string }
export interface AttributedSpecialFlow {
  flow: SpecialFlow;
  sourceFile: string;
  taskId: string;
}

export interface ContractConfigMerged {
  reservedActors: Record<string, { auth: Record<string, unknown> }>;
  clockAdvanceEndpoint?: string;
  fixturesRoot?: string;
  envelope?: { successWrapper?: string[]; errorWrapper?: string[] };
  cookieJar?: { allowSecureOnHttp?: boolean };
}

export interface MergedContract {
  actors: Map<string, AttributedActor>;
  resources: Map<string, AttributedResource>;
  specialFlows: AttributedSpecialFlow[];
  taskIds: string[];
  fixtures: Map<string, string>;
  config: ContractConfigMerged;
}

export interface MergeResult {
  merged: MergedContract;
  errors: TypedError[];
}

export function emptyMergedContract(): MergedContract {
  return {
    actors: new Map(),
    resources: new Map(),
    specialFlows: [],
    taskIds: [],
    fixtures: new Map(),
    config: { reservedActors: {} },
  };
}

export function mergeContractFlows(
  files: AttributedContractFile[],
  fixtures?: Map<string, string>,
): MergeResult {
  const errors: TypedError[] = [];
  const merged = emptyMergedContract();

  if (fixtures) {
    for (const [k, v] of fixtures) merged.fixtures.set(k, v);
  }

  // ── Pass 1: union actors / resources / special_flows. ───────────────────
  for (const af of files) {
    const filePath = af.file;
    const c = af.contract;

    if (!merged.taskIds.includes(c.task_id)) merged.taskIds.push(c.task_id);

    for (const actor of c.actors ?? []) {
      const prior = merged.actors.get(actor.name);
      if (prior) {
        if (!deepEqual(prior.actor, actor)) {
          const err: FlowMergeConflictError = {
            code: 'FLOW_MERGE_CONFLICT',
            kind: 'actor',
            name: actor.name,
            files: [prior.sourceFile, filePath],
            message: `Actor '${actor.name}' definition mismatch between ${prior.sourceFile} and ${filePath}.`,
          };
          errors.push(err);
        }
      } else {
        merged.actors.set(actor.name, { actor, sourceFile: filePath });
      }
    }

    for (const resource of c.resources ?? []) {
      const prior = merged.resources.get(resource.name);
      if (prior) {
        if (!deepEqual(prior.resource, resource)) {
          const err: FlowMergeConflictError = {
            code: 'FLOW_MERGE_CONFLICT',
            kind: 'resource',
            name: resource.name,
            files: [prior.sourceFile, filePath],
            message: `Resource '${resource.name}' definition mismatch between ${prior.sourceFile} and ${filePath}.`,
          };
          errors.push(err);
        }
      } else {
        merged.resources.set(resource.name, { resource, sourceFile: filePath });
      }
    }

    for (const flow of c.special_flows ?? []) {
      const dup = merged.specialFlows.find((f) => f.flow.id === flow.id);
      if (dup) {
        const err: FlowDuplicateIdError = {
          code: 'FLOW_DUPLICATE_ID',
          flowId: flow.id,
          files: [dup.sourceFile, filePath],
          message: `Special flow id '${flow.id}' is declared in both ${dup.sourceFile} and ${filePath}.`,
        };
        errors.push(err);
      } else {
        merged.specialFlows.push({ flow, sourceFile: filePath, taskId: c.task_id });
      }
    }

    if (c.config) mergeConfig(merged.config, c.config, filePath, errors);
  }

  // ── Pass 2: cross-file checks now that the union exists. ────────────────
  for (const af of files) {
    const filePath = af.file;
    const c = af.contract;

    // extends[] targets exist
    for (const ext of c.extends ?? []) {
      if ('actor' in ext && !merged.actors.has(ext.actor)) {
        const err: FlowExtendsTargetMissingError = {
          code: 'FLOW_EXTENDS_TARGET_MISSING',
          file: filePath,
          kind: 'actor',
          name: ext.actor,
          message: `${filePath} extends actor '${ext.actor}' but no file owns it.`,
        };
        errors.push(err);
      }
      if ('resource' in ext && !merged.resources.has(ext.resource)) {
        const err: FlowExtendsTargetMissingError = {
          code: 'FLOW_EXTENDS_TARGET_MISSING',
          file: filePath,
          kind: 'resource',
          name: ext.resource,
          message: `${filePath} extends resource '${ext.resource}' but no file owns it.`,
        };
        errors.push(err);
      }
    }

    // Per-flow checks: dependsOn, setup.create, setup.by.
    for (const flow of c.special_flows ?? []) {
      for (const dep of flow.dependsOn ?? []) {
        if (!merged.specialFlows.some((f) => f.flow.id === dep)) {
          const err: FlowDependsOnTargetMissingError = {
            code: 'FLOW_DEPENDSON_TARGET_MISSING',
            file: filePath,
            flowId: flow.id,
            missingDependency: dep,
            message: `Flow '${flow.id}' (in ${filePath}) dependsOn '${dep}' which is not declared in any file.`,
          };
          errors.push(err);
        }
      }
      for (const setup of flow.setup ?? []) {
        if (!merged.resources.has(setup.create)) {
          const err: FlowResourceParentMissingError = {
            code: 'FLOW_RESOURCE_PARENT_MISSING',
            file: filePath,
            resourceName: flow.id,
            missingParent: setup.create,
            message: `Flow '${flow.id}' (in ${filePath}) setup.create references resource '${setup.create}' which is not declared.`,
          };
          errors.push(err);
        }
        if (setup.by !== undefined && !merged.actors.has(setup.by)) {
          const err: FlowActorReferenceMissingError = {
            code: 'FLOW_ACTOR_REFERENCE_MISSING',
            file: filePath,
            flowId: flow.id,
            missingActor: setup.by,
            message: `Flow '${flow.id}' (in ${filePath}) setup.by references actor '${setup.by}' which is not declared.`,
          };
          errors.push(err);
        }
      }
    }
  }

  // ── Determinism. ────────────────────────────────────────────────────────
  merged.specialFlows.sort((a, b) => (a.flow.id < b.flow.id ? -1 : a.flow.id > b.flow.id ? 1 : 0));
  merged.taskIds = [...new Set(merged.taskIds)].sort();

  return { merged, errors };
}

function mergeConfig(
  out: ContractConfigMerged,
  incoming: ContractConfig,
  filePath: string,
  errors: TypedError[],
): void {
  if (incoming.reservedActors) {
    for (const [k, v] of Object.entries(incoming.reservedActors)) {
      const prior = out.reservedActors[k];
      if (prior !== undefined && !deepEqual(prior, v)) {
        const err: FlowMergeConflictError = {
          code: 'FLOW_MERGE_CONFLICT',
          kind: 'reserved-actor',
          name: k,
          files: ['<prior>', filePath],
          message: `config.reservedActors['${k}'] differs between earlier file and ${filePath}.`,
        };
        errors.push(err);
      } else {
        out.reservedActors[k] = v;
      }
    }
  }
  if (incoming.clockAdvanceEndpoint !== undefined) {
    if (out.clockAdvanceEndpoint !== undefined && out.clockAdvanceEndpoint !== incoming.clockAdvanceEndpoint) {
      const err: FlowMergeConflictError = {
        code: 'FLOW_MERGE_CONFLICT',
        kind: 'clock-endpoint',
        files: ['<prior>', filePath],
        message: `config.clockAdvanceEndpoint differs between earlier file ('${out.clockAdvanceEndpoint}') and ${filePath} ('${incoming.clockAdvanceEndpoint}').`,
      };
      errors.push(err);
    } else {
      out.clockAdvanceEndpoint = incoming.clockAdvanceEndpoint;
    }
  }
  if (incoming.fixturesRoot !== undefined) {
    if (out.fixturesRoot !== undefined && out.fixturesRoot !== incoming.fixturesRoot) {
      const err: FlowMergeConflictError = {
        code: 'FLOW_MERGE_CONFLICT',
        kind: 'fixtures-root',
        files: ['<prior>', filePath],
        message: `config.fixturesRoot differs between earlier file ('${out.fixturesRoot}') and ${filePath} ('${incoming.fixturesRoot}').`,
      };
      errors.push(err);
    } else {
      out.fixturesRoot = incoming.fixturesRoot;
    }
  }
  if (incoming.cookieJar !== undefined) {
    if (out.cookieJar !== undefined && !deepEqual(out.cookieJar, incoming.cookieJar)) {
      const err: FlowMergeConflictError = {
        code: 'FLOW_MERGE_CONFLICT',
        kind: 'cookie-jar',
        files: ['<prior>', filePath],
        message: `config.cookieJar differs between earlier file and ${filePath}.`,
      };
      errors.push(err);
    } else {
      out.cookieJar = { ...incoming.cookieJar };
    }
  }
  if (incoming.envelope !== undefined) {
    if (out.envelope !== undefined && !deepEqual(out.envelope, incoming.envelope)) {
      const err: FlowMergeConflictError = {
        code: 'FLOW_MERGE_CONFLICT',
        kind: 'envelope',
        files: ['<prior>', filePath],
        message: `config.envelope differs between earlier file and ${filePath}.`,
      };
      errors.push(err);
    } else {
      out.envelope = { ...incoming.envelope };
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Deep-equal helper. Stable across:
//   - Object key order (objects compared as unordered key/value sets).
//   - Array order (preserved — [1,2] !== [2,1]).
//   - Special values: NaN === NaN, undefined !== null.
// Sufficient for plain JSON-like structures the YAML parser produces.
// ────────────────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const ar = a as unknown[]; const br = b as unknown[];
    if (ar.length !== br.length) return false;
    for (let i = 0; i < ar.length; i++) {
      if (!deepEqual(ar[i], br[i])) return false;
    }
    return true;
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao); const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
    if (!deepEqual(ao[k], bo[k])) return false;
  }
  return true;
}

export { deepEqual as __deepEqualForTests };
