'use strict';

const path = require('path');

const { walkFiles, readFileSafe } = require('../lib/fsutil');
const { normalizeLeadingSlash, extractRouteParams } = require('../lib/routeNormalize');

// Fastify detector.
// Spec: plan 02 §4.9.
const METHOD_CALL = /fastify\.(get|post|put|patch|delete|options|head)\s*\(\s*(['"`])([^'"`]+)\2(?:\s*,\s*(\{[\s\S]*?\}))?/g;
const ROUTE_CALL  = /fastify\.route\s*\(\s*\{\s*method:\s*(['"`])(\w+)\1\s*,\s*url:\s*(['"`])([^'"`]+)\3/g;

function detectFastify(root, diag) {
  const endpoints = [];
  const files = walkFiles(root, { extensions: ['.js', '.ts', '.mjs', '.cjs'] });
  for (const file of files) {
    if (file.includes(path.sep + 'node_modules' + path.sep)) continue;
    const source = readFileSafe(file);
    if (!source) continue;
    let match = METHOD_CALL.exec(source);
    while (match) {
      const httpMethod = match[1].toUpperCase();
      const routePath = normalizeLeadingSlash(match[3]);
      const optsBlock = match[4] || '';
      const schemaMatch = optsBlock.match(/schema\s*:\s*(\{[\s\S]*\})/);
      endpoints.push(makeEntry(root, file, httpMethod, routePath, schemaMatch ? 'inline' : null));
      match = METHOD_CALL.exec(source);
    }
    let routeMatch = ROUTE_CALL.exec(source);
    while (routeMatch) {
      const httpMethod = routeMatch[2].toUpperCase();
      const routePath = normalizeLeadingSlash(routeMatch[4]);
      endpoints.push(makeEntry(root, file, httpMethod, routePath, null));
      routeMatch = ROUTE_CALL.exec(source);
    }
  }
  diag.info(`fastify: ${endpoints.length} endpoints`);
  return { pages: [], endpoints };
}

function makeEntry(root, file, method, routePath, inputSchemaRef) {
  return {
    file: path.relative(root, file),
    method,
    path: routePath,
    framework: 'fastify',
    guard: 'unknown',
    inputSchemaRef,
    sampleValid: null,
    sampleInvalid: [],
    successStatus: method === 'POST' ? 201 : 200,
    errorStatuses: [400, 500],
    changed: false,
    routeParams: extractRouteParams(routePath),
  };
}

module.exports = { detectFastify };
