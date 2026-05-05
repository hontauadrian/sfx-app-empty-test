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

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { tryLoadContractFlowsFolder } from './contract-flows-loader';
import { mergeContractFlows } from './contract-flows-merger';
import type { MergedContract } from './contract-flows-merger';
import type { TypedError } from './errors';

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
}

const DEFAULT_FOLDER_REL = '.overstory/runtime-contract.flows';

/** Load and merge every yaml under the contract-flows folder. The probe
 *  calls this once near startup. The result is additive — never replaces
 *  the existing `.flows.generated.json` path. */
export function loadCuratedContract(projectRoot: string, folderRel = DEFAULT_FOLDER_REL): CuratedContractSummary {
  const folder = join(projectRoot, folderRel);
  if (!existsSync(folder)) {
    return {
      folder,
      present: false,
      errors: [],
      contract: null,
      counts: { files: 0, actors: 0, resources: 0, specialFlows: 0 },
    };
  }
  const loaded = tryLoadContractFlowsFolder(folder);
  const present = loaded.files.length > 0;
  let contract: MergedContract | null = null;
  const errors: TypedError[] = [...loaded.errors];
  if (loaded.files.length > 0) {
    const result = mergeContractFlows(loaded.files, loaded.fixtures);
    errors.push(...result.errors);
    contract = result.merged;
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
  };
}

/** Pretty-print the summary as a one-line probe log entry. */
export function formatSummary(summary: CuratedContractSummary): string {
  if (!summary.present) {
    return `[contract-flows] folder ${summary.folder} is empty — no curated flows to execute (probe runs the existing generated battery only)`;
  }
  const c = summary.counts;
  const errCount = summary.errors.length;
  const errPart = errCount > 0 ? `, ${errCount} loader/merger error${errCount === 1 ? '' : 's'}` : '';
  return `[contract-flows] loaded ${c.files} file${c.files === 1 ? '' : 's'}: ${c.actors} actor${c.actors === 1 ? '' : 's'}, ${c.resources} resource${c.resources === 1 ? '' : 's'}, ${c.specialFlows} special flow${c.specialFlows === 1 ? '' : 's'}${errPart}`;
}
