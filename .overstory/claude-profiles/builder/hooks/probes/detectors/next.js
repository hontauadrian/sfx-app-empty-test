'use strict';

const path = require('path');
const fs = require('fs');

const { walkFiles, readFileSafe } = require('../lib/fsutil');
const {
  stripGroupSegments,
  paramizeNextBrackets,
  normalizeLeadingSlash,
  extractRouteParams,
} = require('../lib/routeNormalize');
const { buildIdentityMap } = require('./page-identity');

// Declaration-driven auth guard detection for Next.js pages.
//
// A page's `guard` and `role` come from a sibling file `page.identity.{ext}`:
//
//   // apps/web/src/app/login/page.identity.ts
//   export const identity: PageIdentity = {
//     role: 'login-page',
//     guard: 'public',
//   };
//
// Replaces the old `// @routeGuard authenticated` comment and
// `export const routeGuard = 'authenticated'` export heuristics. Folder-name
// matching (e.g. (dashboard), (protected)) and function-call detection are
// also forbidden — projects must add explicit identity files.
//
// Spec: 2026-04-27 page-identity rewrite.

// Detects Next.js App Router + Pages Router pages and API routes.

function findAppDirs(root) {
  const dirs = [];
  const candidates = [
    path.join(root, 'app'),
    path.join(root, 'src', 'app'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      dirs.push(candidate);
    }
  }
  // Monorepo: apps/*/src/app and apps/*/app
  const appsRoot = path.join(root, 'apps');
  if (fs.existsSync(appsRoot)) {
    for (const entry of fs.readdirSync(appsRoot)) {
      const srcApp = path.join(appsRoot, entry, 'src', 'app');
      const directApp = path.join(appsRoot, entry, 'app');
      if (fs.existsSync(srcApp)) dirs.push(srcApp);
      if (fs.existsSync(directApp)) dirs.push(directApp);
    }
  }
  return dirs;
}

function findPagesDirs(root) {
  const dirs = [];
  const candidates = [
    path.join(root, 'pages'),
    path.join(root, 'src', 'pages'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      dirs.push(candidate);
    }
  }
  const appsRoot = path.join(root, 'apps');
  if (fs.existsSync(appsRoot)) {
    for (const entry of fs.readdirSync(appsRoot)) {
      const p = path.join(appsRoot, entry, 'pages');
      if (fs.existsSync(p)) dirs.push(p);
      const srcP = path.join(appsRoot, entry, 'src', 'pages');
      if (fs.existsSync(srcP)) dirs.push(srcP);
    }
  }
  return dirs;
}

function nextAppPageRoute(appDir, absFile) {
  const rel = path.relative(appDir, absFile).replace(/\\/g, '/');
  // Strip /page.ext
  const withoutPage = rel.replace(/\/page\.(tsx|jsx|ts|js)$/, '').replace(/^page\.(tsx|jsx|ts|js)$/, '');
  const withoutGroups = stripGroupSegments(withoutPage);
  const paramized = paramizeNextBrackets(withoutGroups);
  return normalizeLeadingSlash('/' + paramized);
}

function detectNextAppPages(root, diag) {
  const pages = [];
  const endpoints = [];
  const appDirs = findAppDirs(root);

  // Build the page-identity map up-front. Sibling page.identity.<ext> files
  // are the ONLY supported guard signal for the App Router.
  const identityMap = buildIdentityMap(appDirs, diag);

  let undeclaredCount = 0;

  for (const appDir of appDirs) {
    const files = walkFiles(appDir, { extensions: ['.tsx', '.jsx', '.ts', '.js'] });
    for (const file of files) {
      const baseName = path.basename(file);

      if (/^page\.(tsx|jsx|ts|js)$/.test(baseName)) {
        const route = nextAppPageRoute(appDir, file);
        const declared = identityMap.byRoute.get(route);
        const guard = declared ? declared.guard : 'unknown';
        const role = declared ? declared.role : null;
        if (!declared) undeclaredCount++;
        pages.push({
          file: path.relative(root, file),
          route,
          routeParams: extractRouteParams(route),
          framework: 'next-app',
          guard,
          role,
          unauthRedirect: null,
          postLoginRedirect: null,
          tokens: [],
          mustNotContain: [],
          changed: false,
        });
        continue;
      }

      if (/^route\.(ts|js|tsx|jsx)$/.test(baseName)) {
        const source = readFileSafe(file) || '';
        const methods = [];
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
          const exportRegex = new RegExp(`export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`);
          if (exportRegex.test(source)) methods.push(method);
        }
        const routePath = nextAppPageRoute(appDir, file).replace(/\/route$/, '');
        for (const method of methods) {
          endpoints.push({
            file: path.relative(root, file),
            method,
            path: routePath,
            framework: 'next-api',
            guard: 'unknown',
            inputSchemaRef: null,
            sampleValid: null,
            sampleInvalid: [],
            successStatus: defaultStatus(method),
            errorStatuses: [400, 500],
            changed: false,
          });
        }
      }
    }
  }

  if (undeclaredCount > 0) {
    diag.info(
      `PAGE_IDENTITY_UNDECLARED: ${undeclaredCount} Next.js page(s) have no sibling page.identity.{ts,tsx,js,jsx}. ` +
      'Add a sibling identity file declaring `export const identity = { role, guard }` to enable auth-boundary ' +
      'assertions. Pages without identity skip the auth-redirect check (probe runs the GET but does not ' +
      'assert public-vs-authenticated semantics).',
    );
  }

  diag.info(`next-app: ${pages.length} pages, ${endpoints.length} endpoints, ${identityMap.byRoute.size} identity files`);
  return { pages, endpoints, pageRoles: identityMap.byRole };
}

function detectNextPagesRouter(root, diag) {
  const pages = [];
  const endpoints = [];
  const pagesDirs = findPagesDirs(root);

  // Pages Router: identity files live next to the page file.
  // e.g. pages/login.tsx + pages/login.identity.ts
  const identityMap = buildIdentityMap(pagesDirs, diag);

  for (const pagesDir of pagesDirs) {
    const files = walkFiles(pagesDir, { extensions: ['.tsx', '.jsx', '.ts', '.js'] });
    for (const file of files) {
      const baseName = path.basename(file);
      if (baseName.startsWith('_')) continue;
      // Skip identity files themselves; they're consumed by buildIdentityMap.
      if (/\.identity\.(tsx|ts|jsx|js)$/.test(baseName)) continue;
      const rel = path.relative(pagesDir, file).replace(/\\/g, '/');

      if (rel.startsWith('api/')) {
        const apiRoute = '/api/' + rel.slice('api/'.length).replace(/\.(tsx|jsx|ts|js)$/, '');
        const routePath = normalizeLeadingSlash(paramizeNextBrackets(stripGroupSegments(apiRoute))
          .replace(/\/index$/, '') || '/');
        const source = readFileSafe(file) || '';
        const method = /export\s+default/.test(source) ? 'POST' : 'POST';
        endpoints.push({
          file: path.relative(root, file),
          method,
          path: routePath,
          framework: 'next-api',
          guard: 'unknown',
          inputSchemaRef: null,
          sampleValid: null,
          sampleInvalid: [],
          successStatus: 200,
          errorStatuses: [400, 500],
          changed: false,
        });
        continue;
      }

      const pageRoute = normalizeLeadingSlash(
        '/' + paramizeNextBrackets(stripGroupSegments(rel.replace(/\.(tsx|jsx|ts|js)$/, '')))
          .replace(/\/index$/, '') || '/'
      );

      const declared = identityMap.byRoute.get(pageRoute === '' ? '/' : pageRoute);
      pages.push({
        file: path.relative(root, file),
        route: pageRoute === '' ? '/' : pageRoute,
        routeParams: extractRouteParams(pageRoute),
        framework: 'next-pages',
        guard: declared ? declared.guard : 'unknown',
        role: declared ? declared.role : null,
        unauthRedirect: null,
        postLoginRedirect: null,
        tokens: [],
        mustNotContain: [],
        changed: false,
      });
    }
  }
  diag.info(`next-pages: ${pages.length} pages, ${endpoints.length} endpoints, ${identityMap.byRoute.size} identity files`);
  return { pages, endpoints, pageRoles: identityMap.byRole };
}

function defaultStatus(method) {
  if (method === 'POST') return 201;
  if (method === 'DELETE') return 204;
  return 200;
}

module.exports = { detectNextAppPages, detectNextPagesRouter };
