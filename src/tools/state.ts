/**
 * debug_get_current_state Tool
 *
 * Get the current session state including context, flow state, etc.
 */

import { z } from "zod";
import type { DebugContext } from "./index.js";
import {
  formatEvidenceDiagnostics,
  loadSessionEvidence,
} from "../utils/session-evidence.js";
import { safeIsoTimestamp, safeStringify } from "../utils/trace-formatting.js";

export const getCurrentStateSchema = z.object({
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
});

export type GetCurrentStateArgs = z.infer<typeof getCurrentStateSchema>;

export async function getCurrentState(
  args: GetCurrentStateArgs,
  ctx: DebugContext,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(ctx, {
    sessionId: args.sessionId,
    projectId: args.projectId,
    fetchTraces: false,
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
  const sessionId = evidence.sessionId;
  const session = evidence.session;

  // If we have state in the session store, return it
  if (evidence.state) {
    return safeStringify({
      success: true,
      sessionId,
      agentId: evidence.agentId,
      state: evidence.state,
      lastActivityAt: session?.lastActivityAt
        ? safeIsoTimestamp(session.lastActivityAt)
        : undefined,
      evidence: formatEvidenceDiagnostics(evidence),
    });
  }

  // If connected, request fresh state from server
  if (session && ctx.wsClient.isConnected()) {
    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(
            JSON.stringify({
              success: false,
              error: "Timeout waiting for state update",
            }),
          );
        }
      }, 5000);

      // Set up one-time handler
      const originalOnStateUpdate = ctx.wsClient.onStateUpdate;

      ctx.wsClient.onStateUpdate = (msgSessionId, state) => {
        if (msgSessionId === sessionId) {
          // Restore original handler
          ctx.wsClient.onStateUpdate = originalOnStateUpdate;

          // Update store
          ctx.sessionStore.updateState(sessionId, state);

          clearTimeout(timeout);
          if (!resolved) {
            resolved = true;
            resolve(
              safeStringify({
                success: true,
                sessionId,
                agentId: session.agentId,
                state,
                source: "fresh",
              }),
            );
          }
        }

        // Call original handler
        originalOnStateUpdate?.(msgSessionId, state);
      };

      // Request state
      ctx.wsClient.getState(sessionId);
    });
  }

  // No state available
  return JSON.stringify({
    success: true,
    sessionId,
    agentId: evidence.agentId,
    state: null,
    evidence: formatEvidenceDiagnostics(evidence),
    message: args.projectId
      ? "No state snapshot was available in the persisted session payload."
      : "No state available yet. Send a message to the agent first, or pass projectId for a completed Studio/UI session.",
  });
}
