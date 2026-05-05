'use strict';

// Merges detector output with a compiled runtime contract + overlay.
// Spec: plan 02 §5 — merge rules.

const { normalizeRoutePath } = require('./routeNormalize');

function makePageKey(entry) {
  return normalizeRoutePath(entry.route || entry.path || '');
}

function makeEndpointKey(entry) {
  const method = String(entry.method || 'GET').toUpperCase();
  const routePath = normalizeRoutePath(entry.path || entry.route || '');
  return `${method} ${routePath}`;
}

function mergeByKey(detected, fromManifest, keyFn, strategy) {
  // compiled-manifest wins per plan 02; overlay stamps tokens/mustNotContain.
  const map = new Map();
  for (const entry of detected) {
    map.set(keyFn(entry), { ...entry });
  }
  for (const entry of fromManifest || []) {
    const key = keyFn(entry);
    if (map.has(key)) {
      const base = map.get(key);
      map.set(key, strategy(base, entry));
    } else {
      map.set(key, { ...entry, fromManifest: true });
    }
  }
  return Array.from(map.values());
}

function mergeEntries(detector, manifest) {
  const compiled = manifest && manifest.compiled ? manifest.compiled : {};
  const overlay  = manifest && manifest.overlay  ? manifest.overlay  : {};

  const pagesMerged = mergeByKey(
    detector.pages || [],
    compiled.routes || [],
    makePageKey,
    (base, incoming) => ({
      ...base,
      guard: incoming.guard || incoming.auth || base.guard,
      requestSchema: incoming.requestSchema || base.requestSchema,
      responses: incoming.responses || base.responses,
      sourceFiles: incoming.sourceFiles || base.sourceFiles,
      fromManifest: true,
    })
  );

  const endpointsMerged = mergeByKey(
    detector.endpoints || [],
    compiled.endpoints || [],
    makeEndpointKey,
    (base, incoming) => ({
      ...base,
      guard: incoming.guard || incoming.auth || base.guard,
      inputSchemaRef: incoming.requestSchema || incoming.inputSchemaRef || base.inputSchemaRef,
      sampleValid: incoming.sampleValid ?? base.sampleValid,
      sampleInvalid: incoming.sampleInvalid ?? base.sampleInvalid,
      successStatus: incoming.successStatus ?? base.successStatus,
      errorStatuses: incoming.errorStatuses ?? base.errorStatuses,
      fromManifest: true,
    })
  );

  // Apply overlay tokens / mustNotContain / unauthBehavior onto pages.
  // Schema: overlay.routes is an object keyed by route-path.
  const orphanOverlayRoutes = [];
  const overlayRoutes =
    overlay.routes && typeof overlay.routes === 'object' && !Array.isArray(overlay.routes)
      ? overlay.routes
      : {};
  for (const [routeKey, overlayRoute] of Object.entries(overlayRoutes)) {
    if (!overlayRoute || typeof overlayRoute !== 'object') continue;
    const key = makePageKey({ route: routeKey });
    const hit = pagesMerged.find((entry) => makePageKey(entry) === key);
    if (!hit) {
      orphanOverlayRoutes.push(key);
      continue;
    }
    if (Array.isArray(overlayRoute.tokens)) {
      hit.tokens = Array.from(new Set([...(hit.tokens || []), ...overlayRoute.tokens]));
    }
    if (Array.isArray(overlayRoute.mustNotContain)) {
      hit.mustNotContain = Array.from(new Set([...(hit.mustNotContain || []), ...overlayRoute.mustNotContain]));
    }
    if (overlayRoute.unauthBehavior) {
      hit.unauthBehavior = overlayRoute.unauthBehavior;
    }
  }

  const flows = Array.isArray(overlay.flows) ? overlay.flows : [];

  return {
    pages: pagesMerged,
    endpoints: endpointsMerged,
    middleware: detector.middleware || [],
    forms: detector.forms || [],
    auth: detector.auth || null,
    flows,
    orphanOverlayRoutes,
  };
}

module.exports = { mergeEntries, makePageKey, makeEndpointKey };
