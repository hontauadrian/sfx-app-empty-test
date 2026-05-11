/**
 * contract-flows/contract-flows-loader.ts
 *
 * Finds every JSON file in the flows folder, parses it with Zod,
 * attaches source attribution, and runs single-file consistency
 * checks (filename ↔ task_id, owns/declarations consistency,
 * fixture-existence, invariant step references, coverage-template
 * registry).
 *
 * Cross-file rules (Decision 2 conflict, dependsOn membership, parents
 * existence, resource-graph cycle) are enforced downstream — see
 * contract-flows-merger.ts and resource-graph.ts.
 *
 * Format note: contract files are JSON, not YAML. The system is
 * AI-authored end-to-end, so YAML's hand-friendly affordances are
 * wasted and its silent-coercion / indentation footguns are pure
 * cost. JSON's loud parse failures are the right trade-off.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve as resolvePath, basename, dirname, isAbsolute, join } from 'node:path';

import {
  ContractFileSchema,
  ContractFile,
  AttributedContractFile,
  KNOWN_COVERAGE_TEMPLATES,
} from './contract-flows-schema';
import type { Step } from './step-types';
import type {
  TypedError,
  FlowFileParseError,
  FlowFileSchemaInvalidError,
  FlowTaskIdMismatchError,
  FlowFileMissingOwnsOrExtendsError,
  FlowFixtureMissingError,
  FlowInvariantStepMissingError,
  FlowCoverageTemplateUnknownError,
} from './errors';

export interface LoadOptions {
  fixturesRoot?: string;
  /** Optional extension to the canonical coverage-template registry.
   *  Names listed here are accepted alongside KNOWN_COVERAGE_TEMPLATES. */
  extraCoverageTemplates?: string[];
}

export interface LoadResult {
  files: AttributedContractFile[];
  errors: TypedError[];
  /** fixtureRef → absolute path. Populated only for fixtures that
   *  exist on disk; missing fixtures emit FLOW_FIXTURE_MISSING. */
  fixtures: Map<string, string>;
}

/**
 * Reads every *.json in folderAbsPath (no recursion — flat folder per
 * Decision 1). Returns parsed+validated AttributedContractFile[] plus
 * any per-file errors captured non-fatally.
 *
 * The loader does NOT short-circuit on per-file errors: every file is
 * inspected so reviewers see the full set of issues at once.
 */
export function loadContractFlowsFolder(
  folderAbsPath: string,
  options: LoadOptions = {},
): LoadResult {
  const errors: TypedError[] = [];
  const files: AttributedContractFile[] = [];
  const fixtures = new Map<string, string>();

  // Always work in absolute-path space so dirname()/join()/isAbsolute()
  // produce stable paths regardless of process cwd.
  const folderAbs = resolvePath(folderAbsPath);

  if (!existsSync(folderAbs)) {
    return { files, errors, fixtures };
  }
  const stat = statSync(folderAbs);
  if (!stat.isDirectory()) {
    return { files, errors, fixtures };
  }

  const fileNames = readdirSync(folderAbs)
    .filter((name) => /\.json$/i.test(name))
    .sort();

  const knownTemplates = new Set<string>([
    ...KNOWN_COVERAGE_TEMPLATES,
    ...(options.extraCoverageTemplates ?? []),
  ]);

  for (const name of fileNames) {
    const filePath = resolvePath(folderAbs, name);

    let raw: string;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (e: unknown) {
      const err: FlowFileParseError = {
        code: 'FLOW_FILE_PARSE_ERROR',
        file: filePath,
        parseError: (e as Error).message,
        message: `Failed to read ${filePath}: ${(e as Error).message}`,
      };
      errors.push(err);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e: unknown) {
      const err: FlowFileParseError = {
        code: 'FLOW_FILE_PARSE_ERROR',
        file: filePath,
        parseError: (e as Error).message,
        message: `JSON parse failure in ${filePath}: ${(e as Error).message}`,
      };
      errors.push(err);
      continue;
    }

    const result = ContractFileSchema.safeParse(parsed);
    if (!result.success) {
      const err: FlowFileSchemaInvalidError = {
        code: 'FLOW_FILE_SCHEMA_INVALID',
        file: filePath,
        zodIssues: result.error.issues,
        message: `Schema validation failed in ${filePath}: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      };
      errors.push(err);
      continue;
    }

    const contract = result.data;

    // ── Filename ↔ task_id (Zod cannot see the filename). ────────────────
    const expectedTaskId = stripJsonExt(name);
    if (contract.task_id !== expectedTaskId) {
      const err: FlowTaskIdMismatchError = {
        code: 'FLOW_TASK_ID_MISMATCH',
        file: filePath,
        expected: expectedTaskId,
        actual: contract.task_id,
        message: `Filename declares task_id '${expectedTaskId}' but file body declares '${contract.task_id}'.`,
      };
      errors.push(err);
      // Continue inspection; filename mismatch is not catastrophic for the
      // remaining checks.
    }

    // ── Owns / declarations consistency (Decision 10:
    //    FLOW_FILE_MISSING_OWNS_OR_EXTENDS). The schema only enforces
    //    per-entry shape; we own the cross-section check here so the
    //    dedicated error code is the user-facing surface. ──────────────
    const unbound: FlowFileMissingOwnsOrExtendsError['unboundDeclarations'] = [];
    const ownedActors    = new Set<string>();
    const ownedResources = new Set<string>();
    for (const entry of contract.owns) {
      if ('actor' in entry)    ownedActors.add(entry.actor);
      if ('resource' in entry) ownedResources.add(entry.resource);
    }
    for (const a of contract.actors ?? []) {
      if (!ownedActors.has(a.name)) unbound.push({ kind: 'actor', name: a.name });
    }
    for (const r of contract.resources ?? []) {
      if (!ownedResources.has(r.name)) unbound.push({ kind: 'resource', name: r.name });
    }
    if (unbound.length > 0) {
      const err: FlowFileMissingOwnsOrExtendsError = {
        code: 'FLOW_FILE_MISSING_OWNS_OR_EXTENDS',
        file: filePath,
        unboundDeclarations: unbound,
        message: `${filePath} declares ${unbound.map((u) => `${u.kind} '${u.name}'`).join(', ')} but does not list them in owns[].`,
      };
      errors.push(err);
    }

    // ── Coverage-template registry. ──────────────────────────────────────
    for (const flow of contract.special_flows ?? []) {
      if (flow.coverageTemplate && !knownTemplates.has(flow.coverageTemplate)) {
        const err: FlowCoverageTemplateUnknownError = {
          code: 'FLOW_COVERAGE_TEMPLATE_UNKNOWN',
          file: filePath,
          flowId: flow.id,
          template: flow.coverageTemplate,
          knownTemplates: [...knownTemplates].sort(),
          message: `Flow '${flow.id}' references unknown coverageTemplate '${flow.coverageTemplate}'.`,
        };
        errors.push(err);
      }
    }

    // ── Invariant step refs resolve. ────────────────────────────────────
    for (const flow of contract.special_flows ?? []) {
      const invariants = flow.invariants ?? [];
      const stepIds = new Map<string, number>();
      flow.steps.forEach((s, i) => {
        const sid = (s as { stepId?: string }).stepId;
        if (sid) stepIds.set(sid, i);
      });
      invariants.forEach((inv, idx) => {
        for (const ref of inv.steps ?? []) {
          const ok = typeof ref === 'number'
            ? ref >= 0 && ref < flow.steps.length
            : stepIds.has(ref);
          if (!ok) {
            const err: FlowInvariantStepMissingError = {
              code: 'FLOW_INVARIANT_STEP_MISSING',
              file: filePath,
              flowId: flow.id,
              invariantIndex: idx,
              missingStep: ref,
              message: `Flow '${flow.id}' invariants[${idx}] references step ${typeof ref === 'number' ? `index ${ref}` : `id '${ref}'`} which does not exist (flow has ${flow.steps.length} steps).`,
            };
            errors.push(err);
          }
        }
      });
    }

    // ── Fixture existence. ──────────────────────────────────────────────
    const fixturesRoot =
      contract.config?.fixturesRoot ??
      options.fixturesRoot ??
      join(folderAbs, 'fixtures');
    const fixturesAbs = isAbsolute(fixturesRoot) ? fixturesRoot : resolvePath(dirname(filePath), fixturesRoot);

    const fixtureRefs = collectFixtureRefs(contract);
    for (const ref of fixtureRefs) {
      const resolved = isAbsolute(ref) ? ref : resolvePath(fixturesAbs, ref);
      if (!existsSync(resolved)) {
        const err: FlowFixtureMissingError = {
          code: 'FLOW_FIXTURE_MISSING',
          file: filePath,
          fixtureRef: ref,
          resolvedPath: resolved,
          message: `Fixture '${ref}' referenced by ${filePath} not found at ${resolved}.`,
        };
        errors.push(err);
      } else {
        fixtures.set(ref, resolved);
      }
    }

    files.push({ file: filePath, taskId: contract.task_id, contract });
  }

  return { files, errors, fixtures };
}

/**
 * Convenience wrapper for callers that want a non-fatal empty result
 * when the folder is absent or empty (the §10 backward-compat path).
 * Indistinguishable from `loadContractFlowsFolder` when the folder
 * exists with files; provided as a documented entry-point so projects
 * adopting the foundation incrementally have a clear opt-in seam.
 */
export function tryLoadContractFlowsFolder(
  folderAbsPath: string,
  options: LoadOptions = {},
): LoadResult {
  return loadContractFlowsFolder(folderAbsPath, options);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers.
// ────────────────────────────────────────────────────────────────────────────

function stripJsonExt(name: string): string {
  return basename(name).replace(/\.json$/i, '');
}

function collectFixtureRefs(contract: ContractFile): string[] {
  const refs: string[] = [];
  for (const r of contract.resources ?? []) {
    for (const part of r.multipartCreate?.parts ?? []) {
      if (part.fixtureRef) refs.push(part.fixtureRef);
    }
  }
  for (const flow of contract.special_flows ?? []) {
    for (const step of flow.steps) {
      collectFixtureRefsFromStep(step, refs);
    }
  }
  return refs;
}

function collectFixtureRefsFromStep(step: Step, out: string[]): void {
  // ApiStep has multipart[]
  if (step.kind === 'api' && Array.isArray(step.multipart)) {
    for (const part of step.multipart) {
      if (part.file?.fixtureRef) out.push(part.file.fixtureRef);
    }
  }
  // Recurse into nested steps for ParallelStep / MatrixStep.
  if (step.kind === 'parallel') {
    for (const branch of step.branches) {
      for (const inner of branch.steps) collectFixtureRefsFromStep(inner, out);
    }
  }
  if (step.kind === 'matrix') {
    for (const inner of step.template.steps) collectFixtureRefsFromStep(inner, out);
  }
}
