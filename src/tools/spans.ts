/**
 * debug_get_span_tree Tool
 *
 * Get hierarchical span tree for execution flow visualization.
 */

import { z } from "zod";
import type { DebugContext } from "./index.js";
import { SpanBuilder } from "../store/span-builder.js";
import {
  evidenceMessage,
  formatEvidenceDiagnostics,
  loadSessionEvidence,
} from "../utils/session-evidence.js";
import { safeIsoTimestamp } from "../utils/trace-formatting.js";

export const getSpanTreeSchema = z.object({
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
  flat: z
    .boolean()
    .optional()
    .default(false)
    .describe("Return as flat list with depth info instead of tree"),
});

export type GetSpanTreeArgs = z.infer<typeof getSpanTreeSchema>;

export async function getSpanTree(
  args: GetSpanTreeArgs,
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
  const sessionId = evidence.sessionId;
  const events = evidence.events;

  if (events.length === 0) {
    return JSON.stringify({
      success: true,
      sessionId,
      tree: [],
      stats: {
        totalSpans: 0,
        maxDepth: 0,
        totalDurationMs: 0,
        byType: {},
      },
      evidence: formatEvidenceDiagnostics(evidence),
      message:
        evidenceMessage(evidence) ||
        "No trace events yet. Send a message to the agent to generate traces.",
    });
  }

  // Build the span tree
  const builder = new SpanBuilder();
  const tree = builder.buildTree(events);
  const stats = builder.getTreeStats(tree);

  if (args.flat) {
    // Return flat list with depth info
    const flatList = builder.flatten(tree);
    return JSON.stringify({
      success: true,
      sessionId,
      format: "flat",
      evidence: formatEvidenceDiagnostics(evidence),
      spans: flatList.map((node) => ({
        id: node.id,
        name: node.name,
        type: node.type,
        depth: node.data._depth,
        startTime: safeIsoTimestamp(node.startTime),
        endTime: node.endTime ? safeIsoTimestamp(node.endTime) : undefined,
        durationMs: node.durationMs,
        parentId: node.parentId,
      })),
      stats,
    });
  }

  // Return tree format
  const formatTree = (nodes: typeof tree): unknown[] =>
    nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      startTime: safeIsoTimestamp(node.startTime),
      endTime: node.endTime ? safeIsoTimestamp(node.endTime) : undefined,
      durationMs: node.durationMs,
      children: formatTree(node.children),
    }));

  return JSON.stringify({
    success: true,
    sessionId,
    format: "tree",
    evidence: formatEvidenceDiagnostics(evidence),
    tree: formatTree(tree),
    stats,
  });
}
