/**
 * platform_agents Tool
 *
 * Manage agents within a project via the Runtime REST API.
 * Supports list, get, and save_dsl actions.
 */

import { z } from 'zod';
import type { DebugContext } from './index.js';
import { validatePathParam } from '../utils/validate.js';
import { fetchWithTimeout } from '../utils/fetch.js';

// =============================================================================
// SCHEMA
// =============================================================================

export const platformAgentsSchema = z.object({
  action: z.enum(['list', 'get', 'save_dsl']),
  projectId: z.string().describe('Project ID'),
  agentName: z.string().optional().describe('Agent name (required for get, save_dsl)'),
  dslContent: z.string().optional().describe('DSL content (required for save_dsl)'),
});

type PlatformAgentsArgs = z.infer<typeof platformAgentsSchema>;

// =============================================================================
// HANDLER
// =============================================================================

export async function platformAgents(args: PlatformAgentsArgs, ctx: DebugContext): Promise<string> {
  const { action, projectId, agentName, dslContent } = args;
  const safeProjectId = validatePathParam(projectId, 'projectId');

  try {
    switch (action) {
      case 'list': {
        const result = await ctx.httpClient.get(`/api/projects/${safeProjectId}/agents`);
        return JSON.stringify({ success: true, data: result }, null, 2);
      }

      case 'get': {
        if (!agentName) {
          return JSON.stringify({
            success: false,
            error: 'agentName is required for the get action.',
          });
        }
        const safeAgentName = validatePathParam(agentName, 'agentName');
        const result = await ctx.httpClient.get(
          `/api/projects/${safeProjectId}/agents/${safeAgentName}`,
        );
        return JSON.stringify({ success: true, data: result }, null, 2);
      }

      case 'save_dsl': {
        if (!agentName) {
          return JSON.stringify({ success: false, error: 'agentName is required for the save_dsl action.' });
        }
        if (!dslContent) {
          return JSON.stringify({ success: false, error: 'dslContent is required for the save_dsl action.' });
        }
        const safeAgentName = validatePathParam(agentName, 'agentName');
        const baseUrl = ctx.httpClient.getBaseUrl();
        const token = ctx.httpClient.getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const dslPath = `/api/projects/${safeProjectId}/agents/${safeAgentName}/dsl`;

        // Attempt PUT — works if the agent already exists
        let putResp = await fetchWithTimeout(
          `${baseUrl}${dslPath}`,
          { method: 'PUT', headers, body: JSON.stringify({ dslContent }) },
          15_000,
        );

        // If the agent doesn't exist yet, create it first then retry the PUT
        if (putResp.status === 404) {
          const createResp = await fetchWithTimeout(
            `${baseUrl}/api/projects/${safeProjectId}/agents`,
            { method: 'POST', headers, body: JSON.stringify({ name: safeAgentName }) },
            15_000,
          );

          if (!createResp.ok) {
            const body = await createResp.text().catch(() => '');
            return JSON.stringify({
              success: false,
              error: `Agent "${safeAgentName}" does not exist and could not be created (${createResp.status} ${createResp.statusText}).`,
              hint: 'Create the agent in the Studio UI first, then run save-dsl.',
              serverResponse: body || undefined,
            });
          }

          // Retry PUT after creation
          putResp = await fetchWithTimeout(
            `${baseUrl}${dslPath}`,
            { method: 'PUT', headers, body: JSON.stringify({ dslContent }) },
            15_000,
          );
        }

        if (!putResp.ok) {
          const body = await putResp.text().catch(() => '');
          return JSON.stringify({
            success: false,
            error: `PUT ${dslPath} failed: ${putResp.status} ${putResp.statusText}`,
            serverResponse: body || undefined,
          });
        }

        const result = await putResp.json();
        return JSON.stringify({ success: true, data: result }, null, 2);
      }

      default:
        return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `platform_agents ${action} failed: ${message}`,
      hint: 'Ensure the runtime is running and you are connected (platform_connect).',
    });
  }
}
