'use strict';

const path = require('path');
const fs = require('fs');

const { readRootPkg, readAllPackages, aggregateDeps } = require('../lib/pkgjson');
const { hasFile, hasGlob } = require('../lib/fsutil');

// Framework detection — web, api, monorepo, auth.
// Spec: plan 02 §3.
function detectFrameworks(root, diag) {
  const packages = readAllPackages(root);
  const deps = aggregateDeps(packages);
  const rootPkg = readRootPkg(root);

  const hasAny = (paths) => hasFile(root, paths) || packages.some((entry) => hasFile(entry.dir, paths));

  const web = [];
  if (deps.next || hasAny(['next.config.ts', 'next.config.js', 'next.config.mjs'])) web.push('next');
  if (deps.nuxt || hasAny(['nuxt.config.ts', 'nuxt.config.js'])) web.push('nuxt');
  if (deps['@sveltejs/kit'] || hasAny(['svelte.config.ts', 'svelte.config.js'])) web.push('sveltekit');
  if (deps['@remix-run/react'] || hasAny(['remix.config.ts', 'remix.config.js'])) web.push('remix');
  if (hasAny(['astro.config.mjs', 'astro.config.ts', 'astro.config.js'])) web.push('astro');
  if (hasFile(root, ['angular.json'])) web.push('angular');
  if (hasAny(['vite.config.ts', 'vite.config.js']) && deps.react && !deps.next) web.push('vite-react');
  if (hasAny(['vite.config.ts', 'vite.config.js']) && deps['solid-js']) web.push('solid');

  const api = [];
  if (deps['@nestjs/core'] || hasAny(['nest-cli.json'])) api.push('nest');
  if (deps.express && !api.includes('nest')) api.push('express');
  if (deps.fastify) api.push('fastify');
  if (deps.hono) api.push('hono');
  if (deps['@trpc/server']) api.push('trpc');
  if (deps.elysia) api.push('elysia');
  if (deps.koa) api.push('koa');

  let monorepo = 'none';
  if (hasFile(root, ['turbo.json'])) monorepo = 'turbo';
  else if (hasFile(root, ['nx.json'])) monorepo = 'nx';
  else if (hasFile(root, ['lerna.json'])) monorepo = 'lerna';
  else if (hasFile(root, ['pnpm-workspace.yaml'])) monorepo = 'pnpm-workspace';
  else if (rootPkg.workspaces) monorepo = 'yarn-workspace';

  const auth = [];
  if (deps['@nestjs/jwt'] || deps['passport-jwt'] || deps.jsonwebtoken) auth.push('jwt');
  if (deps['@supabase/supabase-js']) auth.push('supabase');
  if (deps['@clerk/nextjs'] || deps['@clerk/clerk-sdk-node']) auth.push('clerk');
  if (deps['next-auth'] || deps['@auth/core']) auth.push('auth.js');

  const appRouterCandidates = [
    path.join(root, 'apps'),
    path.join(root, 'src'),
    root,
  ];
  let appRouter = false;
  for (const base of appRouterCandidates) {
    if (!fs.existsSync(base)) continue;
    if (hasGlob(base, 'app/**/page.*')) { appRouter = true; break; }
    if (hasGlob(base, '**/app/**/page.*')) { appRouter = true; break; }
  }
  if (!web.includes('next')) appRouter = false;

  const unknown = [];
  if (web.length === 0 && api.length === 0) {
    diag.warn('no known web or api framework detected');
  }

  return {
    web: web.length ? web : [],
    api: api.length ? api : [],
    monorepo,
    auth,
    appRouter,
    unknown,
    packages: packages.map((entry) => ({ dir: entry.dir, name: entry.pkg.name || null })),
  };
}

module.exports = { detectFrameworks };
