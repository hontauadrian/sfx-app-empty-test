'use strict';

// Route normalization utilities.
// Spec: plan 02 §1 — lib/routeNormalize.js

function stripGroupSegments(routeWithSlashes) {
  // Next.js App Router: (group) segments are layout-only; strip them.
  return routeWithSlashes
    .split('/')
    .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
    .join('/');
}

function paramizeNextBrackets(routeWithSlashes) {
  // [param] → :param  ; [[param]] → :param?  ; [...param] → *param
  return routeWithSlashes
    .replace(/\[\[\.\.\.(\w+)\]\]/g, '*:$1?')
    .replace(/\[\.\.\.(\w+)\]/g, '*:$1')
    .replace(/\[\[(\w+)\]\]/g, ':$1?')
    .replace(/\[(\w+)\]/g, ':$1');
}

function paramizeDollar(routeWithSlashes) {
  // Remix: $param → :param, $ → * (splat)
  return routeWithSlashes.replace(/\$(\w+)/g, ':$1').replace(/\/\$$/g, '/*');
}

function paramizeUnderscore(routeWithSlashes) {
  // Nuxt: _param → :param
  return routeWithSlashes.replace(/(^|\/)_(\w+)/g, '$1:$2');
}

function normalizeLeadingSlash(routeWithSlashes) {
  if (!routeWithSlashes) return '/';
  let value = routeWithSlashes.startsWith('/') ? routeWithSlashes : '/' + routeWithSlashes;
  if (value.length > 1 && value.endsWith('/')) value = value.slice(0, -1);
  return value || '/';
}

function extractRouteParams(normalizedRoute) {
  const params = [];
  const regex = /(?::|\*:)(\w+)\??/g;
  let match = regex.exec(normalizedRoute);
  while (match) {
    params.push(match[1]);
    match = regex.exec(normalizedRoute);
  }
  return params;
}

function normalizeRoutePath(routeRaw) {
  return normalizeLeadingSlash(routeRaw || '/');
}

module.exports = {
  stripGroupSegments,
  paramizeNextBrackets,
  paramizeDollar,
  paramizeUnderscore,
  normalizeLeadingSlash,
  extractRouteParams,
  normalizeRoutePath,
};
