import { WebSocketClient } from '../client/websocket-client.js';
import { HttpClient } from '../client/http-client.js';
import { SessionStore } from '../store/session-store.js';
import { TraceStore } from '../store/trace-store.js';
import {
  authenticate as authCascade,
  type AuthOptions,
} from '../client/auth-client.js';
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

  return {
    wsClient,
    httpClient,
    sessionStore,
    traceStore,
    authenticate: (options?: AuthOptions) =>
      authCascade(httpClient, wsClient, options),
  };
}
