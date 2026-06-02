import { z } from "zod";
import type { DebugContext } from "./index.js";
import { buildDiagnosticLayer } from "../utils/diagnostic-layer.js";
import {
  evidenceMessage,
  formatEvidenceDiagnostics,
  loadSessionEvidence,
} from "../utils/session-evidence.js";

export const diagnosticLayerSchema = z.object({
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
  traceLimit: z.number().int().positive().max(2000).optional().default(750),
});

export type DiagnosticLayerArgs = z.infer<typeof diagnosticLayerSchema>;

export async function diagnosticLayer(
  args: DiagnosticLayerArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    traceLimit: args.traceLimit,
    preferRuntime: Boolean(args.projectId),
  });

  if (!evidenceResult.ok) {
    return JSON.stringify(
      {
        success: false,
        sessionId: evidenceResult.sessionId,
        error: evidenceResult.error,
        hint: evidenceResult.hint,
        diagnostics: evidenceResult.diagnostics,
      },
      null,
      2,
    );
  }

  const evidence = evidenceResult.evidence;
  return JSON.stringify(
    {
      success: true,
      sessionId: evidence.sessionId,
      projectId: evidence.projectId,
      agentName: evidence.agentName || "unknown",
      evidence: formatEvidenceDiagnostics(evidence),
      message: evidenceMessage(evidence),
      diagnosticLayer: buildDiagnosticLayer(evidence.events),
    },
    null,
    2,
  );
}
