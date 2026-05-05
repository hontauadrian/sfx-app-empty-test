'use strict';

/**
 * detectors/websocket.js — WebSocket gateway detection for NestJS + socket.io + graphql-ws.
 *
 * Detection strategy:
 *   1. Source-scan: look for NestJS @WebSocketGateway() / @SubscribeMessage()
 *      decorators, socket.io server imports, or graphql-ws patterns.
 *   2. Extract gateway path, events (from @SubscribeMessage), and param types.
 *
 * Returns: { gateways: [{ path, namespace, events: [{name, paramSchema}] }] }
 *          or null if no WebSocket endpoint is detected.
 *
 * Mirror copies live in builder/lead/merger/reviewer/scout hooks/probes/.
 */

const fs = require('fs');
const path = require('path');

// NestJS WebSocket decorators
const WS_GATEWAY_RE = /@WebSocketGateway\s*\(/;
const SUBSCRIBE_MSG_RE = /@SubscribeMessage\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// socket.io server imports (platform-specific)
const SOCKETIO_IMPORT_RE = /from\s+['"](@nestjs\/platform-socket\.io|socket\.io)['"]/;

// NestJS base websockets module (transport-agnostic)
const NESTJS_WS_IMPORT_RE = /from\s+['"]@nestjs\/websockets['"]/;

// graphql-ws / subscriptions-transport-ws
const GRAPHQL_WS_RE = /from\s+['"](graphql-ws|subscriptions-transport-ws)['"]/;

// Gateway decorator path extraction:
// @WebSocketGateway({ path: '/ws' }) or @WebSocketGateway(3001, { path: '/ws' })
// or @WebSocketGateway({ namespace: 'events' })
const GATEWAY_PATH_RE = /@WebSocketGateway\s*\([^)]*path\s*:\s*['"]([^'"]+)['"]/;
const GATEWAY_NAMESPACE_RE = /@WebSocketGateway\s*\([^)]*namespace\s*:\s*['"]([^'"]+)['"]/;
const GATEWAY_PORT_RE = /@WebSocketGateway\s*\(\s*(\d+)/;

// @UseGuards on gateway class or handleConnection — indicates auth-on-handshake
const USE_GUARDS_RE = /@UseGuards\s*\(/;
const HANDLE_CONNECTION_RE = /handleConnection\s*\(/;

/**
 * Scan source files for WebSocket-related decorators/imports.
 * Returns { detected, gatewayFiles, gateways }.
 */
function scanSources(root) {
  const gatewayFiles = [];
  const gateways = [];
  const candidates = [
    path.join(root, 'apps', 'api', 'src'),
    path.join(root, 'src'),
  ];

  for (const dir of candidates) {
    if (!fs.existsSync(dir)) continue;
    walkDir(dir, (filePath) => {
      if (!/\.(ts|js)$/.test(filePath)) return;
      if (/node_modules|\.d\.ts$|\.test\.|\.spec\./.test(filePath)) return;
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        if (!WS_GATEWAY_RE.test(content) && !SOCKETIO_IMPORT_RE.test(content) && !GRAPHQL_WS_RE.test(content) && !NESTJS_WS_IMPORT_RE.test(content)) {
          return;
        }
        const relPath = path.relative(root, filePath);

        // Parse gateway details — returns array of gateways (one per class)
        const parsed = parseGatewayFile(content, relPath);
        if (parsed && parsed.length > 0) {
          gatewayFiles.push(relPath);
          for (const gw of parsed) {
            gateways.push(gw);
          }
        }
      } catch {
        // skip unreadable files
      }
    });
  }

  return {
    detected: gatewayFiles.length > 0,
    gatewayFiles,
    gateways,
  };
}

/**
 * Parse a gateway file to extract path, namespace, and events per class.
 *
 * A single file may contain multiple @WebSocketGateway() classes.
 * Returns an array of gateway objects — one per class boundary.
 * Legacy callers that expected a single object will receive array[0]
 * via the compatibility shim in scanSources().
 */
function parseGatewayFile(content, relPath) {
  const hasGateway = WS_GATEWAY_RE.test(content);
  const hasSocketIO = SOCKETIO_IMPORT_RE.test(content);
  const hasNestJSWS = NESTJS_WS_IMPORT_RE.test(content);
  const hasGraphQLWS = GRAPHQL_WS_RE.test(content);

  // Require @WebSocketGateway decorator OR graphql-ws import for a valid gateway.
  if (!hasGateway && !hasGraphQLWS) return null;

  // Determine file-level transport type
  let transport = 'unknown';
  if (hasGraphQLWS) transport = 'graphql-ws';
  else if (hasSocketIO) transport = 'socket.io';
  else if (hasGateway || hasNestJSWS) transport = 'ws';

  // Split file into per-class blocks at each @WebSocketGateway decorator.
  // Each block runs from one @WebSocketGateway to the next (or EOF).
  // Only match decorators NOT inside single-line comments (// ...).
  const gwSplitRe = /@WebSocketGateway\s*\(/g;
  const splitPositions = [];
  let splitMatch;
  while ((splitMatch = gwSplitRe.exec(content)) !== null) {
    // Check if this match is inside a single-line comment
    const lineStart = content.lastIndexOf('\n', splitMatch.index) + 1;
    const prefix = content.substring(lineStart, splitMatch.index);
    if (prefix.includes('//')) continue; // skip comment-embedded matches
    splitPositions.push(splitMatch.index);
  }

  // graphql-ws files may not have @WebSocketGateway — treat as single block
  if (splitPositions.length === 0) {
    const events = extractEventsFromBlock(content);
    const authRequired = detectAuthOnHandshake(content);
    return [{
      file: relPath,
      path: '/',
      namespace: null,
      port: null,
      transport,
      events,
      authRequired,
    }];
  }

  const gateways = [];
  for (let idx = 0; idx < splitPositions.length; idx++) {
    const blockStart = splitPositions[idx];
    const blockEnd = idx + 1 < splitPositions.length
      ? splitPositions[idx + 1]
      : content.length;
    const block = content.substring(blockStart, blockEnd);

    // Extract path, namespace, port from this block's decorator
    const pathMatch = block.match(GATEWAY_PATH_RE);
    const nsMatch = block.match(GATEWAY_NAMESPACE_RE);
    const portMatch = block.match(GATEWAY_PORT_RE);

    const wsPath = pathMatch ? pathMatch[1] : null;
    const namespace = nsMatch ? nsMatch[1] : null;
    const port = portMatch ? parseInt(portMatch[1], 10) : null;

    // Extract events scoped to this class block
    const events = extractEventsFromBlock(block);

    // Detect auth-on-handshake: @UseGuards on the gateway class or handleConnection.
    // Extend the search region backwards to capture class-level decorators
    // (e.g. @UseGuards) that appear before @WebSocketGateway.
    // For the first gateway, search back to file start.
    // For subsequent gateways, search back to the previous class's closing brace.
    let authSearchStart;
    if (idx === 0) {
      authSearchStart = 0;
    } else {
      const gapRegion = content.substring(splitPositions[idx - 1], splitPositions[idx]);
      const lastBrace = gapRegion.lastIndexOf('}');
      authSearchStart = lastBrace >= 0
        ? splitPositions[idx - 1] + lastBrace + 1
        : splitPositions[idx];
    }
    const extendedBlock = content.substring(authSearchStart, blockEnd);
    const authRequired = detectAuthOnHandshake(extendedBlock);

    gateways.push({
      file: relPath,
      path: wsPath || (namespace ? `/${namespace}` : '/'),
      namespace: namespace || null,
      port: port || null,
      transport,
      events,
      authRequired,
    });
  }

  return gateways;
}

/**
 * Detect @UseGuards on a gateway class block.
 *
 * Auth-on-handshake is indicated by @UseGuards() appearing in the class block.
 * NestJS applies gateway-level guards to the handshake (handleConnection).
 * We also detect explicit handleConnection() methods with @UseGuards() nearby.
 *
 * Only matches decorators NOT inside single-line comments.
 *
 * @param {string} block - source code block for a single gateway class
 * @returns {boolean}
 */
function detectAuthOnHandshake(block) {
  // Scan for @UseGuards that is NOT inside a single-line comment
  const guardRe = new RegExp(USE_GUARDS_RE.source, 'g');
  let match;
  while ((match = guardRe.exec(block)) !== null) {
    const lineStart = block.lastIndexOf('\n', match.index) + 1;
    const prefix = block.substring(lineStart, match.index);
    if (prefix.includes('//')) continue;
    return true;
  }
  return false;
}

/**
 * Extract @SubscribeMessage events from a source block.
 * Skips matches inside single-line comments.
 */
function extractEventsFromBlock(block) {
  const events = [];
  const msgRe = new RegExp(SUBSCRIBE_MSG_RE.source, 'g');
  let match;
  while ((match = msgRe.exec(block)) !== null) {
    // Skip comment-embedded matches
    const lineStart = block.lastIndexOf('\n', match.index) + 1;
    const prefix = block.substring(lineStart, match.index);
    if (prefix.includes('//')) continue;

    const eventName = match[1];
    const paramSchema = extractParamSchema(block, eventName);
    events.push({
      name: eventName,
      paramSchema,
    });
  }
  return events;
}

/**
 * Extract parameter schema for a @SubscribeMessage handler.
 * Looks for @MessageBody() typed parameter after the decorator.
 */
function extractParamSchema(content, eventName) {
  // Find the method that has @SubscribeMessage('eventName')
  const escapedName = eventName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const methodRe = new RegExp(
    `@SubscribeMessage\\s*\\(\\s*['"]${escapedName}['"]\\s*\\)[\\s\\S]*?@MessageBody\\s*\\(\\)\\s*(\\w+)\\s*:\\s*([^,)]+)`,
  );
  const match = content.match(methodRe);
  if (match) {
    return {
      paramName: match[1].trim(),
      typeName: match[2].trim(),
    };
  }
  return null;
}

function walkDir(dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      walkDir(full, cb);
    } else if (entry.isFile()) {
      cb(full);
    }
  }
}

/**
 * Detect project-level transport from package.json dependencies.
 *
 * NestJS selects the WS adapter based on which platform package is installed:
 *   - @nestjs/platform-socket.io → Socket.IO (default if present)
 *   - @nestjs/platform-ws → raw WebSocket
 *   - neither → Socket.IO (NestJS default)
 *
 * This overrides per-file transport detection for gateways that use
 * the base @nestjs/websockets decorators without explicit transport imports.
 *
 * @param {string} root - project root directory
 * @returns {'socket.io' | 'ws' | null}
 */
function detectProjectTransport(root) {
  const pkgPaths = [
    path.join(root, 'apps', 'api', 'package.json'),
    path.join(root, 'package.json'),
  ];

  for (const pkgPath of pkgPaths) {
    if (!fs.existsSync(pkgPath)) continue;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const allDeps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
      if (allDeps['@nestjs/platform-socket.io']) return 'socket.io';
      if (allDeps['@nestjs/platform-ws']) return 'ws';
    } catch {
      // skip unreadable package.json
    }
  }
  return null;
}

/**
 * Primary entry point.
 *
 * @param {string} root - project root directory
 * @param {object} [diag] - diagnostics logger
 * @returns {{ gateways: Array, gatewayFiles: string[] } | null}
 */
function detectWebSocket(root, diag) {
  const result = scanSources(root);

  if (!result.detected) {
    if (diag && typeof diag.info === 'function') {
      diag.info('websocket: no WebSocket gateways detected');
    }
    return null;
  }

  // Apply project-level transport override:
  // If a gateway detected as 'ws' (generic @nestjs/websockets) but the project
  // has @nestjs/platform-socket.io installed, the runtime transport is socket.io.
  const projectTransport = detectProjectTransport(root);
  if (projectTransport) {
    for (const gw of result.gateways) {
      if (gw.transport === 'ws' || gw.transport === 'unknown') {
        gw.transport = projectTransport;
      }
    }
  }

  if (diag && typeof diag.info === 'function') {
    const totalEvents = result.gateways.reduce((sum, g) => sum + g.events.length, 0);
    diag.info(
      `websocket: found ${result.gateways.length} gateway(s) with ${totalEvents} event(s) ` +
      `in ${result.gatewayFiles.length} file(s)` +
      (projectTransport ? ` (project transport: ${projectTransport})` : ''),
    );
  }

  return {
    gateways: result.gateways,
    gatewayFiles: result.gatewayFiles,
  };
}

module.exports = {
  detectWebSocket,
  // Exported for tests
  scanSources,
  parseGatewayFile,
  extractParamSchema,
  detectProjectTransport,
  detectAuthOnHandshake,
};
