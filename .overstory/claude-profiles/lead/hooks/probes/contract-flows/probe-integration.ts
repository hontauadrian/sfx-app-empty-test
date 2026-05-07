/**
 * contract-flows/probe-integration.ts
 *
 * Thin additive bridge between the contract-flows folder
 * (`.overstory/runtime-contract.flows/`) and the http-smoke probe.
 *
 * Phase 0b (W3) wires this entry as a NEW input to the probe pipeline —
 * the existing matrix + flows-generator path is preserved verbatim.
 * W5 will consume the returned MergedContract to drive curated flow
 * execution; for now the helper just loads + merges + reports counts so
 * `pnpm probe:smoke` users can see whether curated flows exist.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { tryLoadContractFlowsFolder } from './contract-flows-loader';
import { mergeContractFlows } from './contract-flows-merger';
import type { MergedContract } from './contract-flows-merger';
import type { TypedError } from './errors';

export interface ResponseEnvelope {
  successWrapper: string[];
  errorPath?: string;
}

export function readResponseEnvelopeFromOpenApi(projectRoot: string): {
  envelope: ResponseEnvelope | null;
  error: TypedError | null;
} {
  const openApiPath = join(projectRoot, 'apps', 'api', '.openapi.json');
  if (!existsSync(openApiPath)) {
    return {
      envelope: null,
      error: {
        code: 'ENVELOPE_UNDECLARED',
        file: openApiPath,
        message: `apps/api/.openapi.json not found — run 'pnpm openapi:dump' first`,
      },
    };
  }
  let raw: string;
  try {
    raw = readFileSync(openApiPath, 'utf8');
  } catch (error) {
    return {
      envelope: null,
      error: {
        code: 'ENVELOPE_UNDECLARED',
        file: openApiPath,
        message: `cannot read apps/api/.openapi.json: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  let spec: Record<string, unknown>;
  try {
    spec = JSON.parse(raw);
  } catch (error) {
    return {
      envelope: null,
      error: {
        code: 'ENVELOPE_UNDECLARED',
        file: openApiPath,
        message: `apps/api/.openapi.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
  const env = spec['x-response-envelope'] as { successWrapper?: unknown; errorPath?: unknown } | undefined;
  if (!env || !Array.isArray(env.successWrapper) || !env.successWrapper.every((s) => typeof s === 'string')) {
    return {
      envelope: null,
      error: {
        code: 'ENVELOPE_UNDECLARED',
        file: openApiPath,
        message:
          `apps/api/.openapi.json missing top-level 'x-response-envelope' with successWrapper: string[]. ` +
          `Set it from your response interceptor's static metadata in apps/api/src/swagger.ts. ` +
          `For raw-body APIs (no wrapper), use successWrapper: [].`,
      },
    };
  }
  return {
    envelope: {
      successWrapper: env.successWrapper as string[],
      errorPath: typeof env.errorPath === 'string' ? env.errorPath : undefined,
    },
    error: null,
  };
}

export interface CuratedContractSummary {
  /** Resolved absolute path to the flows folder. */
  folder: string;
  /** True when the folder exists and contains at least one yaml file. */
  present: boolean;
  /** Loader + merger errors. Non-fatal at this phase — exposed so the
   *  probe can surface them in the human report without blocking. */
  errors: TypedError[];
  /** The merged contract. `null` when the folder is missing or all files
   *  failed to parse (errors[] explains why). */
  contract: MergedContract | null;
  /** Counts for the probe summary block. */
  counts: {
    files: number;
    actors: number;
    resources: number;
    specialFlows: number;
  };
  /** Response envelope read from apps/api/.openapi.json x-response-envelope.
   *  Source of truth lives in the API code (TransformInterceptor.ENVELOPE
   *  → swagger.ts → openapi.json). When `null`, the envelope was not
   *  declared and `errors` carries an ENVELOPE_UNDECLARED entry. */
  envelope: ResponseEnvelope | null;
}

const DEFAULT_FOLDER_REL = '.overstory/runtime-contract.flows';

/** Load and merge every yaml under the contract-flows folder. The probe
 *  calls this once near startup. The result is additive — never replaces
 *  the existing `.flows.generated.json` path. */
export function loadCuratedContract(projectRoot: string, folderRel = DEFAULT_FOLDER_REL): CuratedContractSummary {
  const folder = join(projectRoot, folderRel);
  const envelopeResult = readResponseEnvelopeFromOpenApi(projectRoot);
  const envelopeErrors: TypedError[] = envelopeResult.error ? [envelopeResult.error] : [];

  if (!existsSync(folder)) {
    return {
      folder,
      present: false,
      errors: envelopeErrors,
      contract: null,
      counts: { files: 0, actors: 0, resources: 0, specialFlows: 0 },
      envelope: envelopeResult.envelope,
    };
  }
  const loaded = tryLoadContractFlowsFolder(folder);
  const present = loaded.files.length > 0;
  let contract: MergedContract | null = null;
  const errors: TypedError[] = [...loaded.errors, ...envelopeErrors];
  if (loaded.files.length > 0) {
    const result = mergeContractFlows(loaded.files, loaded.fixtures);
    errors.push(...result.errors);
    contract = result.merged;
    if (contract && envelopeResult.envelope) {
      const cfg = (contract.config ?? {}) as Record<string, unknown>;
      cfg.envelope = {
        successWrapper: envelopeResult.envelope.successWrapper,
        ...(envelopeResult.envelope.errorPath !== undefined ? { errorPath: envelopeResult.envelope.errorPath } : {}),
      };
      contract.config = cfg as unknown as MergedContract['config'];
    }
  }
  return {
    folder,
    present,
    errors,
    contract,
    counts: contract
      ? {
          files: loaded.files.length,
          actors: contract.actors.size,
          resources: contract.resources.size,
          specialFlows: contract.specialFlows.length,
        }
      : { files: loaded.files.length, actors: 0, resources: 0, specialFlows: 0 },
    envelope: envelopeResult.envelope,
  };
}

export function formatSummary(summary: CuratedContractSummary): string {
  const envParts: string[] = [];
  if (summary.envelope) {
    const wrapper = summary.envelope.successWrapper;
    envParts.push(
      wrapper.length === 0
        ? '[response-envelope] raw (no wrapper)'
        : `[response-envelope] successWrapper=${JSON.stringify(wrapper)}${summary.envelope.errorPath ? ` errorPath="${summary.envelope.errorPath}"` : ''}`,
    );
  } else {
    envParts.push('[response-envelope] UNDECLARED — see ENVELOPE_UNDECLARED in errors');
  }
  if (!summary.present) {
    envParts.push(`[contract-flows] folder ${summary.folder} is empty — no curated flows to execute (probe runs the existing generated battery only)`);
    return envParts.join('\n');
  }
  const c = summary.counts;
  const errCount = summary.errors.length;
  const errPart = errCount > 0 ? `, ${errCount} loader/merger error${errCount === 1 ? '' : 's'}` : '';
  envParts.push(`[contract-flows] loaded ${c.files} file${c.files === 1 ? '' : 's'}: ${c.actors} actor${c.actors === 1 ? '' : 's'}, ${c.resources} resource${c.resources === 1 ? '' : 's'}, ${c.specialFlows} special flow${c.specialFlows === 1 ? '' : 's'}${errPart}`);
  return envParts.join('\n');
}
