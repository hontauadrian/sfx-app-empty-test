'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  emitWebSocketFlows,
  buildSampleDataForEvent,
} = require('../flows-generator');

const {
  detectWebSocket,
  scanSources,
  parseGatewayFile,
  extractParamSchema,
  detectProjectTransport,
  detectAuthOnHandshake,
} = require('../detectors/websocket');

const {
  isAvailable,
  connect,
  send,
  expectEvent,
  close,
  WS_DEFAULT_TIMEOUT_MS,
} = require('../lib/ws-client');

// ---------------------------------------------------------------------------
// detectors/websocket.js — parseGatewayFile
// ---------------------------------------------------------------------------

test('parseGatewayFile: extracts NestJS @WebSocketGateway with path', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';

    @WebSocketGateway({ path: '/ws' })
    export class MyGateway {
      @SubscribeMessage('ping')
      handlePing() {}

      @SubscribeMessage('chat')
      handleChat() {}
    }
  `;
  const result = parseGatewayFile(content, 'src/gateways/my.gateway.ts');
  assert.ok(result);
  assert.ok(Array.isArray(result), 'parseGatewayFile must return an array');
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].path, '/ws');
  assert.strictEqual(result[0].transport, 'ws');
  assert.strictEqual(result[0].events.length, 2);
  assert.strictEqual(result[0].events[0].name, 'ping');
  assert.strictEqual(result[0].events[1].name, 'chat');
});

test('parseGatewayFile: extracts namespace', () => {
  const content = `
    import { WebSocketGateway } from '@nestjs/websockets';

    @WebSocketGateway({ namespace: 'events' })
    export class EventGateway {}
  `;
  const result = parseGatewayFile(content, 'src/event.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].namespace, 'events');
  assert.strictEqual(result[0].path, '/events');
});

test('parseGatewayFile: extracts port number', () => {
  const content = `
    import { WebSocketGateway } from '@nestjs/websockets';

    @WebSocketGateway(8080, { path: '/ws' })
    export class MyGateway {}
  `;
  const result = parseGatewayFile(content, 'src/my.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].port, 8080);
  assert.strictEqual(result[0].path, '/ws');
});

test('parseGatewayFile: detects socket.io transport', () => {
  const content = `
    import { WebSocketGateway } from '@nestjs/platform-socket.io';

    @WebSocketGateway()
    export class IoGateway {}
  `;
  const result = parseGatewayFile(content, 'src/io.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].transport, 'socket.io');
});

test('parseGatewayFile: detects graphql-ws transport', () => {
  const content = `
    import { createHandler } from 'graphql-ws';
    export const handler = createHandler({ schema });
  `;
  const result = parseGatewayFile(content, 'src/ws.ts');
  assert.ok(result);
  assert.strictEqual(result[0].transport, 'graphql-ws');
});

test('parseGatewayFile: detects @nestjs/platform-ws transport', () => {
  const content = `
    import { WebSocketGateway } from '@nestjs/platform-ws';

    @WebSocketGateway()
    export class WsGateway {}
  `;
  const result = parseGatewayFile(content, 'src/ws.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].transport, 'ws');
});

test('parseGatewayFile: bare @nestjs/websockets defaults to ws', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';

    @WebSocketGateway({ path: '/live' })
    export class LiveGateway {
      @SubscribeMessage('update')
      handleUpdate() {}
    }
  `;
  const result = parseGatewayFile(content, 'src/live.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].transport, 'ws');
  assert.strictEqual(result[0].path, '/live');
});

// ---------------------------------------------------------------------------
// detectors/websocket.js — detectProjectTransport
// ---------------------------------------------------------------------------

test('detectProjectTransport: detects @nestjs/platform-socket.io in package.json', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  const appsDir = path.join(tmpdir, 'apps', 'api');
  fs.mkdirSync(appsDir, { recursive: true });
  fs.writeFileSync(path.join(appsDir, 'package.json'), JSON.stringify({
    dependencies: { '@nestjs/platform-socket.io': '11.1.19' },
  }));
  const result = detectProjectTransport(tmpdir);
  assert.strictEqual(result, 'socket.io');
  fs.rmSync(tmpdir, { recursive: true });
});

test('detectProjectTransport: detects @nestjs/platform-ws in package.json', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  const appsDir = path.join(tmpdir, 'apps', 'api');
  fs.mkdirSync(appsDir, { recursive: true });
  fs.writeFileSync(path.join(appsDir, 'package.json'), JSON.stringify({
    dependencies: { '@nestjs/platform-ws': '11.1.19' },
  }));
  const result = detectProjectTransport(tmpdir);
  assert.strictEqual(result, 'ws');
  fs.rmSync(tmpdir, { recursive: true });
});

test('detectProjectTransport: returns null when no platform package', () => {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-test-'));
  const appsDir = path.join(tmpdir, 'apps', 'api');
  fs.mkdirSync(appsDir, { recursive: true });
  fs.writeFileSync(path.join(appsDir, 'package.json'), JSON.stringify({
    dependencies: { '@nestjs/websockets': '11.1.19' },
  }));
  const result = detectProjectTransport(tmpdir);
  assert.strictEqual(result, null);
  fs.rmSync(tmpdir, { recursive: true });
});

test('parseGatewayFile: returns null for non-gateway file', () => {
  const content = `
    export class NotAGateway {}
  `;
  const result = parseGatewayFile(content, 'src/service.ts');
  assert.strictEqual(result, null);
});

test('parseGatewayFile: returns null for bare socket.io import without @WebSocketGateway', () => {
  const content = `
    import { Server } from 'socket.io';
    const io = new Server(httpServer);
    io.on('connection', (socket) => { socket.emit('hello'); });
  `;
  const result = parseGatewayFile(content, 'src/socket-adapter.ts');
  assert.strictEqual(result, null, 'bare socket.io import without gateway decorator must return null');
});

test('parseGatewayFile: returns null for bare @nestjs/websockets import without @WebSocketGateway', () => {
  const content = `
    import { WsAdapter } from '@nestjs/websockets';
    export const adapter = new WsAdapter(app);
  `;
  const result = parseGatewayFile(content, 'src/ws-adapter.ts');
  assert.strictEqual(result, null, 'bare @nestjs/websockets import without gateway decorator must return null');
});

test('parseGatewayFile: multiple gateway classes in one file', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage, MessageBody } from '@nestjs/websockets';

    @WebSocketGateway({ path: '/ws/main' })
    export class MainGateway {
      @SubscribeMessage('ping')
      handlePing(@MessageBody() data: string) { return { event: 'pong', data }; }
    }

    @WebSocketGateway({ namespace: 'events' })
    export class EventsGateway {
      @SubscribeMessage('subscribe')
      handleSubscribe(@MessageBody() data: { channel: string }) {}

      @SubscribeMessage('unsubscribe')
      handleUnsubscribe(@MessageBody() data: { channel: string }) {}
    }

    @WebSocketGateway({ namespace: 'notifications' })
    export class NotificationsGateway {
      @SubscribeMessage('get-all')
      handleGetAll(@MessageBody() data: number) {}
    }
  `;
  const result = parseGatewayFile(content, 'src/multi.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result.length, 3, 'must detect 3 separate gateways');

  // Gateway 1: path-based
  assert.strictEqual(result[0].path, '/ws/main');
  assert.strictEqual(result[0].namespace, null);
  assert.strictEqual(result[0].events.length, 1);
  assert.strictEqual(result[0].events[0].name, 'ping');

  // Gateway 2: namespace events
  assert.strictEqual(result[1].path, '/events');
  assert.strictEqual(result[1].namespace, 'events');
  assert.strictEqual(result[1].events.length, 2);
  assert.strictEqual(result[1].events[0].name, 'subscribe');
  assert.strictEqual(result[1].events[1].name, 'unsubscribe');

  // Gateway 3: namespace notifications
  assert.strictEqual(result[2].path, '/notifications');
  assert.strictEqual(result[2].namespace, 'notifications');
  assert.strictEqual(result[2].events.length, 1);
  assert.strictEqual(result[2].events[0].name, 'get-all');
});

test('parseGatewayFile: skips decorators inside comments', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';
    // This is a comment: @WebSocketGateway({ path: '/fake' })
    // Also commented: @SubscribeMessage('fake-event')

    @WebSocketGateway({ path: '/real' })
    export class RealGateway {
      @SubscribeMessage('real-event')
      handleReal() {}
    }
  `;
  const result = parseGatewayFile(content, 'src/commented.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result.length, 1, 'must not count commented decorators');
  assert.strictEqual(result[0].path, '/real');
  assert.strictEqual(result[0].events.length, 1);
  assert.strictEqual(result[0].events[0].name, 'real-event');
});

test('parseGatewayFile: default path when no path or namespace', () => {
  const content = `
    import { WebSocketGateway } from '@nestjs/websockets';

    @WebSocketGateway()
    export class MyGateway {}
  `;
  const result = parseGatewayFile(content, 'src/my.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].path, '/');
});

// ---------------------------------------------------------------------------
// detectors/websocket.js — extractParamSchema
// ---------------------------------------------------------------------------

test('extractParamSchema: extracts @MessageBody typed param', () => {
  const content = `
    @SubscribeMessage('data')
    handleData(@MessageBody() payload: string) {}
  `;
  const result = extractParamSchema(content, 'data');
  assert.ok(result);
  assert.strictEqual(result.paramName, 'payload');
  assert.strictEqual(result.typeName, 'string');
});

test('extractParamSchema: returns null when no @MessageBody', () => {
  const content = `
    @SubscribeMessage('data')
    handleData(client: Socket) {}
  `;
  const result = extractParamSchema(content, 'data');
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// detectors/websocket.js — detectWebSocket
// ---------------------------------------------------------------------------

test('detectWebSocket: returns null for directory without gateways', () => {
  const result = detectWebSocket('/nonexistent/path', null);
  assert.strictEqual(result, null);
});

// ---------------------------------------------------------------------------
// lib/ws-client.js — basic tests (no live server)
// ---------------------------------------------------------------------------

test('ws-client: WS_DEFAULT_TIMEOUT_MS is 5000', () => {
  assert.strictEqual(WS_DEFAULT_TIMEOUT_MS, 5000);
});

test('ws-client: connect returns error when ws unavailable or bad URL', async () => {
  // If ws is installed but no server, connect should return error
  // If ws is not installed, returns stub error
  const { ws, error } = await connect('ws://127.0.0.1:59999/nonexistent');
  if (isAvailable()) {
    // ws installed but nothing listening
    assert.ok(error);
    assert.strictEqual(ws, null);
  } else {
    assert.ok(error);
    assert.strictEqual(ws, null);
    assert.ok(error.includes('ws library not installed'));
  }
});

test('ws-client: send returns error when ws is null', async () => {
  const { error } = await send(null, 'test');
  assert.ok(error);
  assert.ok(error.includes('not open'));
});

test('ws-client: expectEvent returns error when ws is null', async () => {
  const { messages, matched, error } = await expectEvent(null);
  assert.deepStrictEqual(messages, []);
  assert.strictEqual(matched, false);
  assert.ok(error);
  assert.ok(error.includes('not open'));
});

test('ws-client: close handles null ws gracefully', async () => {
  const { error } = await close(null);
  assert.strictEqual(error, null);
});

// ---------------------------------------------------------------------------
// flows-generator.js — buildSampleDataForEvent
// ---------------------------------------------------------------------------

test('buildSampleDataForEvent: no paramSchema returns empty object', () => {
  const result = buildSampleDataForEvent({ name: 'test', paramSchema: null });
  assert.deepStrictEqual(result, {});
});

test('buildSampleDataForEvent: string type returns string sample', () => {
  const result = buildSampleDataForEvent({
    name: 'test',
    paramSchema: { paramName: 'msg', typeName: 'string' },
  });
  assert.strictEqual(result, 'probe-sample');
});

test('buildSampleDataForEvent: number type returns number sample', () => {
  const result = buildSampleDataForEvent({
    name: 'test',
    paramSchema: { paramName: 'count', typeName: 'number' },
  });
  assert.strictEqual(result, 42);
});

test('buildSampleDataForEvent: boolean type returns true', () => {
  const result = buildSampleDataForEvent({
    name: 'test',
    paramSchema: { paramName: 'flag', typeName: 'boolean' },
  });
  assert.strictEqual(result, true);
});

test('buildSampleDataForEvent: unknown type returns probe object', () => {
  const result = buildSampleDataForEvent({
    name: 'test',
    paramSchema: { paramName: 'data', typeName: 'MyDto' },
  });
  assert.deepStrictEqual(result, { probe: true });
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitWebSocketFlows
// ---------------------------------------------------------------------------

test('emitWebSocketFlows: returns empty when no websocketGateways', () => {
  const matrix = { websocketGateways: null };
  const flows = emitWebSocketFlows(matrix);
  assert.strictEqual(flows.length, 0);
});

test('emitWebSocketFlows: returns empty when gateways empty', () => {
  const matrix = { websocketGateways: { gateways: [], gatewayFiles: [] } };
  const flows = emitWebSocketFlows(matrix);
  assert.strictEqual(flows.length, 0);
});

test('emitWebSocketFlows: emits connect flow for gateway with no events', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/test.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'ws',
        events: [],
      }],
      gatewayFiles: ['src/gateways/test.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  assert.strictEqual(flows.length, 1);
  assert.strictEqual(flows[0].id, 'ws:/ws:connect');
  assert.strictEqual(flows[0].contract.kind, 'ws-connect');
  assert.strictEqual(flows[0].steps.length, 2);
  assert.strictEqual(flows[0].steps[0].kind, 'ws-connect');
  assert.strictEqual(flows[0].steps[1].kind, 'ws-close');
});

test('emitWebSocketFlows: emits subscribe + disconnect flows per event', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/test.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'socket.io',
        events: [
          { name: 'ping', paramSchema: { paramName: 'data', typeName: 'string' } },
        ],
      }],
      gatewayFiles: ['src/gateways/test.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  // 1 connect + 1 subscribe + 1 disconnect = 3
  assert.strictEqual(flows.length, 3);

  const connectFlow = flows.find((f) => f.id === 'ws:/ws:connect');
  assert.ok(connectFlow);

  const subscribeFlow = flows.find((f) => f.id === 'ws:/ws:event:ping:subscribe');
  assert.ok(subscribeFlow);
  assert.strictEqual(subscribeFlow.contract.kind, 'ws-subscribe');
  assert.strictEqual(subscribeFlow.steps.length, 4);
  assert.strictEqual(subscribeFlow.steps[0].kind, 'ws-connect');
  assert.strictEqual(subscribeFlow.steps[1].kind, 'ws-send');
  assert.strictEqual(subscribeFlow.steps[1].event, 'ping');
  assert.strictEqual(subscribeFlow.steps[2].kind, 'ws-expect-event');
  assert.strictEqual(subscribeFlow.steps[2].eventName, undefined);
  assert.strictEqual(subscribeFlow.steps[3].kind, 'ws-close');

  const disconnectFlow = flows.find((f) => f.id === 'ws:/ws:event:ping:disconnect');
  assert.ok(disconnectFlow);
  assert.strictEqual(disconnectFlow.contract.kind, 'ws-disconnect');
  assert.strictEqual(disconnectFlow.steps.length, 3);
});

test('emitWebSocketFlows: multiple events generate separate flows', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/test.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'ws',
        events: [
          { name: 'ping', paramSchema: null },
          { name: 'chat', paramSchema: null },
        ],
      }],
      gatewayFiles: ['src/gateways/test.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  // 1 connect + 2*(subscribe + disconnect) = 5
  assert.strictEqual(flows.length, 5);
});

test('emitWebSocketFlows: multiple gateways generate separate flows', () => {
  const matrix = {
    websocketGateways: {
      gateways: [
        {
          file: 'src/a.gateway.ts',
          path: '/ws-a',
          namespace: null,
          port: null,
          transport: 'ws',
          events: [],
        },
        {
          file: 'src/b.gateway.ts',
          path: '/ws-b',
          namespace: null,
          port: null,
          transport: 'ws',
          events: [],
        },
      ],
      gatewayFiles: ['src/a.gateway.ts', 'src/b.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  // 2 gateways * 1 connect each = 2
  assert.strictEqual(flows.length, 2);
  assert.strictEqual(flows[0].id, 'ws:/ws-a:connect');
  assert.strictEqual(flows[1].id, 'ws:/ws-b:connect');
});

test('emitWebSocketFlows: subscribe flow uses correct sample data for typed param', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/test.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'ws',
        events: [
          { name: 'count', paramSchema: { paramName: 'n', typeName: 'number' } },
        ],
      }],
      gatewayFiles: ['src/gateways/test.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  const subscribeFlow = flows.find((f) => f.id === 'ws:/ws:event:count:subscribe');
  assert.ok(subscribeFlow);
  // ws-send step should have data = 42 (number type)
  const sendStep = subscribeFlow.steps.find((s) => s.kind === 'ws-send');
  assert.ok(sendStep);
  assert.strictEqual(sendStep.data, 42);
});

// ---------------------------------------------------------------------------
// detectors/websocket.js — detectAuthOnHandshake
// ---------------------------------------------------------------------------

test('detectAuthOnHandshake: detects @UseGuards on gateway class', () => {
  const block = `
    @UseGuards(WsJwtGuard)
    @WebSocketGateway({ path: '/ws' })
    export class AuthGateway {
      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  assert.strictEqual(detectAuthOnHandshake(block), true);
});

test('detectAuthOnHandshake: detects @UseGuards with multiple guards', () => {
  const block = `
    @WebSocketGateway({ path: '/ws' })
    @UseGuards(WsJwtGuard, RolesGuard)
    export class AuthGateway {
      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  assert.strictEqual(detectAuthOnHandshake(block), true);
});

test('detectAuthOnHandshake: returns false when no @UseGuards', () => {
  const block = `
    @WebSocketGateway({ path: '/ws' })
    export class PublicGateway {
      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  assert.strictEqual(detectAuthOnHandshake(block), false);
});

test('detectAuthOnHandshake: skips @UseGuards in single-line comments', () => {
  const block = `
    // @UseGuards(WsJwtGuard)
    @WebSocketGateway({ path: '/ws' })
    export class PublicGateway {
      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  assert.strictEqual(detectAuthOnHandshake(block), false);
});

test('detectAuthOnHandshake: detects @UseGuards on method inside class', () => {
  const block = `
    @WebSocketGateway({ path: '/ws' })
    export class MixedGateway {
      @UseGuards(WsAuthGuard)
      handleConnection(client: Socket) {}

      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  assert.strictEqual(detectAuthOnHandshake(block), true);
});

// ---------------------------------------------------------------------------
// detectors/websocket.js — parseGatewayFile: authRequired field
// ---------------------------------------------------------------------------

test('parseGatewayFile: sets authRequired true when @UseGuards present', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';
    import { UseGuards } from '@nestjs/common';

    @UseGuards(WsJwtGuard)
    @WebSocketGateway({ path: '/ws' })
    export class AuthGateway {
      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  const result = parseGatewayFile(content, 'src/auth.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].authRequired, true);
});

test('parseGatewayFile: sets authRequired false when no @UseGuards', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';

    @WebSocketGateway({ path: '/ws' })
    export class PublicGateway {
      @SubscribeMessage('ping')
      handlePing() {}
    }
  `;
  const result = parseGatewayFile(content, 'src/public.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result[0].authRequired, false);
});

test('parseGatewayFile: multi-gateway file — auth on one, not the other', () => {
  const content = `
    import { WebSocketGateway, SubscribeMessage } from '@nestjs/websockets';
    import { UseGuards } from '@nestjs/common';

    @UseGuards(WsJwtGuard)
    @WebSocketGateway({ path: '/ws/auth' })
    export class AuthGateway {
      @SubscribeMessage('secure-ping')
      handlePing() {}
    }

    @WebSocketGateway({ path: '/ws/public' })
    export class PublicGateway {
      @SubscribeMessage('public-ping')
      handlePing() {}
    }
  `;
  const result = parseGatewayFile(content, 'src/mixed.gateway.ts');
  assert.ok(result);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].authRequired, true, 'first gateway has @UseGuards');
  assert.strictEqual(result[1].authRequired, false, 'second gateway has no @UseGuards');
});

// ---------------------------------------------------------------------------
// flows-generator.js — emitWebSocketFlows: no-auth flow for guarded gateways
// ---------------------------------------------------------------------------

test('emitWebSocketFlows: emits :no-auth flow when gateway.authRequired is true', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/auth.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'ws',
        events: [],
        authRequired: true,
      }],
      gatewayFiles: ['src/gateways/auth.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  // 1 connect + 1 no-auth = 2
  assert.strictEqual(flows.length, 2);

  const noAuthFlow = flows.find((f) => f.id === 'ws:/ws:no-auth');
  assert.ok(noAuthFlow, 'must emit :no-auth flow');
  assert.strictEqual(noAuthFlow.contract.kind, 'ws-no-auth');
  assert.ok(noAuthFlow.contract.source.includes('@UseGuards'));
  assert.strictEqual(noAuthFlow.steps.length, 1);
  assert.strictEqual(noAuthFlow.steps[0].kind, 'ws-connect');
  assert.strictEqual(noAuthFlow.steps[0].expectReject, true);
  assert.strictEqual(noAuthFlow.steps[0].skipAuth, true);
});

test('emitWebSocketFlows: does NOT emit :no-auth flow when authRequired is false', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/public.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'ws',
        events: [],
        authRequired: false,
      }],
      gatewayFiles: ['src/gateways/public.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  // Only 1 connect, no :no-auth
  assert.strictEqual(flows.length, 1);
  const noAuthFlow = flows.find((f) => f.id.includes(':no-auth'));
  assert.strictEqual(noAuthFlow, undefined, 'must not emit :no-auth for public gateways');
});

test('emitWebSocketFlows: does NOT emit :no-auth flow when authRequired is undefined', () => {
  const matrix = {
    websocketGateways: {
      gateways: [{
        file: 'src/gateways/legacy.gateway.ts',
        path: '/ws',
        namespace: null,
        port: null,
        transport: 'ws',
        events: [],
      }],
      gatewayFiles: ['src/gateways/legacy.gateway.ts'],
    },
  };
  const flows = emitWebSocketFlows(matrix);
  assert.strictEqual(flows.length, 1);
  const noAuthFlow = flows.find((f) => f.id.includes(':no-auth'));
  assert.strictEqual(noAuthFlow, undefined, 'must not emit :no-auth when authRequired is absent');
});
