/**
 * contract-flows/adapter-interface.ts
 *
 * Transport-agnostic emit/execute contract for protocol adapters.
 * Phase 1 ships HTTP; future bundles ship WS, gRPC, GraphQL,
 * DB-side-effects, queue-side-effects, etc.
 *
 * Dispatch is by `step.transport` tag — adapters NEVER inspect path or
 * method to claim a step. The registry routes to the first adapter
 * whose `supports()` returns true.
 *
 * The interface lives in foundation so a second adapter ships without
 * refactoring this file.
 */

import type { z } from 'zod';
import type { Step, SideEffectDecl } from './step-types';

export interface AdapterId {
  /** Open enum: 'http' | 'ws' | 'grpc' | 'graphql' | 'db' | 'queue' | <other>. */
  transport: string;
  version: '1';
}

export interface ProtocolAdapter {
  id: AdapterId;
  /** Given a step, can this adapter handle it? Dispatch is by step.transport. */
  supports(step: Step): boolean;
  execute(step: Step, ctx: ExecCtx): Promise<StepResult>;
  /** Adapter-specific Zod schema for any transport-extension fields it adds. */
  parseSchema(): z.ZodSchema<unknown>;
}

export interface ExecCtx {
  bindings: Record<string, string>;
  flowId: string;
  /** Adapter casts to its own client type. Foundation does not pin shape. */
  client: unknown;
  /** Optional cookieJar / token-store — HTTP-style adapters use this. */
  cookieJar?: unknown;
  /** Per-flow scratch space for stateful multi-step adapters (e.g. idempotency). */
  flowScratch?: Map<string, unknown>;
  /** Hook for the registry to record side-effect declarations the adapter
   *  surfaces verbatim (HTTP adapter logs only; DB adapter asserts). */
  recordSideEffect?: (decl: SideEffectDecl) => void;
  /** Cancellation propagation — the poll step honours this. */
  abortSignal?: AbortSignal;
}

export interface StepResult {
  passed: boolean;
  capturedBindings?: Record<string, string>;
  blockReason?: string;
  /** Full response for downstream expect/capture. */
  raw?: unknown;
  /** For poll/parallel/matrix steps — substep traces so diagnostics
   *  show why the aggregate passed or failed. */
  substeps?: StepResult[];
  /**
   * Echo of the request that was issued to produce the (failing)
   * response. Set by HTTP adapters on failure so the probe report can
   * show "you sent X, server returned Y" without the agent having to
   * cross-reference logs or rerun curl. `body` is the post-binding-
   * substitution payload — i.e. exactly what was sent over the wire.
   * Bodies are not truncated here; the report renderer applies caps.
   */
  requestEcho?: {
    method: string;
    url: string;
    body?: unknown;
    bodyKind?: string;
  };
  /**
   * Echo of the response associated with this step's failure. `body`
   * is the parsed JSON when the response declared application/json,
   * otherwise the raw text truncated by the adapter. Truncation for
   * report display happens later in the renderer.
   */
  responseEcho?: {
    status: number;
    body?: unknown;
  };
}
