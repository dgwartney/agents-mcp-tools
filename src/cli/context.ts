import { WebSocketClient } from '../client/websocket-client.js';
import { HttpClient } from '../client/http-client.js';
import { SessionStore } from '../store/session-store.js';
import { TraceStore } from '../store/trace-store.js';
import {
  authenticate as authCascade,
  type AuthOptions,
} from '../client/auth-client.js';
import { readStoredCredentials, hasValidToken } from '../client/credentials.js';
import { deriveUrls } from '../utils/url.js';
import type { DebugContext } from '../tools/index.js';

export function buildCliContext(serverUrl?: string): DebugContext {
  const effectiveUrl = serverUrl ?? process.env.AGENTS_URL;
  const { wsUrl, httpUrl } = effectiveUrl
    ? deriveUrls(effectiveUrl)
    : { wsUrl: undefined, httpUrl: undefined };

  const httpClient = new HttpClient(httpUrl ?? '');
  const wsClient = new WebSocketClient({ url: wsUrl, reconnect: false });
  const sessionStore = new SessionStore();
  const traceStore = new TraceStore();

  // Pre-populate auth token from stored credentials so platform commands work
  // immediately without requiring an explicit `agentcl platform connect` each time.
  // Silent — never triggers browser auth; use `agentcl platform connect` for that.
  const stored = readStoredCredentials();
  if (stored && hasValidToken(stored)) {
    httpClient.setAuthToken(stored.token);
    wsClient.setAuthToken(stored.token);
  }

  return {
    wsClient,
    httpClient,
    sessionStore,
    traceStore,
    authenticate: (options?: AuthOptions) =>
      authCascade(httpClient, wsClient, options),
  };
}
