/**
 * platform_projects Tool
 *
 * Manage projects via the Runtime REST API.
 * Supports list, get, create, and delete actions.
 */

import { z } from 'zod';
import type { DebugContext } from './index.js';
import { validatePathParam } from '../utils/validate.js';
import { sanitizeResponse } from '../utils/sanitize.js';

// =============================================================================
// SCHEMA
// =============================================================================

export const platformProjectsSchema = z.object({
  action: z.enum(['list', 'get', 'create', 'delete']),
  projectId: z.string().optional().describe('Project ID (required for get, delete)'),
  name: z.string().optional().describe('Project name (required for create)'),
  description: z.string().optional().describe('Project description (for create)'),
  confirm: z
    .boolean()
    .optional()
    .describe('Set to true to confirm destructive operations (delete)'),
});

type PlatformProjectsArgs = z.infer<typeof platformProjectsSchema>;

// =============================================================================
// HANDLER
// =============================================================================

export async function platformProjects(
  args: PlatformProjectsArgs,
  ctx: DebugContext,
): Promise<string> {
  const { action, projectId, name, description, confirm } = args;

  try {
    switch (action) {
      case 'list': {
        const result = await ctx.httpClient.get('/api/projects');
        return JSON.stringify({ success: true, data: sanitizeResponse(result) }, null, 2);
      }

      case 'get': {
        if (!projectId) {
          return JSON.stringify({
            success: false,
            error: 'projectId is required for the get action.',
          });
        }
        const safeProjectId = validatePathParam(projectId, 'projectId');
        const result = await ctx.httpClient.get(`/api/projects/${safeProjectId}`);
        return JSON.stringify({ success: true, data: sanitizeResponse(result) }, null, 2);
      }

      case 'create': {
        if (!name) {
          return JSON.stringify({
            success: false,
            error: 'name is required for the create action.',
          });
        }
        const body: Record<string, string> = { name };
        if (description) {
          body.description = description;
        }
        const result = await ctx.httpClient.post('/api/projects', body);
        return JSON.stringify({ success: true, data: sanitizeResponse(result) }, null, 2);
      }

      case 'delete': {
        if (!projectId) {
          return JSON.stringify({
            success: false,
            error: 'projectId is required for the delete action.',
          });
        }
        if (confirm !== true) {
          return JSON.stringify({
            success: false,
            needsConfirmation: true,
            message:
              'This will permanently delete the project and all its resources. Set confirm: true to proceed.',
          });
        }
        const safeProjectId = validatePathParam(projectId, 'projectId');
        const result = await ctx.httpClient.del(`/api/projects/${safeProjectId}`);
        return JSON.stringify({ success: true, data: sanitizeResponse(result) }, null, 2);
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `platform_projects ${action} failed: ${message}`,
      hint: 'Ensure the runtime is running and you are connected (platform_connect).',
    });
  }
}
