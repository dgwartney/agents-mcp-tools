/**
 * Trace Tools
 *
 * debug_traces - Get and search trace events with optional filters
 */

import { z } from "zod";
import type { DebugContext } from "./index.js";
import {
  evidenceMessage,
  filterEvidenceEvents,
  formatEvidenceDiagnostics,
  loadSessionEvidence,
  sortEventsRecentFirst,
} from "../utils/session-evidence.js";
import { safeIsoTimestamp, safeStringify } from "../utils/trace-formatting.js";

// =============================================================================
// debug_traces — unified get + search
// =============================================================================

export const tracesSchema = z.object({
  text: z.string().optional().describe("Text to search for in event data"),
  // Accept any string to be forward-compatible with new runtime event types
  types: z.array(z.string()).optional().describe("Filter by event types"),
  agentName: z.string().optional().describe("Filter by agent name"),
  hasError: z.boolean().optional().describe("Filter for error events only"),
  sessionId: z
    .string()
    .optional()
    .describe("Filter by or search within a specific session"),
  projectId: z
    .string()
    .optional()
    .describe(
      "Project ID for persisted Studio/UI sessions (enables runtime proxy fallback)",
    ),
  limit: z
    .number()
    .optional()
    .default(50)
    .describe("Maximum number of events to return (default: 50)"),
});

export type TracesArgs = z.infer<typeof tracesSchema>;

export async function traces(
  args: TracesArgs,
  ctx: DebugContext,
): Promise<string> {
  try {
    const {
      text,
      types,
      agentName,
      hasError,
      sessionId,
      projectId,
      limit = 50,
    } = args;

    const evidenceResult = await loadSessionEvidence(ctx, {
      sessionId,
      projectId,
      traceLimit: Math.max(limit, 500),
      preferRuntime: Boolean(projectId),
    });

    if (!evidenceResult.ok) {
      return JSON.stringify({
        success: false,
        sessionId: evidenceResult.sessionId,
        error: evidenceResult.error,
        hint: evidenceResult.hint,
        diagnostics: evidenceResult.diagnostics,
      });
    }

    const evidence = evidenceResult.evidence;
    const effectiveSessionId = evidence.sessionId;

    const hasSearchFilters =
      text !== undefined || agentName !== undefined || hasError !== undefined;

    if (hasSearchFilters || types?.length) {
      const events = sortEventsRecentFirst(
        filterEvidenceEvents(evidence.events, {
          text,
          types,
          agentName,
          hasError,
        }),
      );

      const limitedEvents = events.slice(0, limit);

      const formattedEvents = limitedEvents.map((e) => ({
        id: e.id,
        type: e.type,
        timestamp: safeIsoTimestamp(e.timestamp),
        agentName: e.agentName,
        durationMs: e.durationMs,
        spanId: e.spanId,
        data: summarizeData(e.data),
      }));

      return JSON.stringify({
        success: true,
        count: formattedEvents.length,
        totalMatches: events.length,
        sessionId: effectiveSessionId,
        filters: { text, types, agentName, hasError },
        evidence: formatEvidenceDiagnostics(evidence),
        message: evidenceMessage(evidence),
        events: formattedEvents,
      });
    }

    const events = sortEventsRecentFirst(evidence.events).slice(0, limit);

    const formattedEvents = events.map((e) => ({
      id: e.id,
      type: e.type,
      timestamp: safeIsoTimestamp(e.timestamp),
      agentName: e.agentName,
      durationMs: e.durationMs,
      spanId: e.spanId,
      data: summarizeData(e.data),
    }));

    return JSON.stringify({
      success: true,
      count: formattedEvents.length,
      sessionId: effectiveSessionId,
      evidence: formatEvidenceDiagnostics(evidence),
      message: evidenceMessage(evidence),
      events: formattedEvents,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `debug_traces failed: ${message}`,
    });
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Summarize event data, truncating long strings
 */
function summarizeData(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.length > 200) {
      result[key] = value.substring(0, 200) + "...";
    } else if (Array.isArray(value) && value.length > 10) {
      result[key] = [...value.slice(0, 10), `... (${value.length} total)`];
    } else if (typeof value === "object" && value !== null) {
      const str = safeStringify(value);
      if (str.length > 200) {
        // Don't try to parse truncated JSON - just indicate it was truncated
        result[key] = {
          _truncated: true,
          _preview: str.substring(0, 200) + "...",
        };
      } else {
        result[key] = parseJsonValue(str);
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
