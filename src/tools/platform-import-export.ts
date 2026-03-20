/**
 * platform_import_export Tool
 *
 * Import and export project configurations via the Runtime REST API.
 *
 * Endpoints (mounted at /api/projects/:projectId/project-io):
 *   GET  /export/preview  — Metadata preview (agents, tools, deps)
 *   GET  /export          — Full export (file map + manifest + lockfile)
 *   POST /import/preview  — Dry-run import (preview changes)
 *   POST /import          — Apply import (create/update/delete agents)
 */

import { z } from 'zod';
import type { DebugContext } from './index.js';
import { validatePathParam } from '../utils/validate.js';
import { sanitizeResponse } from '../utils/sanitize.js';

// =============================================================================
// SCHEMA
// =============================================================================

export const platformImportExportSchema = z.object({
  action: z.enum(['export_preview', 'export', 'import_preview', 'import']),
  projectId: z.string().describe('Project ID'),
  data: z.record(z.unknown()).optional().describe('Import data (for import_preview, import)'),
  confirm: z
    .boolean()
    .optional()
    .describe('Set to true to confirm destructive operations (import)'),
});

type PlatformImportExportArgs = z.infer<typeof platformImportExportSchema>;

// =============================================================================
// HELPERS
// =============================================================================

function success(data: unknown): string {
  return JSON.stringify({ success: true, data });
}

function error(message: string, hint?: string): string {
  return JSON.stringify({ success: false, error: message, ...(hint ? { hint } : {}) });
}

// =============================================================================
// HANDLER
// =============================================================================

export async function platformImportExport(
  args: PlatformImportExportArgs,
  ctx: DebugContext,
): Promise<string> {
  const { action, projectId, data, confirm } = args;
  const safeProjectId = validatePathParam(projectId, 'projectId');
  const basePath = `/api/projects/${safeProjectId}/project-io`;

  try {
    switch (action) {
      // ----- EXPORT PREVIEW -----
      case 'export_preview': {
        const result = await ctx.httpClient.get(`${basePath}/export/preview`);
        return success(sanitizeResponse(result));
      }

      // ----- EXPORT -----
      case 'export': {
        const result = await ctx.httpClient.get(`${basePath}/export`);
        return success(sanitizeResponse(result));
      }

      // ----- IMPORT PREVIEW -----
      case 'import_preview': {
        if (!data) {
          return error('data is required for the "import_preview" action.');
        }
        const result = await ctx.httpClient.post(`${basePath}/import/preview`, data);
        return success(sanitizeResponse(result));
      }

      // ----- IMPORT -----
      case 'import': {
        if (!data) {
          return error('data is required for the "import" action.');
        }
        if (confirm !== true) {
          return JSON.stringify({
            success: false,
            needsConfirmation: true,
            message: 'Import will create/update/delete agents. Set confirm: true to proceed.',
          });
        }
        const result = await ctx.httpClient.post(`${basePath}/import`, data);
        return success(sanitizeResponse(result));
      }

      default:
        return error(`Unknown action: ${action}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      `Import/export request failed: ${message}`,
      'Ensure the runtime is running and you are connected (platform_connect).',
    );
  }
}
