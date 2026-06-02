/**
 * debug_get_errors Tool
 *
 * Get all errors and warnings from the session.
 */

import { z } from "zod";
import type { DebugContext } from "./index.js";
import {
  evidenceMessage,
  formatEvidenceDiagnostics,
  isErrorLikeEvent,
  loadSessionEvidence,
} from "../utils/session-evidence.js";
import { buildDiagnosticLayer } from "../utils/diagnostic-layer.js";
import { safeIsoTimestamp } from "../utils/trace-formatting.js";

export const getErrorsSchema = z.object({
  sessionId: z
    .string()
    .optional()
    .describe("Session ID (uses active session if not specified)"),
  projectId: z
    .string()
    .optional()
    .describe(
      "Project ID for persisted Studio/UI sessions (enables runtime proxy fallback)",
    ),
  includeWarnings: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include warning-level events"),
});

export type GetErrorsArgs = z.infer<typeof getErrorsSchema>;

export async function getErrors(
  args: GetErrorsArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    traceLimit: 500,
    preferRuntime: Boolean(args.projectId),
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
  const events = evidence.events.filter(isErrorLikeEvent);

  // Categorize events
  const errors: unknown[] = [];
  const warnings: unknown[] = [];
  const escalations: unknown[] = [];

  for (const event of events) {
    const formatted = {
      id: event.id,
      type: event.type,
      timestamp: safeIsoTimestamp(event.timestamp),
      agentName: event.agentName,
      message:
        event.data.message ||
        event.data.errorMessage ||
        event.data.reason ||
        (asRecord(event.data.providerError)?.message as unknown) ||
        (asRecord(event.data.sdkError)?.message as unknown) ||
        (asRecord(event.data.diagnostic)?.message as unknown),
      errorType: event.data.errorType,
      errorCode: event.data.errorCode,
      stack: event.data.stack,
      context: event.data.context,
      diagnostic: event.data.diagnostic,
    };

    if (event.type === "error") {
      errors.push(formatted);
    } else if (event.type === "escalation") {
      escalations.push({
        ...formatted,
        priority: event.data.priority,
        reason: event.data.reason,
      });
    } else if (event.data.warning) {
      if (args.includeWarnings) {
        warnings.push(formatted);
      }
    } else {
      // Other error-like events
      errors.push(formatted);
    }
  }

  return JSON.stringify({
    success: true,
    sessionId: evidence.sessionId,
    summary: {
      totalIssues: errors.length + warnings.length + escalations.length,
      errorCount: errors.length,
      warningCount: warnings.length,
      escalationCount: escalations.length,
    },
    evidence: formatEvidenceDiagnostics(evidence),
    message: evidenceMessage(evidence),
    diagnosticLayer: buildDiagnosticLayer(evidence.events),
    errors,
    warnings: args.includeWarnings ? warnings : undefined,
    escalations,
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}
