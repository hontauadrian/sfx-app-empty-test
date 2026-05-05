'use strict';

const { detectNextAppPages, detectNextPagesRouter } = require('./next');
const { detectNuxt } = require('./nuxt');
const { detectSvelteKit } = require('./sveltekit');
const { detectRemix } = require('./remix');
const { detectAstro } = require('./astro');

// Dispatch across web frameworks; aggregates pages + any page-attached endpoints.
function derivePages(root, frameworks, diag) {
  const pages = [];
  const extraEndpoints = [];
  /** @type {Record<string, string>} */
  const pageRoles = {};
  const web = frameworks.web || [];

  if (web.includes('next')) {
    safeCall(diag, 'next-app', () => {
      const result = detectNextAppPages(root, diag);
      pages.push(...result.pages);
      extraEndpoints.push(...result.endpoints);
      mergePageRoles(pageRoles, result.pageRoles, diag);
    });
    safeCall(diag, 'next-pages', () => {
      const result = detectNextPagesRouter(root, diag);
      pages.push(...result.pages);
      extraEndpoints.push(...result.endpoints);
      mergePageRoles(pageRoles, result.pageRoles, diag);
    });
  }
  if (web.includes('nuxt')) {
    safeCall(diag, 'nuxt', () => {
      const result = detectNuxt(root, diag);
      pages.push(...result.pages);
      extraEndpoints.push(...result.endpoints);
    });
  }
  if (web.includes('sveltekit')) {
    safeCall(diag, 'sveltekit', () => {
      const result = detectSvelteKit(root, diag);
      pages.push(...result.pages);
      extraEndpoints.push(...result.endpoints);
    });
  }
  if (web.includes('remix')) {
    safeCall(diag, 'remix', () => {
      const result = detectRemix(root, diag);
      pages.push(...result.pages);
    });
  }
  if (web.includes('astro')) {
    safeCall(diag, 'astro', () => {
      const result = detectAstro(root, diag);
      pages.push(...result.pages);
      extraEndpoints.push(...result.endpoints);
    });
  }

  return { pages, extraEndpoints, pageRoles };
}

/**
 * Merge per-framework pageRoles into the aggregated map. If two frameworks
 * declare the same role on different routes, emit PAGE_ROLE_AMBIGUOUS and
 * drop the conflicting role (NEVER HEURISTIC rule — refuse to pick).
 */
function mergePageRoles(target, incoming, diag) {
  if (!incoming) return;
  for (const [role, route] of Object.entries(incoming)) {
    if (target[role] && target[role] !== route) {
      diag.warn(
        `PAGE_ROLE_AMBIGUOUS: role "${role}" claimed across frameworks: ${target[role]} vs ${route}. ` +
        'Probe will not infer which one to use.',
      );
      delete target[role];
      continue;
    }
    target[role] = route;
  }
}

function safeCall(diag, label, fn) {
  try { fn(); } catch (err) { diag.recordDetectorError(label, err); }
}

module.exports = { derivePages };
