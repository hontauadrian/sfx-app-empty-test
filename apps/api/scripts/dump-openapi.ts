/**
 * dump-openapi.ts — build-time OpenAPI spec dumper.
 *
 * Boots the Nest application without binding a port, writes the Swagger
 * document to apps/api/.openapi.json, and exits. Used by
 * scripts/worktree-stack.sh (and any offline matrix regen) so that a
 * fresh worktree can produce a static spec without having to start the
 * HTTP server first.
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// AppConfigModule validates DATABASE_URL + JWT_SECRET via Zod at module
// decoration time (inside ConfigModule.forRoot). This script never
// touches the DB or signs tokens — it only walks the controller graph
// for Swagger — so provide safe placeholders BEFORE AppModule is
// imported (dynamic import below keeps these assignments in order).
process.env.DATABASE_URL ||= 'postgresql://openapi-dump@localhost:5432/openapi-dump';
process.env.JWT_SECRET ||= 'openapi-dump-not-used-for-signing-tokens';
process.env.NODE_ENV ||= 'development';

async function main(): Promise<void> {
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { buildSwaggerDocument } = await import('../src/swagger');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');

  const document = buildSwaggerDocument(app);
  const outPath = resolve(__dirname, '..', '.openapi.json');
  writeFileSync(outPath, JSON.stringify(document, null, 2));
  await app.close();

  process.stdout.write(`dump-openapi: wrote ${outPath}\n`);
}

main().catch((err: unknown) => {
  process.stderr.write(`dump-openapi: fatal: ${String(err instanceof Error ? err.stack : err)}\n`);
  process.exit(1);
});
