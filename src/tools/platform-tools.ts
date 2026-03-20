/**
 * platform_tools Tool
 *
 * Manage project tools (list, get, create, update, delete, test).
 *
 * NOTE: Tool CRUD endpoints live on the Studio API (port 5173), not the
 * runtime (port 3112).  The HttpClient base URL typically points at the
 * runtime, so this tool rewrites the base URL to the Studio origin when
 * making requests.  If the Studio API is unreachable, the caller should
 * be told to start the Studio dev server (`cd apps/studio && pnpm dev`).
 */

import { z } from 'zod';
import type { DebugContext } from './index.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { validatePathParam } from '../utils/validate.js';
import { sanitizeResponse } from '../utils/sanitize.js';

// =============================================================================
// SCHEMA
// =============================================================================

export const platformToolsSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'update', 'delete', 'test']),
  projectId: z.string().describe('Project ID'),
  toolId: z.string().optional().describe('Tool ID (for get, update, delete, test)'),
  name: z.string().optional().describe('Tool name (for create)'),
  type: z.string().optional().describe('Tool type (for create: http, function, mcp)'),
  definition: z
    .record(z.unknown())
    .optional()
    .describe('Tool definition object (for create, update)'),
  confirm: z
    .boolean()
    .optional()
    .describe('Set to true to confirm destructive operations (delete)'),
});

type PlatformToolsArgs = z.infer<typeof platformToolsSchema>;

// =============================================================================
// CONSTANTS
// =============================================================================

/** Studio runs on port 5173 by default */
const DEFAULT_STUDIO_PORT = 5173;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Derive the Studio base URL from the runtime base URL.
 * Replaces the port with the Studio port while keeping the host.
 */
function deriveStudioUrl(runtimeBaseUrl: string): string {
  try {
    const url = new URL(runtimeBaseUrl);
    url.port = String(DEFAULT_STUDIO_PORT);
    // Studio API routes are under /api/projects/...
    return url.origin;
  } catch {
    return `http://localhost:${DEFAULT_STUDIO_PORT}`;
  }
}

/**
 * Build common headers (JSON content type + auth token when available).
 */
function buildHeaders(ctx: DebugContext): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = ctx.httpClient.getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

function success(data: unknown): string {
  return JSON.stringify({ success: true, data: sanitizeResponse(data) });
}

function error(message: string, hint?: string): string {
  return JSON.stringify({ success: false, error: message, ...(hint ? { hint } : {}) });
}

// =============================================================================
// HANDLER
// =============================================================================

export async function platformTools(args: PlatformToolsArgs, ctx: DebugContext): Promise<string> {
  const { action, projectId, toolId, name, type, definition, confirm } = args;
  // TODO: Make Studio URL explicitly configurable instead of deriving from runtime URL
  const studioUrl = deriveStudioUrl(ctx.httpClient.getBaseUrl());
  const headers = buildHeaders(ctx);
  const safeProjectId = validatePathParam(projectId, 'projectId');
  const basePath = `${studioUrl}/api/projects/${safeProjectId}/tools`;

  try {
    switch (action) {
      // ----- LIST -----
      case 'list': {
        const response = await fetchWithTimeout(basePath, { headers }, 10_000);
        if (!response.ok) {
          return error(`GET ${basePath} failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return success(data);
      }

      // ----- GET -----
      case 'get': {
        if (!toolId) {
          return error('toolId is required for the "get" action.');
        }
        const safeToolId = validatePathParam(toolId, 'toolId');
        const url = `${basePath}/${safeToolId}`;
        const response = await fetchWithTimeout(url, { headers }, 10_000);
        if (!response.ok) {
          return error(`GET ${url} failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        return success(data);
      }

      // ----- CREATE -----
      case 'create': {
        const body: Record<string, unknown> = { ...definition };
        if (name) body.name = name;
        if (type) body.type = type;

        const response = await fetchWithTimeout(
          basePath,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
          },
          10_000,
        );
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return error(`POST ${basePath} failed: ${response.status} ${response.statusText}`, text);
        }
        const data = await response.json();
        return success(data);
      }

      // ----- UPDATE -----
      case 'update': {
        if (!toolId) {
          return error('toolId is required for the "update" action.');
        }
        const safeToolId = validatePathParam(toolId, 'toolId');
        const url = `${basePath}/${safeToolId}`;
        const body: Record<string, unknown> = { ...definition };
        if (name) body.name = name;
        if (type) body.type = type;

        const response = await fetchWithTimeout(
          url,
          {
            method: 'PATCH',
            headers,
            body: JSON.stringify(body),
          },
          10_000,
        );
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return error(`PATCH ${url} failed: ${response.status} ${response.statusText}`, text);
        }
        const data = await response.json();
        return success(data);
      }

      // ----- DELETE -----
      case 'delete': {
        if (!toolId) {
          return error('toolId is required for the "delete" action.');
        }
        if (confirm !== true) {
          return JSON.stringify({
            success: false,
            needsConfirmation: true,
            message: 'This will permanently delete the tool. Set confirm: true to proceed.',
          });
        }
        const safeToolId = validatePathParam(toolId, 'toolId');
        const url = `${basePath}/${safeToolId}`;
        const response = await fetchWithTimeout(
          url,
          {
            method: 'DELETE',
            headers,
          },
          10_000,
        );
        if (!response.ok) {
          return error(`DELETE ${url} failed: ${response.status} ${response.statusText}`);
        }
        return success({ deleted: true, toolId });
      }

      // ----- TEST -----
      case 'test': {
        if (!toolId) {
          return error('toolId is required for the "test" action.');
        }
        const safeToolId = validatePathParam(toolId, 'toolId');
        const url = `${basePath}/${safeToolId}/test`;
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers,
          },
          15_000,
        );
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return error(`POST ${url} failed: ${response.status} ${response.statusText}`, text);
        }
        const data = await response.json();
        return success(data);
      }

      default:
        return error(`Unknown action: ${action}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      `Tool management request failed: ${message}`,
      'Tool CRUD endpoints are served by the Studio API (port 5173). Ensure Studio is running: cd apps/studio && pnpm dev',
    );
  }
}
