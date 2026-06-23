// src/__tests__/cli/context.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../client/websocket-client.js', () => {
  const MockWebSocketClient = vi.fn(function () {
    return {
      setAuthToken: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
      isConnected: vi.fn().mockReturnValue(false),
      getUrl: vi.fn().mockReturnValue('ws://localhost:3112/ws'),
      setUrl: vi.fn(),
      onTraceEvent: null,
      onStateUpdate: null,
      onAgentLoaded: null,
      onConnected: null,
      onDisconnected: null,
      onError: null,
      onInfo: null,
    };
  });
  return { WebSocketClient: MockWebSocketClient };
});

vi.mock('../../client/http-client.js', () => {
  const MockHttpClient = vi.fn(function () {
    return {
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3112'),
      setBaseUrl: vi.fn(),
      runtimeHealthCheck: vi.fn().mockResolvedValue({ reachable: true }),
    };
  });
  return { HttpClient: MockHttpClient };
});

vi.mock('../../client/auth-client.js', () => {
  const MockAuthenticate = vi.fn().mockResolvedValue({ token: 'test-jwt', method: 'stored_credentials' });
  return { authenticate: MockAuthenticate };
});

vi.mock('../../store/session-store.js', () => {
  const MockSessionStore = vi.fn(function () {
    return {};
  });
  return { SessionStore: MockSessionStore };
});

vi.mock('../../store/trace-store.js', () => {
  const MockTraceStore = vi.fn(function () {
    return {};
  });
  return { TraceStore: MockTraceStore };
});

import { buildCliContext } from '../../cli/context.js';
import { HttpClient } from '../../client/http-client.js';
import { WebSocketClient } from '../../client/websocket-client.js';

describe('buildCliContext', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('returns a DebugContext with all required fields', () => {
    const ctx = buildCliContext('http://localhost:3112');
    expect(ctx).toHaveProperty('wsClient');
    expect(ctx).toHaveProperty('httpClient');
    expect(ctx).toHaveProperty('sessionStore');
    expect(ctx).toHaveProperty('traceStore');
    expect(ctx).toHaveProperty('authenticate');
    expect(typeof ctx.authenticate).toBe('function');
  });

  test('uses AGENTS_URL env var when no serverUrl provided', () => {
    process.env.AGENTS_URL = 'https://agents.kore.ai';
    buildCliContext();
    expect(HttpClient).toHaveBeenCalledWith(
      expect.stringContaining('agents.kore.ai'),
    );
    delete process.env.AGENTS_URL;
  });

  test('uses provided serverUrl over env var', () => {
    process.env.AGENTS_URL = 'https://agents.kore.ai';
    buildCliContext('https://custom.example.com');
    expect(HttpClient).toHaveBeenCalledWith(
      expect.stringContaining('custom.example.com'),
    );
    delete process.env.AGENTS_URL;
  });

  test('authenticate function calls auth cascade', async () => {
    const { authenticate } = await import('../../client/auth-client.js');
    const ctx = buildCliContext('http://localhost:3112');
    await ctx.authenticate({ authToken: 'my-token' });
    expect(authenticate).toHaveBeenCalledWith(
      ctx.httpClient,
      ctx.wsClient,
      { authToken: 'my-token' },
    );
  });
});
