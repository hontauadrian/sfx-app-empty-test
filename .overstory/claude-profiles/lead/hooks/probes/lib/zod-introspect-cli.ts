#!/usr/bin/env tsx
/**
 * CLI wrapper for zod-introspect.ts — invoked as a child process by
 * enrich-matrix.js (which is CommonJS .js) via `tsx`.
 *
 * Protocol: reads JSON from stdin: { schemaPath: string, symbolName: string }
 * Writes JSON to stdout: SchemaContract | { error: string }
 *
 * Design choice: approach 2 from the task spec — subprocess via tsx.
 * Simpler than compiling .ts → .cjs at hook time, and matches how
 * probes/index.ts is already invoked via `pnpm exec tsx`.
 */
import { zodIntrospect } from './zod-introspect';

async function main(): Promise<void> {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  let request: { schemaPath: string; symbolName: string };
  try {
    request = JSON.parse(input);
  } catch {
    process.stdout.write(JSON.stringify({ error: 'Invalid JSON on stdin' }));
    process.exit(0);
  }

  try {
    const contract = zodIntrospect(request.schemaPath, request.symbolName);
    process.stdout.write(JSON.stringify(contract));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    process.stdout.write(JSON.stringify({ error: message }));
  }
  process.exit(0);
}

main();
