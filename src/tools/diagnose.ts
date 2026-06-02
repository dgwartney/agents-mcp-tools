/**
 * debug_diagnose Tool
 *
 * Run full diagnostic analysis on an agent or session via the runtime diagnostics API.
 * Formats the DiagnosticReport as human-readable text for Claude.
 */

import { z } from "zod";
import type { DebugContext } from "./index.js";
import { loadSessionEvidence } from "../utils/session-evidence.js";
import {
  buildDiagnosticLayer,
  type DiagnosticLayer,
} from "../utils/diagnostic-layer.js";
import { safeIsoTimestamp, safeStringify } from "../utils/trace-formatting.js";

// =============================================================================
// SCHEMA
// =============================================================================

export const diagnoseSchema = z.object({
  sessionId: z.string().optional().describe("Diagnose a specific session"),
  agentName: z.string().optional().describe("Diagnose an agent's config"),
  projectId: z
    .string()
    .optional()
    .describe('Project ID (required for API calls, defaults to "default")'),
  depth: z
    .enum(["quick", "standard", "deep"])
    .optional()
    .describe("Diagnostic depth (default: standard)"),
  configOnly: z
    .boolean()
    .optional()
    .describe(
      "When true, return only the config section (model chain, credentials, tools) — equivalent to the old debug_inspect behavior",
    ),
});

type DiagnoseArgs = z.infer<typeof diagnoseSchema>;

// =============================================================================
// TYPES (mirrors runtime DiagnosticReport shape)
// =============================================================================

interface DiagnosticFinding {
  analyzer: string;
  severity: "error" | "warning" | "info";
  code: string;
  title: string;
  detail: string;
  suggestion: string;
}

interface DiagnosticReport {
  status: "healthy" | "degraded" | "broken";
  target: {
    type: "agent" | "session" | "execution";
    id: string;
    agentName: string;
  };
  findings: DiagnosticFinding[];
  summary: {
    errors: number;
    warnings: number;
    infos: number;
    analyzersRun: string[];
  };
  config: {
    model?: {
      chain: Array<{
        level: number;
        name: string;
        checked: boolean;
        matched: boolean;
        value?: string;
        reason: string;
      }>;
      resolved?: { modelId: string; provider: string; source: string };
    };
    credentials?: {
      provider: string;
      available: boolean;
      scope?: string;
      isActive?: boolean;
    };
    tools?: {
      total: number;
      bound: number;
      failed: string[];
    };
  };
  timestamp: string;
}

interface ApiResponse {
  success: boolean;
  data: DiagnosticReport;
}

type JsonRecord = Record<string, unknown>;

interface RuntimeProxyDiagnosticInput {
  sessionId: string;
  projectId: string;
  depth: "quick" | "standard" | "deep";
  ctx: DebugContext;
  diagnosticsError: unknown;
}

// =============================================================================
// SEVERITY ICONS
// =============================================================================

const SEVERITY_ICON: Record<string, string> = {
  error: "[ERROR]",
  warning: "[WARN]",
  info: "[INFO]",
};

const STATUS_ICON: Record<string, string> = {
  healthy: "[OK]",
  degraded: "[DEGRADED]",
  broken: "[BROKEN]",
};

// =============================================================================
// HANDLER
// =============================================================================

export async function diagnose(
  args: DiagnoseArgs,
  ctx: DebugContext,
): Promise<string> {
  const { sessionId, agentName, depth = "standard", configOnly = false } = args;
  const projectId = args.projectId;
  if (!projectId) {
    return JSON.stringify({
      success: false,
      error:
        "projectId is required. Provide the project ID to run diagnostics.",
    });
  }

  if (!sessionId && !agentName) {
    return JSON.stringify({
      success: false,
      error:
        "Either sessionId or agentName is required. Provide one to run diagnostics.",
    });
  }

  try {
    let report: DiagnosticReport;

    if (sessionId) {
      try {
        const resp = await ctx.httpClient.get<ApiResponse>(
          `/api/projects/${projectId}/diagnostics/sessions/${sessionId}?depth=${depth}`,
        );
        report = resp.data;
      } catch (diagnosticsError) {
        return diagnoseSessionViaRuntimeProxy({
          sessionId,
          projectId,
          depth,
          ctx,
          diagnosticsError,
        });
      }
    } else {
      const resp = await ctx.httpClient.get<ApiResponse>(
        `/api/projects/${projectId}/diagnostics/agents/${agentName}`,
      );
      report = resp.data;
    }

    if (configOnly) {
      return formatConfigOnlyReport(report);
    }

    return formatDiagnosticReport(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: `Diagnostic request failed: ${message}`,
      hint: "Ensure the runtime is running and you are connected (platform_connect).",
    });
  }
}

// =============================================================================
// RUNTIME PROXY FALLBACK
// =============================================================================

async function diagnoseSessionViaRuntimeProxy(
  input: RuntimeProxyDiagnosticInput,
): Promise<string> {
  const evidenceResult = await loadSessionEvidence(input.ctx, {
    sessionId: input.sessionId,
    projectId: input.projectId,
    traceLimit: traceLimitForDepth(input.depth),
    preferRuntime: true,
  });

  if (!evidenceResult.ok) {
    return JSON.stringify(
      {
        success: false,
        error: `Diagnostic request failed: ${formatError(input.diagnosticsError)}`,
        fallback: evidenceResult,
        hint: "The direct diagnostics endpoint and the Studio runtime session proxy both failed. Verify projectId, sessionId, workspace selection, and auth scope.",
      },
      null,
      2,
    );
  }

  const evidence = evidenceResult.evidence;

  return formatRuntimeProxyDiagnosis({
    sessionId: input.sessionId,
    projectId: input.projectId,
    session: evidence.runtimeSession || null,
    traces: evidence.events as unknown as JsonRecord[],
    diagnosticLayer: buildDiagnosticLayer(evidence.events),
    traceMeta: evidence.traceMeta || null,
    traceTotal: evidence.traceTotal ?? null,
    diagnosticsError: formatError(input.diagnosticsError),
    tracesFailure:
      evidence.diagnostics.warnings.length > 0
        ? { warnings: evidence.diagnostics.warnings }
        : null,
  });
}

function traceLimitForDepth(depth: "quick" | "standard" | "deep"): number {
  if (depth === "quick") return 100;
  if (depth === "deep") return 500;
  return 250;
}

function formatRuntimeProxyDiagnosis(input: {
  sessionId: string;
  projectId: string;
  session: JsonRecord | null;
  traces: JsonRecord[];
  diagnosticLayer: DiagnosticLayer;
  traceMeta: JsonRecord | null;
  traceTotal: number | null;
  diagnosticsError: string;
  tracesFailure: JsonRecord | null;
}): string {
  const lines: string[] = [];
  const agentName = getAgentName(input.session) || "unknown";
  const errorEvents = input.traces.filter(isErrorTrace);
  const status = errorEvents.length > 0 ? "[BROKEN]" : "[DEGRADED]";
  const eventCounts = countBy(
    input.traces,
    (trace) => asString(trace.type) || "unknown",
  );
  const agentCounts = countBy(
    input.traces,
    (trace) => asString(trace.agentName) || "unknown",
  );
  const messages = getSessionMessages(input.session);
  const routingEvents = input.traces.filter(isRoutingTrace);
  const toolEvents = input.traces.filter(
    (trace) => asString(trace.type) === "tool_call",
  );

  lines.push(
    `SESSION DIAGNOSIS: ${agentName} (session:${input.sessionId}) -- ${status} RUNTIME_PROXY_FALLBACK`,
  );
  lines.push(`Project: ${input.projectId}`);
  lines.push(
    `Primary diagnostics endpoint unavailable: ${input.diagnosticsError}`,
  );
  lines.push(
    `Loaded via Studio runtime proxy: ${input.traces.length}${input.traceTotal !== null ? `/${input.traceTotal}` : ""} traces`,
  );
  lines.push(
    `Diagnostic groups: ${input.diagnosticLayer.summary.groupCount} (${input.diagnosticLayer.summary.errorGroups} error, ${input.diagnosticLayer.summary.warningGroups} warning)`,
  );

  if (input.diagnosticLayer.groups.length > 0) {
    lines.push("");
    lines.push("Layered diagnostics:");
    for (const group of input.diagnosticLayer.groups.slice(0, 8)) {
      lines.push(
        `- [${group.severity.toUpperCase()}] ${group.title}${group.code ? ` (${group.code})` : ""}`,
      );
      if (group.stage || group.category) {
        lines.push(
          `  stage=${group.stage || "unknown"} category=${group.category}`,
        );
      }
      if (group.rootCause) {
        lines.push(`  rootCause=${group.rootCause}`);
      }
      if (group.recommendedActions.length > 0) {
        lines.push(`  next=${group.recommendedActions[0]}`);
      }
      lines.push(`  evidence=${group.relatedEventIds.slice(0, 5).join(", ")}`);
    }
  }

  if (input.traceMeta) {
    const source = asString(input.traceMeta.source) || "unknown";
    const loaded = asNumber(input.traceMeta.loaded_count);
    const available = asNumber(input.traceMeta.available_count);
    const truncated = input.traceMeta.is_truncated === true ? "yes" : "no";
    lines.push(
      `Trace source: ${source}${loaded !== null && available !== null ? ` (${loaded}/${available} loaded)` : ""}, truncated: ${truncated}`,
    );
  }

  if (input.tracesFailure) {
    lines.push(
      `Trace fetch warning: GET ${asString(input.tracesFailure.path) || "traces"} failed with ${asNumber(input.tracesFailure.status) ?? "unknown"} ${asString(input.tracesFailure.statusText) || ""}`,
    );
  }

  lines.push("");
  lines.push("--- SUMMARY ---");
  lines.push(`Messages: ${messages.length}`);
  lines.push(`Errors: ${errorEvents.length}`);
  lines.push(`Tool calls: ${toolEvents.length}`);
  lines.push(`Agents: ${formatCounts(agentCounts, 6)}`);
  lines.push(`Events: ${formatCounts(eventCounts, 12)}`);
  lines.push("");

  if (errorEvents.length > 0) {
    lines.push(`--- ERRORS (${errorEvents.length}) ---`);
    for (const event of errorEvents.slice(0, 10)) {
      const data = asRecord(event.data);
      const diagnostic = asRecord(data?.diagnostic);
      const message =
        asString(data?.message) ||
        asString(data?.errorMessage) ||
        asString(diagnostic?.message) ||
        asString(data?.errorCode) ||
        "Unknown error";
      const code =
        asString(data?.errorCode) ||
        asString(diagnostic?.code) ||
        asString(data?.reasonCode) ||
        asString(event.type) ||
        "unknown";
      lines.push(
        `${SEVERITY_ICON.error} ${code} in ${asString(event.agentName) || "unknown"} @ ${asString(event.timestamp) || "unknown time"}`,
      );
      lines.push(`  ${message}`);
    }
    if (errorEvents.length > 10) {
      lines.push(
        `  ... ${errorEvents.length - 10} more error-like events omitted`,
      );
    }
    lines.push("");
  }

  if (routingEvents.length > 0) {
    lines.push(`--- ROUTING / HANDOFFS (${routingEvents.length}) ---`);
    for (const event of routingEvents.slice(-12)) {
      lines.push(formatRoutingEvent(event));
    }
    lines.push("");
  }

  if (toolEvents.length > 0) {
    lines.push(`--- TOOL CALLS (${toolEvents.length}) ---`);
    for (const event of toolEvents.slice(0, 12)) {
      const data = asRecord(event.data);
      const toolName =
        asString(data?.toolName) || asString(data?.tool) || "unknown_tool";
      const success = data?.success === false ? "failed" : "ok";
      lines.push(
        `- ${asString(event.timestamp) || "unknown time"} ${asString(event.agentName) || "unknown"} -> ${toolName} (${success})`,
      );
    }
    if (toolEvents.length > 12) {
      lines.push(`  ... ${toolEvents.length - 12} more tool calls omitted`);
    }
    lines.push("");
  }

  if (messages.length > 0) {
    lines.push(`--- CONVERSATION (${messages.length}) ---`);
    for (const message of messages.slice(-12)) {
      const role = asString(message.role) || "unknown";
      const content = truncate(asString(message.content) || "", 180);
      lines.push(`- ${role}: ${content}`);
    }
    lines.push("");
  }

  lines.push("--- TROUBLESHOOTING NOTES ---");
  for (const note of buildRuntimeProxyNotes(input.traces, errorEvents)) {
    lines.push(`- ${note}`);
  }

  return lines.join("\n");
}

function buildRuntimeProxyNotes(
  traces: JsonRecord[],
  errorEvents: JsonRecord[],
): string[] {
  const notes: string[] = [
    "This is a persisted Studio/UI session; live-only MCP tools may show empty in-memory traces unless they subscribed while the session was running.",
  ];

  const modelProviderError = errorEvents.some((event) => {
    const data = asRecord(event.data);
    const diagnostic = asRecord(data?.diagnostic);
    return (
      asString(data?.errorCode) === "MODEL_API_ERROR" ||
      asString(diagnostic?.code) === "MODEL_PROVIDER_UNAVAILABLE"
    );
  });
  if (modelProviderError) {
    notes.push(
      "A model provider error was handled during the session; inspect model binding, credentials, provider policy, and upstream provider health for the final active agent.",
    );
  }

  const newServiceIncomplete = traces.some((event) => {
    const data = asRecord(event.data);
    return (
      asString(data?.stepName) === "new_service_incomplete_set" ||
      safeStringify(data ?? {}).includes("new_service_incomplete")
    );
  });
  const transferAfterIncomplete = traces.some((event) => {
    const data = asRecord(event.data);
    return (
      asString(event.type) === "handoff" &&
      asString(data?.to) === "TransferCoordinator"
    );
  });
  if (newServiceIncomplete && transferAfterIncomplete) {
    notes.push(
      "The new-service collector reached an incomplete/fallback state and then routed to TransferCoordinator; review the collector retry branches before treating the transfer error as the root cause.",
    );
  }

  const staleHandoff = findStaleHandoff(traces);
  if (staleHandoff) {
    notes.push(
      `A handoff reused an older message (${JSON.stringify(staleHandoff.handoffMessage)}) instead of the latest user turn (${JSON.stringify(staleHandoff.latestUserMessage)}); check resume_intent handoff message propagation.`,
    );
  }

  return notes;
}

function findStaleHandoff(
  traces: JsonRecord[],
): { handoffMessage: string; latestUserMessage: string } | null {
  let latestUserMessage: string | null = null;

  for (const trace of traces) {
    const type = asString(trace.type);
    const data = asRecord(trace.data);
    if (type === "user_message") {
      latestUserMessage = asString(data?.message);
      continue;
    }
    if (type !== "handoff" || !latestUserMessage) {
      continue;
    }
    const handoffMessage = asString(data?.message);
    if (
      handoffMessage &&
      latestUserMessage &&
      normalizeText(handoffMessage) !== normalizeText(latestUserMessage)
    ) {
      return { handoffMessage, latestUserMessage };
    }
  }

  return null;
}

function formatRoutingEvent(event: JsonRecord): string {
  const data = asRecord(event.data);
  const timestamp = asString(event.timestamp) || "unknown time";
  const type = asString(event.type) || "unknown";
  const agentName = asString(event.agentName) || "unknown";

  if (type === "handoff") {
    return `- ${timestamp} ${agentName}: handoff ${asString(data?.from) || "?"} -> ${asString(data?.to) || "?"} (${asString(data?.reasonCode) || "no reason"}) message=${JSON.stringify(asString(data?.message) || "")}`;
  }

  if (type === "deterministic_routing") {
    return `- ${timestamp} ${agentName}: deterministic route -> ${asString(data?.target) || "?"} condition=${truncate(asString(data?.condition) || "", 160)}`;
  }

  if (type === "thread_return") {
    return `- ${timestamp} ${agentName}: thread return ${asString(data?.from) || "?"} -> ${asString(data?.to) || "?"} at ${asString(data?.stepName) || "unknown step"}`;
  }

  if (type === "resume_intent") {
    return `- ${timestamp} ${agentName}: resume intent to ${asString(data?.targetAgent) || "?"} originalMessage=${JSON.stringify(asString(data?.originalMessage) || "")}`;
  }

  if (type === "agent_switch") {
    return `- ${timestamp} ${agentName}: agent switch from ${asString(data?.previousAgent) || "?"} to ${asString(data?.agentName) || agentName}`;
  }

  return `- ${timestamp} ${agentName}: ${type}`;
}

function isRoutingTrace(trace: JsonRecord): boolean {
  const type = asString(trace.type);
  return (
    type === "handoff" ||
    type === "deterministic_routing" ||
    type === "thread_return" ||
    type === "resume_intent" ||
    type === "agent_switch"
  );
}

function isErrorTrace(trace: JsonRecord): boolean {
  const type = asString(trace.type);
  const data = asRecord(trace.data);
  return (
    type === "error" ||
    type === "agent_error_handled" ||
    asString(data?.errorType) !== null ||
    asString(data?.errorCode) !== null ||
    asRecord(data?.diagnostic) !== null
  );
}

function extractSession(body: unknown): JsonRecord | null {
  const root = asRecord(body);
  if (!root) return null;
  const direct = asRecord(root.session);
  if (direct) return direct;
  const data = asRecord(root.data);
  if (!data) return null;
  return asRecord(data.session) || data;
}

function extractTraces(body: unknown): JsonRecord[] {
  const root = asRecord(body);
  if (!root) return [];
  const direct = asRecordArray(root.traces);
  if (direct) return direct;
  const data = asRecord(root.data);
  if (!data) return [];
  return asRecordArray(data.traces) || asRecordArray(data.traceEvents) || [];
}

function extractTraceMeta(body: unknown): JsonRecord | null {
  const root = asRecord(body);
  if (!root) return null;
  const direct = asRecord(root._meta);
  if (direct) return direct;
  const data = asRecord(root.data);
  return asRecord(data?._meta);
}

function extractTraceTotal(body: unknown): number | null {
  const root = asRecord(body);
  if (!root) return null;
  return asNumber(root.total) ?? asNumber(asRecord(root.data)?.total);
}

function getAgentName(session: JsonRecord | null): string | null {
  if (!session) return null;
  const agent = asRecord(session.agent);
  return asString(agent?.name) || asString(session.agentName);
}

function getSessionMessages(session: JsonRecord | null): JsonRecord[] {
  if (!session) return [];
  return (
    asRecordArray(session.messages) || asRecordArray(session.conversation) || []
  );
}

function asRecord(value: unknown): JsonRecord | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonRecord;
  }
  return null;
}

function asRecordArray(value: unknown): JsonRecord[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is JsonRecord => asRecord(item) !== null);
}

function asString(value: unknown): string | null {
  if (value instanceof Date) {
    const timestamp = safeIsoTimestamp(value);
    return timestamp === "unknown" ? null : timestamp;
  }
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countBy(
  items: JsonRecord[],
  keyFn: (item: JsonRecord) => string,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function formatCounts(counts: Record<string, number>, limit: number): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "none";
  const shown = entries
    .slice(0, limit)
    .map(([key, value]) => `${key}:${value}`);
  if (entries.length > limit) {
    shown.push(`...${entries.length - limit} more`);
  }
  return shown.join(", ");
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// =============================================================================
// FORMATTING
// =============================================================================

function formatDiagnosticReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  // Status line
  const statusIcon = STATUS_ICON[report.status] || report.status;
  lines.push(
    `DIAGNOSIS: ${report.target.agentName} (${report.target.type}:${report.target.id}) -- ${statusIcon} ${report.status.toUpperCase()}`,
  );
  lines.push(
    `Timestamp: ${report.timestamp} | Analyzers: ${report.summary.analyzersRun.join(", ")}`,
  );
  lines.push(
    `Totals: ${report.summary.errors} errors, ${report.summary.warnings} warnings, ${report.summary.infos} info`,
  );
  lines.push("");

  // Findings grouped by severity
  const grouped: Record<string, DiagnosticFinding[]> = {
    error: [],
    warning: [],
    info: [],
  };
  for (const f of report.findings) {
    (grouped[f.severity] || grouped.info).push(f);
  }

  const severityOrder: Array<"error" | "warning" | "info"> = [
    "error",
    "warning",
    "info",
  ];
  for (const sev of severityOrder) {
    const findings = grouped[sev];
    if (findings.length === 0) continue;

    lines.push(`--- ${sev.toUpperCase()}S (${findings.length}) ---`);
    for (const f of findings) {
      lines.push(`${SEVERITY_ICON[f.severity]} ${f.title} [${f.code}]`);
      lines.push(`  Detail: ${f.detail}`);
      lines.push(`  Suggestion: ${f.suggestion}`);
      lines.push(`  Analyzer: ${f.analyzer}`);
      lines.push("");
    }
  }

  // Config summary
  if (report.config) {
    lines.push("--- CONFIG SUMMARY ---");
    formatConfigSection(report.config, lines);
  }

  return lines.join("\n");
}

function formatConfigOnlyReport(report: DiagnosticReport): string {
  const lines: string[] = [];

  lines.push(
    `INSPECT: ${report.target.agentName} -- ${report.status.toUpperCase()}`,
  );
  lines.push("");

  const { config } = report;

  // Model resolution chain
  if (config.model) {
    lines.push("=== Model Resolution Chain ===");
    if (config.model.chain) {
      for (const step of config.model.chain) {
        const icon = step.matched ? "[v]" : step.checked ? "[x]" : "[ ]";
        const value = step.value ? ` = ${step.value}` : "";
        lines.push(`  ${icon} L${step.level} ${step.name}${value}`);
        lines.push(`       ${step.reason}`);
      }
    }
    if (config.model.resolved) {
      const r = config.model.resolved;
      lines.push("");
      lines.push(`  Resolved Model: ${r.modelId}`);
      lines.push(`  Provider: ${r.provider}`);
      lines.push(`  Source: ${r.source}`);
    } else {
      lines.push("");
      lines.push("  Resolved Model: NONE -- model resolution failed");
    }
    lines.push("");
  }

  // Credential status
  if (config.credentials) {
    lines.push("=== Credential Status ===");
    const c = config.credentials;
    const status = c.available ? "AVAILABLE" : "MISSING";
    lines.push(`  Provider: ${c.provider}`);
    lines.push(`  Status: ${status}`);
    if (c.scope) lines.push(`  Scope: ${c.scope}`);
    if (c.isActive !== undefined)
      lines.push(`  Active: ${c.isActive ? "yes" : "no"}`);
    lines.push("");
  }

  // Tool binding status
  if (config.tools) {
    lines.push("=== Tool Binding ===");
    const t = config.tools;
    lines.push(`  Total: ${t.total}`);
    lines.push(`  Bound: ${t.bound}`);
    if (t.failed.length > 0) {
      lines.push(`  Failed (${t.failed.length}):`);
      for (const name of t.failed) {
        lines.push(`    - ${name}`);
      }
    } else {
      lines.push("  Failed: none");
    }
    lines.push("");
  }

  if (!config.model && !config.credentials && !config.tools) {
    lines.push("No configuration data returned by the diagnostic engine.");
  }

  return lines.join("\n");
}

function formatConfigSection(
  config: DiagnosticReport["config"],
  lines: string[],
): void {
  // Model resolution chain
  if (config.model) {
    lines.push("Model Resolution:");
    if (config.model.chain) {
      for (const step of config.model.chain) {
        const icon = step.matched ? "[v]" : step.checked ? "[x]" : "[ ]";
        const value = step.value ? ` = ${step.value}` : "";
        lines.push(
          `  ${icon} L${step.level} ${step.name}${value} (${step.reason})`,
        );
      }
    }
    if (config.model.resolved) {
      const r = config.model.resolved;
      lines.push(`  Resolved: ${r.modelId} via ${r.provider} (${r.source})`);
    }
    lines.push("");
  }

  // Credentials
  if (config.credentials) {
    const c = config.credentials;
    const status = c.available ? "available" : "MISSING";
    const active =
      c.isActive !== undefined ? (c.isActive ? ", active" : ", inactive") : "";
    const scope = c.scope ? ` (${c.scope})` : "";
    lines.push(`Credentials: ${c.provider} -- ${status}${active}${scope}`);
    lines.push("");
  }

  // Tools
  if (config.tools) {
    const t = config.tools;
    lines.push(`Tools: ${t.bound}/${t.total} bound`);
    if (t.failed.length > 0) {
      lines.push(`  Failed: ${t.failed.join(", ")}`);
    }
    lines.push("");
  }
}
