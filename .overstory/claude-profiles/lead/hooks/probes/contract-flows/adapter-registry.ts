/**
 * contract-flows/adapter-registry.ts
 *
 * Transport-keyed registry that routes a Step to its adapter.
 * Phase 1 wires `getRegistry().register(new HttpAdapter())` once at
 * module load. A step routed to a transport with no adapter raises
 * `FLOW_ADAPTER_UNREGISTERED` carrying the offending step's transport
 * tag (Decision §5).
 */

import type { ProtocolAdapter, AdapterId } from './adapter-interface';
import type { Step } from './step-types';
import { ContractFlowError, FlowAdapterUnregisteredError } from './errors';

export class AdapterRegistry {
  private byTransport = new Map<string, ProtocolAdapter>();
  private all: ProtocolAdapter[] = [];

  register(adapter: ProtocolAdapter): void {
    const t = adapter.id.transport;
    if (this.byTransport.has(t)) {
      throw new Error(
        `AdapterRegistry: transport '${t}' already registered. Each transport claims at most one adapter at a time.`,
      );
    }
    this.byTransport.set(t, adapter);
    this.all.push(adapter);
  }

  /**
   * Resolve the adapter for a step.
   *
   * Resolution order:
   *  1. If `step.transport` is set, look up by transport key.
   *  2. Otherwise, iterate registered adapters in registration order
   *     and pick the first whose `supports()` returns true.
   *
   * Throws `ContractFlowError(FlowAdapterUnregisteredError)` if no
   * adapter claims the step.
   */
  resolve(step: Step): ProtocolAdapter {
    const transportTag = (step as { transport?: string }).transport;
    if (transportTag) {
      const direct = this.byTransport.get(transportTag);
      if (direct && direct.supports(step)) return direct;
    }
    for (const adapter of this.all) {
      if (adapter.supports(step)) return adapter;
    }
    const err: FlowAdapterUnregisteredError = {
      code: 'FLOW_ADAPTER_UNREGISTERED',
      transport: transportTag ?? '<unset>',
      stepKind: (step as { kind: string }).kind,
      message: `No adapter registered for step kind '${(step as { kind: string }).kind}' on transport '${transportTag ?? '<unset>'}'.`,
    };
    throw new ContractFlowError(err);
  }

  has(transport: string): boolean {
    return this.byTransport.has(transport);
  }

  list(): AdapterId[] {
    return this.all.map((a) => a.id);
  }

  /**
   * Test-hook: clear all registrations. Production code never calls this;
   * tests use it to isolate the singleton between cases.
   */
  reset(): void {
    this.byTransport.clear();
    this.all = [];
  }
}

let singleton: AdapterRegistry | null = null;

export function getRegistry(): AdapterRegistry {
  if (singleton === null) singleton = new AdapterRegistry();
  return singleton;
}

/**
 * Test-hook: reset the singleton between tests. Marked with `__test`
 * prefix to discourage production use. Phase 1+ adapters MUST NOT call
 * this; they call `getRegistry().register(...)` once at module load.
 */
export function __resetRegistryForTests(): void {
  singleton = null;
}
