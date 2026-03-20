/**
 * Tests for auth-client — authenticate cascade
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { authenticate, DeviceAuthError } from '../client/auth-client.js';
import type { HttpClient } from '../client/http-client.js';
import type { WebSocketClient } from '../client/websocket-client.js';

// Mock credentials module
vi.mock('../client/credentials.js', () => ({
  readStoredCredentials: vi.fn(),
  hasValidToken: vi.fn(),
  hasRefreshToken: vi.fn(),
}));

import { readStoredCredentials, hasValidToken, hasRefreshToken } from '../client/credentials.js';

const originalFetch = globalThis.fetch;

// =============================================================================
// Shared helpers
// =============================================================================

function createMockClients() {
  return {
    httpClient: {
      setAuthToken: vi.fn(),
      getBaseUrl: vi.fn().mockReturnValue('http://localhost:3112'),
    } as unknown as HttpClient,
    wsClient: {
      setAuthToken: vi.fn(),
    } as unknown as WebSocketClient,
  };
}

/** Standard device auth initiation response (fast interval for tests) */
function deviceAuthInitResponse(overrides?: Record<string, unknown>) {
  return {
    device_code: 'dc-123',
    user_code: 'ABCD-1234',
    verification_uri: 'http://localhost:5173/auth/device',
    verification_uri_complete: 'http://localhost:5173/auth/device?code=ABCD-1234',
    expires_in: 900,
    interval: 0.05,
    ...overrides,
  };
}

/** Standard successful token response */
function deviceTokenResponse(overrides?: Record<string, unknown>) {
  return {
    access_token: 'device-jwt',
    refresh_token: 'device-refresh',
    expires_in: 86400,
    ...overrides,
  };
}

/**
 * Create a fetch mock for device auth flow.
 */
function mockDeviceAuthFetch(tokenHandler?: (url: string) => unknown) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/api/auth/device') && !url.includes('/token')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(deviceAuthInitResponse()) });
    }
    if (url.includes('/device/token')) {
      if (tokenHandler) return tokenHandler(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve(deviceTokenResponse()) });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

// =============================================================================
// Tests
// =============================================================================

describe('authenticate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readStoredCredentials).mockReturnValue(null);
    vi.mocked(hasValidToken).mockReturnValue(false);
    vi.mocked(hasRefreshToken).mockReturnValue(false);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // =========================================================================
  // 1. Explicit token
  // =========================================================================

  describe('explicit token', () => {
    test('uses authToken directly and sets on both clients', async () => {
      const { httpClient, wsClient } = createMockClients();

      const result = await authenticate(httpClient, wsClient, { authToken: 'my-jwt' });

      expect(result).toMatchObject({ method: 'explicit_token', token: 'my-jwt' });
      expect(httpClient.setAuthToken).toHaveBeenCalledWith('my-jwt');
      expect(wsClient.setAuthToken).toHaveBeenCalledWith('my-jwt');
    });

    test('skips all other methods', async () => {
      const { httpClient, wsClient } = createMockClients();
      await authenticate(httpClient, wsClient, { authToken: 'my-jwt' });
      expect(readStoredCredentials).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 2. Stored credentials
  // =========================================================================

  describe('stored credentials', () => {
    test('uses stored token when valid', async () => {
      const { httpClient, wsClient } = createMockClients();
      vi.mocked(readStoredCredentials).mockReturnValue({
        token: 'stored-jwt',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      vi.mocked(hasValidToken).mockReturnValue(true);

      const result = await authenticate(httpClient, wsClient);

      expect(result).toMatchObject({ method: 'stored_credentials', token: 'stored-jwt' });
      expect(httpClient.setAuthToken).toHaveBeenCalledWith('stored-jwt');
    });

    test('refreshes expired token when refreshToken exists', async () => {
      const { httpClient, wsClient } = createMockClients();
      vi.mocked(readStoredCredentials).mockReturnValue({
        token: 'expired-jwt',
        expiresAt: '2020-01-01T00:00:00.000Z',
        refreshToken: 'refresh-abc',
      });
      vi.mocked(hasValidToken).mockReturnValue(false);
      vi.mocked(hasRefreshToken).mockReturnValue(true);

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ accessToken: 'refreshed-jwt' }),
      });

      const result = await authenticate(httpClient, wsClient);

      expect(result).toMatchObject({ method: 'stored_credentials', token: 'refreshed-jwt' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'http://localhost:3112/api/auth/refresh',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    test('falls through to device auth initiation when expired and no refresh token', async () => {
      const { httpClient, wsClient } = createMockClients();
      vi.mocked(readStoredCredentials).mockReturnValue({
        token: 'expired-jwt',
        expiresAt: '2020-01-01T00:00:00.000Z',
      });
      vi.mocked(hasValidToken).mockReturnValue(false);
      vi.mocked(hasRefreshToken).mockReturnValue(false);

      globalThis.fetch = mockDeviceAuthFetch();

      const result = await authenticate(httpClient, wsClient);
      expect(result.method).toBe('device_auth_pending');
      expect(result.deviceCode).toBe('dc-123');
      expect(result.verificationUrl).toContain('/auth/device?code=ABCD-1234');
    });

    test('skipped when skipStoredCredentials is true', async () => {
      const { httpClient, wsClient } = createMockClients();
      vi.mocked(readStoredCredentials).mockReturnValue({
        token: 'stored-jwt',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });

      globalThis.fetch = mockDeviceAuthFetch();

      const result = await authenticate(httpClient, wsClient, { skipStoredCredentials: true });
      expect(readStoredCredentials).not.toHaveBeenCalled();
      expect(result.method).toBe('device_auth_pending');
    });
  });

  // =========================================================================
  // 3. Device auth
  // =========================================================================

  describe('device auth', () => {
    test('returns device_auth_pending with verification URL on first call (no deviceCode)', async () => {
      const { httpClient, wsClient } = createMockClients();
      globalThis.fetch = mockDeviceAuthFetch();

      const result = await authenticate(httpClient, wsClient);
      expect(result).toMatchObject({
        method: 'device_auth_pending',
        token: '',
        deviceCode: 'dc-123',
        userCode: 'ABCD-1234',
      });
      expect(result.verificationUrl).toContain('/auth/device?code=ABCD-1234');
      expect(result.message).toContain('Authorization required');
      // Should NOT have set tokens on clients (auth not complete)
      expect(httpClient.setAuthToken).not.toHaveBeenCalled();
      expect(wsClient.setAuthToken).not.toHaveBeenCalled();
    });

    test('completes device auth when deviceCode is provided (second call)', async () => {
      const { httpClient, wsClient } = createMockClients();
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/device/token')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(deviceTokenResponse()) });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await authenticate(httpClient, wsClient, { deviceCode: 'dc-123' });
      expect(result).toMatchObject({ method: 'device_auth', token: 'device-jwt' });
      expect(httpClient.setAuthToken).toHaveBeenCalledWith('device-jwt');
      expect(wsClient.setAuthToken).toHaveBeenCalledWith('device-jwt');
    });

    test('throws DeviceAuthError when initiation fails', async () => {
      const { httpClient, wsClient } = createMockClients();
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/api/auth/device')) {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: () => Promise.resolve('Internal Server Error'),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(authenticate(httpClient, wsClient)).rejects.toThrow(DeviceAuthError);
    });

    test('throws DeviceAuthError when device code expires during polling', async () => {
      const { httpClient, wsClient } = createMockClients();
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/device/token')) {
          return Promise.resolve({
            ok: false,
            status: 410,
            json: () => Promise.resolve({ error: 'expired_token' }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      await expect(authenticate(httpClient, wsClient, { deviceCode: 'dc-123' })).rejects.toThrow(
        'expired',
      );
    });

    test('polls until authorized when deviceCode provided', async () => {
      vi.useFakeTimers();
      const { httpClient, wsClient } = createMockClients();
      let pollCount = 0;

      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/device/token')) {
          pollCount++;
          if (pollCount < 3) {
            return Promise.resolve({
              ok: false,
              status: 428,
              json: () => Promise.resolve({ error: 'authorization_pending' }),
            });
          }
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(deviceTokenResponse()),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const authPromise = authenticate(httpClient, wsClient, {
        deviceCode: 'dc-123',
        pollTimeoutMs: 30_000,
      });

      // Advance timers through 3 poll cycles (3s each)
      await vi.advanceTimersByTimeAsync(3_000);
      await vi.advanceTimersByTimeAsync(3_000);
      await vi.advanceTimersByTimeAsync(3_000);

      const result = await authPromise;
      expect(result).toMatchObject({ method: 'device_auth', token: 'device-jwt' });
      expect(pollCount).toBe(3);

      vi.useRealTimers();
    });
  });

  // =========================================================================
  // Cascade order
  // =========================================================================

  describe('cascade order', () => {
    test('explicit token wins over stored credentials', async () => {
      const { httpClient, wsClient } = createMockClients();
      vi.mocked(readStoredCredentials).mockReturnValue({
        token: 'stored-jwt',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      vi.mocked(hasValidToken).mockReturnValue(true);

      const result = await authenticate(httpClient, wsClient, { authToken: 'explicit-jwt' });
      expect(result).toMatchObject({ method: 'explicit_token', token: 'explicit-jwt' });
    });

    test('stored credentials win over device auth (fetch never called)', async () => {
      const { httpClient, wsClient } = createMockClients();
      vi.mocked(readStoredCredentials).mockReturnValue({
        token: 'stored-jwt',
        expiresAt: '2099-01-01T00:00:00.000Z',
      });
      vi.mocked(hasValidToken).mockReturnValue(true);

      const result = await authenticate(httpClient, wsClient);
      expect(result.method).toBe('stored_credentials');
      expect(globalThis.fetch).toBe(originalFetch); // never replaced
    });
  });
});
