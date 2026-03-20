/**
 * Auth Client
 *
 * Implements the authentication cascade for MCP debug tool:
 *   1. Explicit token (if provided)
 *   2. Stored credentials (~/.config/kore-platform/credentials)
 *   3. Device authorization flow (RFC 8628)
 */

import type { HttpClient } from './http-client.js';
import type { WebSocketClient } from './websocket-client.js';
import { readStoredCredentials, hasValidToken, hasRefreshToken } from './credentials.js';
import { fetchWithTimeout } from '../utils/fetch.js';

export interface AuthResult {
  token: string;
  method: 'explicit_token' | 'stored_credentials' | 'device_auth' | 'device_auth_pending';
  message?: string;
  /** Present when method is 'device_auth_pending' — pass back to complete auth */
  deviceCode?: string;
  /** Verification URL for the user to visit */
  verificationUrl?: string;
  /** User-friendly code to display */
  userCode?: string;
}

export interface AuthOptions {
  /** Explicit token to use directly */
  authToken?: string;
  /** Skip stored credentials check */
  skipStoredCredentials?: boolean;
  /** Device code from a previous initiation — skip straight to polling */
  deviceCode?: string;
  /** Max time to poll for device auth completion (default: 60s) */
  pollTimeoutMs?: number;
}

/** Set token on both HTTP and WS clients. */
function setTokenOnClients(httpClient: HttpClient, wsClient: WebSocketClient, token: string): void {
  httpClient.setAuthToken(token);
  wsClient.setAuthToken(token);
}

/**
 * Authenticate using the cascade:
 *   explicit token → stored credentials → device auth
 *
 * Sets the token on both HTTP and WS clients on success.
 */
export async function authenticate(
  httpClient: HttpClient,
  wsClient: WebSocketClient,
  options: AuthOptions = {},
): Promise<AuthResult> {
  const baseUrl = httpClient.getBaseUrl();

  // 1. Explicit token
  if (options.authToken) {
    setTokenOnClients(httpClient, wsClient, options.authToken);
    return { token: options.authToken, method: 'explicit_token' };
  }

  // 2. Stored credentials
  if (!options.skipStoredCredentials) {
    const result = await tryStoredCredentials(httpClient, wsClient, baseUrl);
    if (result) return result;
  }

  // 3. Device auth — if deviceCode provided, poll for completion; otherwise initiate only
  if (options.deviceCode) {
    return await pollDeviceAuth(
      httpClient,
      wsClient,
      baseUrl,
      options.deviceCode,
      options.pollTimeoutMs,
    );
  }

  // Initiate device auth and return immediately with the URL (no polling)
  return await initiateDeviceAuth(baseUrl);
}

/**
 * Try to use stored credentials from ~/.kore-platform/credentials.
 */
async function tryStoredCredentials(
  httpClient: HttpClient,
  wsClient: WebSocketClient,
  baseUrl: string,
): Promise<AuthResult | null> {
  try {
    const creds = readStoredCredentials();
    if (!creds) return null;

    // If token is still valid, use it directly
    if (hasValidToken(creds)) {
      setTokenOnClients(httpClient, wsClient, creds.token);
      console.error('[MCP Debug] Using stored credentials');
      return { token: creds.token, method: 'stored_credentials' };
    }

    // If expired but has refresh token, try to refresh
    if (hasRefreshToken(creds) && creds.refreshToken) {
      try {
        const response = await fetchWithTimeout(`${baseUrl}/api/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: creds.refreshToken }),
        });

        if (response.ok) {
          const data = (await response.json()) as { accessToken: string };
          setTokenOnClients(httpClient, wsClient, data.accessToken);
          console.error('[MCP Debug] Refreshed stored credentials');
          return { token: data.accessToken, method: 'stored_credentials' };
        }
      } catch (err) {
        console.error(
          '[MCP Debug] Token refresh failed:',
          err instanceof Error ? err.message : err,
        );
        // Refresh failed, fall through to device auth
      }
    }
  } catch (err) {
    console.error(
      '[MCP Debug] Credential reading failed:',
      err instanceof Error ? err.message : err,
    );
    // Credential reading failed, fall through to device auth
  }

  return null;
}

/**
 * Initiate device authorization (RFC 8628) and return immediately.
 * Does NOT poll — returns the verification URL for the MCP client to show to the user.
 */
async function initiateDeviceAuth(baseUrl: string): Promise<AuthResult> {
  const initResponse = await fetchWithTimeout(`${baseUrl}/api/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scopes: ['read_traces', 'read_state', 'subscribe'] }),
  });

  if (!initResponse.ok) {
    const errorText = await initResponse.text().catch(() => 'Unknown error');
    throw new DeviceAuthError(
      `Failed to initiate device authorization (${initResponse.status}): ${errorText}. ` +
        `The runtime server may not have device auth enabled.`,
    );
  }

  const deviceAuth = (await initResponse.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  };

  const authMessage =
    `Authorization required. Please visit this URL to approve:\n\n` +
    `   ${deviceAuth.verification_uri_complete}\n\n` +
    `   Or enter code: ${deviceAuth.user_code}\n\n` +
    `After approving, call platform_connect again with the same serverUrl and deviceCode to complete authentication.`;

  console.error(`[MCP Debug] Device auth initiated: ${deviceAuth.verification_uri_complete}`);

  return {
    token: '',
    method: 'device_auth_pending',
    message: authMessage,
    deviceCode: deviceAuth.device_code,
    verificationUrl: deviceAuth.verification_uri_complete,
    userCode: deviceAuth.user_code,
  };
}

const DEFAULT_POLL_TIMEOUT_MS = 60_000; // 60 seconds

/**
 * Poll for device auth completion. Called on the second platform_connect call
 * after the user has (hopefully) approved in the browser.
 */
async function pollDeviceAuth(
  httpClient: HttpClient,
  wsClient: WebSocketClient,
  baseUrl: string,
  deviceCode: string,
  pollTimeoutMs?: number,
): Promise<AuthResult> {
  const timeout = pollTimeoutMs || DEFAULT_POLL_TIMEOUT_MS;
  const pollInterval = 3_000; // 3 seconds between polls
  const expiresAt = Date.now() + timeout;

  while (Date.now() < expiresAt) {
    try {
      const tokenResponse = await fetchWithTimeout(`${baseUrl}/api/auth/device/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_code: deviceCode }),
      });

      if (tokenResponse.ok) {
        const tokenData = (await tokenResponse.json()) as {
          access_token: string;
          refresh_token?: string;
          expires_in: number;
        };

        setTokenOnClients(httpClient, wsClient, tokenData.access_token);
        console.error('[MCP Debug] Authenticated via device authorization');

        return {
          token: tokenData.access_token,
          method: 'device_auth',
        };
      }

      // Check error type
      const errorData = (await tokenResponse.json().catch(() => ({}))) as { error?: string };

      if (errorData.error === 'authorization_pending') {
        await sleep(pollInterval);
        continue;
      }

      if (errorData.error === 'slow_down') {
        await sleep(pollInterval * 2);
        continue;
      }

      if (errorData.error === 'expired_token') {
        throw new DeviceAuthError(
          'Device authorization expired. Please run platform_connect again to start a new flow.',
        );
      }

      throw new DeviceAuthError(
        `Device authorization failed: ${errorData.error || 'unknown error'}`,
      );
    } catch (e) {
      if (e instanceof DeviceAuthError) throw e;
      console.error('[MCP Debug] Token polling error:', e instanceof Error ? e.message : e);
      await sleep(pollInterval);
      continue;
    }
  }

  throw new DeviceAuthError(
    'Device authorization not yet approved (timed out waiting). ' +
      'Please approve in the browser, then call platform_connect again with the same deviceCode.',
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class DeviceAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeviceAuthError';
  }
}
