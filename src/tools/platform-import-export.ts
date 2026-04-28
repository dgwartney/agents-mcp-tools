/**
 * platform_import_export Tool
 *
 * Import and export project configurations via the Studio REST API (v2).
 *
 * Endpoints (mounted at /api/projects/:projectId on the Studio origin):
 *   POST /export/preview  — Metadata preview (agents, tools, layers, deps)
 *   GET  /export          — Full export (file map + manifest + lockfile)
 *   POST /import/preview  — Dry-run import (preview changes)
 *   POST /import/apply    — Apply import (staged create/update/delete)
 *
 * After a successful import, if the uploaded files contain a project.json
 * with an entry_agent field, the project's entryAgentName is PATCHed
 * automatically.
 */

import { z } from "zod";
import type { DebugContext } from "./index.js";
import { fetchWithTimeout } from "../utils/fetch.js";
import { validatePathParam } from "../utils/validate.js";
import { sanitizeResponse } from "../utils/sanitize.js";

// =============================================================================
// SCHEMA
// =============================================================================

export const platformImportExportSchema = z.object({
  action: z.enum(["export_preview", "export", "import_preview", "import"]),
  projectId: z.string().describe("Project ID"),
  data: z
    .record(z.unknown())
    .optional()
    .describe("Import data (for import_preview, import)"),
  confirm: z
    .boolean()
    .optional()
    .describe("Set to true to confirm destructive operations (import)"),
});

type PlatformImportExportArgs = z.infer<typeof platformImportExportSchema>;

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
 * For deployed environments (no explicit port), Studio is co-hosted behind the
 * same origin. For local dev, replace the port with the Studio port.
 */
function deriveStudioUrl(runtimeBaseUrl: string): string {
  try {
    const url = new URL(runtimeBaseUrl);
    // If the URL has an explicit non-standard port (local dev), swap to Studio port
    if (url.port && url.port !== "443" && url.port !== "80") {
      url.port = String(DEFAULT_STUDIO_PORT);
    }
    return url.origin;
  } catch {
    return `http://localhost:${DEFAULT_STUDIO_PORT}`;
  }
}

function buildHeaders(ctx: DebugContext): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = ctx.httpClient.getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function success(data: unknown): string {
  return JSON.stringify(
    { success: true, data: sanitizeResponse(data) },
    null,
    2,
  );
}

function error(message: string, hint?: string): string {
  return JSON.stringify({
    success: false,
    error: message,
    ...(hint ? { hint } : {}),
  });
}

/**
 * Extract entry_agent from import data if present.
 * Looks for a project.json file in the data.files map and parses it.
 */
function extractEntryAgent(data: Record<string, unknown>): string | null {
  const files = data.files as Record<string, string> | undefined;
  if (!files || typeof files !== "object") return null;

  const projectJsonContent = files["project.json"];
  if (typeof projectJsonContent !== "string") return null;

  try {
    const parsed = JSON.parse(projectJsonContent) as Record<string, unknown>;
    if (
      typeof parsed.entry_agent === "string" &&
      parsed.entry_agent.length > 0
    ) {
      return parsed.entry_agent;
    }
  } catch {
    // project.json is not valid JSON — skip
  }

  return null;
}

/**
 * PATCH the project to set entryAgentName after a successful import.
 */
async function patchProjectEntryAgent(
  studioBase: string,
  headers: Record<string, string>,
  projectId: string,
  entryAgentName: string,
): Promise<void> {
  const url = `${studioBase}/api/projects/${projectId}`;
  const response = await fetchWithTimeout(
    url,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({ entryAgentName }),
    },
    10_000,
  );
  if (!response.ok) {
    // Non-fatal: log the failure hint but don't fail the overall import
    throw new Error(
      `PATCH /api/projects/${projectId} failed: ${response.status} ${response.statusText}`,
    );
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export async function platformImportExport(
  args: PlatformImportExportArgs,
  ctx: DebugContext,
): Promise<string> {
  const { action, projectId, data, confirm } = args;
  const safeProjectId = validatePathParam(projectId, "projectId");
  const studioBase = deriveStudioUrl(ctx.httpClient.getBaseUrl());
  const headers = buildHeaders(ctx);
  const basePath = `${studioBase}/api/projects/${safeProjectId}`;

  try {
    switch (action) {
      // ----- EXPORT PREVIEW -----
      case "export_preview": {
        const response = await fetchWithTimeout(
          `${basePath}/export/preview`,
          { method: "POST", headers },
          15_000,
        );
        if (!response.ok) {
          return error(
            `POST /api/projects/${safeProjectId}/export/preview failed: ${response.status} ${response.statusText}`,
          );
        }
        const result = await response.json();
        return success(result);
      }

      // ----- EXPORT -----
      case "export": {
        const response = await fetchWithTimeout(
          `${basePath}/export`,
          { headers },
          30_000,
        );
        if (!response.ok) {
          return error(
            `GET /api/projects/${safeProjectId}/export failed: ${response.status} ${response.statusText}`,
          );
        }
        const result = await response.json();
        return success(result);
      }

      // ----- IMPORT PREVIEW -----
      case "import_preview": {
        if (!data) {
          return error('data is required for the "import_preview" action.');
        }
        const response = await fetchWithTimeout(
          `${basePath}/import/preview`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(data),
          },
          30_000,
        );
        if (!response.ok) {
          return error(
            `POST /api/projects/${safeProjectId}/import/preview failed: ${response.status} ${response.statusText}`,
          );
        }
        const result = await response.json();
        return success(result);
      }

      // ----- IMPORT (APPLY) -----
      case "import": {
        if (!data) {
          return error('data is required for the "import" action.');
        }
        if (confirm !== true) {
          return JSON.stringify({
            success: false,
            needsConfirmation: true,
            message:
              "Import will create/update/delete agents. Set confirm: true to proceed.",
          });
        }
        const response = await fetchWithTimeout(
          `${basePath}/import/apply`,
          {
            method: "POST",
            headers,
            body: JSON.stringify(data),
          },
          30_000,
        );
        if (!response.ok) {
          return error(
            `POST /api/projects/${safeProjectId}/import/apply failed: ${response.status} ${response.statusText}`,
          );
        }
        const result = await response.json();

        // After successful import, update entryAgentName if present in import data
        const entryAgent = extractEntryAgent(data);
        if (entryAgent) {
          try {
            await patchProjectEntryAgent(
              studioBase,
              headers,
              safeProjectId,
              entryAgent,
            );
          } catch (patchErr) {
            // Non-fatal: include a warning in the response
            const patchMessage =
              patchErr instanceof Error ? patchErr.message : String(patchErr);
            return JSON.stringify(
              {
                success: true,
                data: sanitizeResponse(result),
                warning: `Import succeeded but failed to set entryAgentName: ${patchMessage}`,
              },
              null,
              2,
            );
          }
        }

        return success(result);
      }

      default:
        return error(`Unknown action: ${action}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(
      `Import/export request failed: ${message}`,
      "Import/export endpoints are served by the Studio API (port 5173). Ensure Studio is running: cd apps/studio && pnpm dev",
    );
  }
}
