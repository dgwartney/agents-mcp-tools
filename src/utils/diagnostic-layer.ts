import type { TraceEventWithId } from "../types.js";
import { safeIsoTimestamp } from "./trace-formatting.js";

type JsonRecord = Record<string, unknown>;

export interface DiagnosticEvidenceItem {
  eventId: string;
  type: string;
  timestamp: string;
  agentName?: string;
  summary: string;
  data?: JsonRecord;
}

export interface DiagnosticGroup {
  id: string;
  title: string;
  severity: "error" | "warning" | "info";
  category: string;
  stage?: string;
  code?: string;
  rootCause?: string;
  operatorSummary?: string;
  recommendedActions: string[];
  evidence: DiagnosticEvidenceItem[];
  relatedEventIds: string[];
}

export interface DiagnosticLayer {
  summary: {
    groupCount: number;
    errorGroups: number;
    warningGroups: number;
    infoGroups: number;
    rawEvidenceEvents: number;
  };
  groups: DiagnosticGroup[];
}

const DIAGNOSTIC_EVENT_TYPES = new Set([
  "error",
  "warning",
  "agent_error_handled",
  "llm_request_validation_failed",
  "llm_sdk_error",
  "voice_realtime_provider_error",
  "voice_realtime_diagnostic",
  "tool_call_error",
  "tool_error",
  "handoff_failure",
]);

export function buildDiagnosticLayer(
  events: TraceEventWithId[],
): DiagnosticLayer {
  const groupsByKey = new Map<string, DiagnosticGroup>();

  for (const event of events) {
    if (!isDiagnosticEvent(event)) {
      continue;
    }
    const group = getOrCreateGroup(groupsByKey, event);
    group.evidence.push(formatEvidence(event));
    group.relatedEventIds.push(event.id);
  }

  const groups = [...groupsByKey.values()].sort(
    (a, b) => severityRank(b.severity) - severityRank(a.severity),
  );
  return {
    summary: {
      groupCount: groups.length,
      errorGroups: groups.filter((group) => group.severity === "error").length,
      warningGroups: groups.filter((group) => group.severity === "warning")
        .length,
      infoGroups: groups.filter((group) => group.severity === "info").length,
      rawEvidenceEvents: groups.reduce(
        (total, group) => total + group.evidence.length,
        0,
      ),
    },
    groups,
  };
}

function isDiagnosticEvent(event: TraceEventWithId): boolean {
  if (DIAGNOSTIC_EVENT_TYPES.has(event.type)) return true;
  if (
    asRecord(event.data.diagnostic) ||
    asRecord(event.data.diagnosticEnvelope) ||
    asRecord(event.data.runtimeDiagnostic) ||
    asRecord(event.data.errorEnvelope) ||
    asRecord(event.data.sdkError) ||
    asRecord(event.data.providerError) ||
    event.data.error !== undefined ||
    event.data.errorCode !== undefined ||
    event.data.errorMessage !== undefined ||
    event.data.warning !== undefined
  ) {
    return true;
  }
  return false;
}

function getOrCreateGroup(
  groupsByKey: Map<string, DiagnosticGroup>,
  event: TraceEventWithId,
): DiagnosticGroup {
  const envelope = extractEnvelope(event);
  const code =
    asString(envelope?.code) ||
    asString(envelope?.errorCode) ||
    asString(event.data.errorCode) ||
    asString(asRecord(event.data.sdkError)?.code) ||
    asString(asRecord(event.data.providerError)?.code) ||
    asString(event.data.code);
  const category =
    asString(envelope?.category) ||
    asString(event.data.category) ||
    inferCategory(event.type, event.data);
  const stage = asString(envelope?.stage) || asString(event.data.stage);
  const title = buildTitle(event, envelope, code, category);
  const key = [category, stage ?? "unknown_stage", code ?? title].join(":");

  const existing = groupsByKey.get(key);
  if (existing) {
    return existing;
  }

  const group: DiagnosticGroup = {
    id: key,
    title,
    severity: inferSeverity(event, envelope),
    category,
    ...(stage ? { stage } : {}),
    ...(code ? { code } : {}),
    rootCause:
      asString(envelope?.rootCause) ||
      asString(envelope?.cause) ||
      asString(event.data.rootCause) ||
      undefined,
    operatorSummary:
      asString(envelope?.operatorSummary) ||
      asString(envelope?.operator_hint) ||
      asString(envelope?.message) ||
      asString(asRecord(event.data.diagnostic)?.operatorHint) ||
      diagnosticMessage(event.data) ||
      undefined,
    recommendedActions: extractRecommendedActions(envelope, event),
    evidence: [],
    relatedEventIds: [],
  };
  groupsByKey.set(key, group);
  return group;
}

function extractEnvelope(event: TraceEventWithId): JsonRecord | null {
  return (
    asRecord(event.data.diagnostic) ||
    asRecord(event.data.diagnosticEnvelope) ||
    asRecord(event.data.runtimeDiagnostic) ||
    asRecord(event.data.errorEnvelope) ||
    asRecord(event.data.sdkError) ||
    asRecord(event.data.providerError)
  );
}

function buildTitle(
  event: TraceEventWithId,
  envelope: JsonRecord | null,
  code?: string | null,
  category?: string,
): string {
  const summary =
    asString(envelope?.operatorSummary) ||
    asString(envelope?.operator_hint) ||
    asString(envelope?.message) ||
    diagnosticMessage(event.data);
  if (summary) return summary;
  if (code) return `${category ?? "runtime"} diagnostic: ${code}`;
  return `${category ?? "runtime"} diagnostic from ${event.type}`;
}

function formatEvidence(event: TraceEventWithId): DiagnosticEvidenceItem {
  return {
    eventId: event.id,
    type: event.type,
    timestamp: formatEventTimestamp(event),
    ...(event.agentName ? { agentName: event.agentName } : {}),
    summary:
      diagnosticMessage(event.data) ||
      asString(event.data.eventType) ||
      event.type,
    data: compactData(event.data),
  };
}

function compactData(data: JsonRecord): JsonRecord {
  const keepKeys = [
    "agent",
    "agentName",
    "errorType",
    "errorSubtype",
    "errorCode",
    "code",
    "message",
    "provider",
    "model",
    "operationType",
    "stage",
    "category",
    "eventType",
    "providerEventType",
    "requestId",
    "responseId",
    "realtimeSessionId",
    "providerSessionId",
    "closeCode",
    "closeReason",
    "sdkError",
    "providerError",
    "summary",
    "issues",
    "diagnostic",
    "diagnosticEnvelope",
    "runtimeDiagnostic",
    "errorEnvelope",
  ];
  return Object.fromEntries(
    keepKeys
      .filter((key) => key in data)
      .map((key) => [key, compactUnknown(data[key])]),
  );
}

function extractRecommendedActions(
  envelope: JsonRecord | null,
  event: TraceEventWithId,
): string[] {
  const fromEnvelope = asStringArray(envelope?.recommendedActions);
  if (fromEnvelope.length > 0) return fromEnvelope;
  const fromEvent = asStringArray(event.data.recommendedActions);
  if (fromEvent.length > 0) return fromEvent;
  const suggestedFixes = asStringArray(event.data.suggestedFixes);
  if (suggestedFixes.length > 0) return suggestedFixes;
  const single =
    asString(envelope?.recommended_action) ||
    asString(envelope?.recommendedAction) ||
    asString(asRecord(event.data.diagnostic)?.recommendedAction) ||
    asString(event.data.recommendedAction);
  if (single) return [single];
  const eventType = String(event.type);
  if (
    eventType === "llm_sdk_error" ||
    eventType === "llm_request_validation_failed"
  ) {
    return [
      "Inspect the model request, route, handoff, tool, and state events immediately before this error.",
    ];
  }
  if (eventType === "voice_realtime_provider_error") {
    return [
      "Inspect realtime session config, provider event payload, close/reconnect events, and tool-result injection.",
    ];
  }
  return [];
}

function inferSeverity(
  event: TraceEventWithId,
  envelope: JsonRecord | null,
): DiagnosticGroup["severity"] {
  const severity =
    asString(envelope?.severity) || asString(event.data.severity);
  if (severity === "warning" || severity === "info" || severity === "error")
    return severity;
  if (severity === "warn") return "warning";
  return event.type === "warning" ? "warning" : "error";
}

function inferCategory(type: string, data: JsonRecord): string {
  if (type.startsWith("voice_realtime")) return "realtime";
  if (type.startsWith("llm_") || asString(data.errorType) === "llm_error")
    return "llm";
  if (type.includes("tool")) return "tool";
  if (type.includes("handoff")) return "handoff";
  return "runtime";
}

function severityRank(severity: DiagnosticGroup["severity"]): number {
  if (severity === "error") return 3;
  if (severity === "warning") return 2;
  return 1;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function diagnosticMessage(data: JsonRecord): string | null {
  return (
    firstNestedString(data, [
      "message",
      "summary",
      "error",
      "errorMessage",
      "reason",
      "cause",
    ]) || firstNestedString(data, ["code", "errorCode", "errorSubtype"])
  );
}

function firstNestedString(data: JsonRecord, keys: string[]): string | null {
  const records = [
    data,
    asRecord(data.diagnostic),
    asRecord(data.diagnosticEnvelope),
    asRecord(data.runtimeDiagnostic),
    asRecord(data.errorEnvelope),
    asRecord(data.sdkError),
    asRecord(data.providerError),
  ].filter((record): record is JsonRecord => record !== null);

  for (const record of records) {
    for (const key of keys) {
      const value = asString(record[key]);
      if (value) return value;
    }
  }

  return null;
}

function compactUnknown(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") {
    return value.length > 500 ? `${value.slice(0, 500)}...` : value;
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const items = value
      .slice(0, 20)
      .map((item) => compactUnknown(item, depth + 1, seen));
    if (value.length > 20) items.push(`... (${value.length} total)`);
    return items;
  }
  const record = asRecord(value);
  if (!record) return undefined;
  if (seen.has(record)) return "[Circular]";
  seen.add(record);
  if (depth >= 2) return { _truncated: true };
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 30)
      .map(([key, item]) => [key, compactUnknown(item, depth + 1, seen)]),
  );
}

function formatEventTimestamp(event: TraceEventWithId): string {
  return safeIsoTimestamp(event.timestamp);
}
