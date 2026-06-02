import { z } from "zod";
import type { DebugContext } from "./index.js";
import {
  evidenceMessage,
  formatEvidenceDiagnostics,
  loadSessionEvidence,
} from "../utils/session-evidence.js";
import {
  buildModelInteractionReport,
  buildRealtimeInteractionReport,
  explainTraceEvent,
  findTraceEvent,
  formatTraceEvent,
  getNearbyTraceEvents,
} from "../utils/trace-diagnostics.js";

const sessionTraceSchema = z.object({
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
  traceLimit: z.number().int().positive().max(5000).optional().default(1000),
});

export const getTraceEventSchema = sessionTraceSchema.extend({
  eventId: z.string().min(1).describe("Trace event id to retrieve"),
  includeData: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include compacted raw event data"),
  includeNearby: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include nearby timeline events"),
});

export const explainTraceEventSchema = sessionTraceSchema.extend({
  eventId: z.string().min(1).describe("Trace event id to explain"),
});

export const modelInteractionsSchema = sessionTraceSchema.extend({
  includeTimeline: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include model interaction timeline events"),
});

export const realtimeInteractionsSchema = sessionTraceSchema.extend({
  includeTimeline: z
    .boolean()
    .optional()
    .default(true)
    .describe("Include realtime provider/session timeline events"),
});

export type GetTraceEventArgs = z.infer<typeof getTraceEventSchema>;
export type ExplainTraceEventArgs = z.infer<typeof explainTraceEventSchema>;
export type ModelInteractionsArgs = z.infer<typeof modelInteractionsSchema>;
export type RealtimeInteractionsArgs = z.infer<
  typeof realtimeInteractionsSchema
>;

export async function getTraceEvent(
  args: GetTraceEventArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    traceLimit: args.traceLimit,
    preferRuntime: Boolean(args.projectId),
  });

  if (!evidenceResult.ok) {
    return JSON.stringify(formatEvidenceFailure(evidenceResult), null, 2);
  }

  const evidence = evidenceResult.evidence;
  const event = findTraceEvent(evidence.events, args.eventId);
  if (!event) {
    return JSON.stringify(
      {
        success: false,
        sessionId: evidence.sessionId,
        projectId: evidence.projectId,
        error: `Trace event not found: ${args.eventId}`,
        evidence: formatEvidenceDiagnostics(evidence),
        availableEventIds: evidence.events
          .slice(0, 20)
          .map((candidate) => candidate.id),
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      success: true,
      sessionId: evidence.sessionId,
      projectId: evidence.projectId,
      evidence: formatEvidenceDiagnostics(evidence),
      message: evidenceMessage(evidence),
      event: formatTraceEvent(event, { includeData: args.includeData }),
      ...(args.includeNearby
        ? {
            nearbyEvents: getNearbyTraceEvents(evidence.events, event.id).map(
              (nearbyEvent) => formatTraceEvent(nearbyEvent),
            ),
          }
        : {}),
    },
    null,
    2,
  );
}

export async function explainTraceEventTool(
  args: ExplainTraceEventArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    traceLimit: args.traceLimit,
    preferRuntime: Boolean(args.projectId),
  });

  if (!evidenceResult.ok) {
    return JSON.stringify(formatEvidenceFailure(evidenceResult), null, 2);
  }

  const evidence = evidenceResult.evidence;
  const event = findTraceEvent(evidence.events, args.eventId);
  if (!event) {
    return JSON.stringify(
      {
        success: false,
        sessionId: evidence.sessionId,
        projectId: evidence.projectId,
        error: `Trace event not found: ${args.eventId}`,
        evidence: formatEvidenceDiagnostics(evidence),
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      success: true,
      sessionId: evidence.sessionId,
      projectId: evidence.projectId,
      evidence: formatEvidenceDiagnostics(evidence),
      message: evidenceMessage(evidence),
      explanation: explainTraceEvent(event, evidence.events),
    },
    null,
    2,
  );
}

export async function modelInteractions(
  args: ModelInteractionsArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    traceLimit: args.traceLimit,
    preferRuntime: Boolean(args.projectId),
  });

  if (!evidenceResult.ok) {
    return JSON.stringify(formatEvidenceFailure(evidenceResult), null, 2);
  }

  const evidence = evidenceResult.evidence;
  const report = buildModelInteractionReport(evidence.events);

  return JSON.stringify(
    {
      success: true,
      sessionId: evidence.sessionId,
      projectId: evidence.projectId,
      evidence: formatEvidenceDiagnostics(evidence),
      message: evidenceMessage(evidence),
      modelInteractions: {
        summary: report.summary,
        ...(args.includeTimeline ? { timeline: report.timeline } : {}),
      },
    },
    null,
    2,
  );
}

export async function realtimeInteractions(
  args: RealtimeInteractionsArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    traceLimit: args.traceLimit,
    preferRuntime: Boolean(args.projectId),
  });

  if (!evidenceResult.ok) {
    return JSON.stringify(formatEvidenceFailure(evidenceResult), null, 2);
  }

  const evidence = evidenceResult.evidence;
  const report = buildRealtimeInteractionReport(evidence.events);

  return JSON.stringify(
    {
      success: true,
      sessionId: evidence.sessionId,
      projectId: evidence.projectId,
      evidence: formatEvidenceDiagnostics(evidence),
      message: evidenceMessage(evidence),
      realtimeInteractions: {
        summary: report.summary,
        ...(args.includeTimeline ? { timeline: report.timeline } : {}),
      },
    },
    null,
    2,
  );
}

function formatEvidenceFailure(
  evidenceResult: Exclude<
    Awaited<ReturnType<typeof loadSessionEvidence>>,
    { ok: true }
  >,
): Record<string, unknown> {
  return {
    success: false,
    sessionId: evidenceResult.sessionId,
    error: evidenceResult.error,
    hint: evidenceResult.hint,
    diagnostics: evidenceResult.diagnostics,
  };
}
