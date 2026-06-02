import type { TraceEventWithId } from "../types.js";
import { safeIsoTimestamp, traceEventIdentifiers } from "./trace-formatting.js";

type JsonRecord = Record<string, unknown>;

export interface FormattedTraceEvent {
  id: string;
  identifiers: string[];
  type: string;
  label: string;
  timestamp: string;
  agentName?: string;
  traceId?: string;
  spanId?: string;
  summary: string;
  data?: JsonRecord;
}

export interface TraceEventExplanation {
  headline: string;
  happened: string;
  why: string;
  likelyImpact: string;
  inspectNext: string[];
  capturedInputs: Array<{ label: string; value: string }>;
  nearbyEvents: FormattedTraceEvent[];
  rawEvidence: {
    eventId: string;
    eventType: string;
    timestamp: string;
    traceId?: string;
    spanId?: string;
    sessionId: string;
  };
}

export interface InteractionTimelineItem {
  eventId: string;
  type: string;
  label: string;
  timestamp: string;
  agentName?: string;
  spanId?: string;
  summary: string;
  provider?: string;
  model?: string;
  stage?: string;
  status?: string;
  severity: "info" | "warning" | "error";
}

export interface InteractionReport {
  summary: {
    totalEvents: number;
    errorEvents: number;
    providers: string[];
    models: string[];
    spanIds: string[];
    firstEventAt?: string;
    lastEventAt?: string;
  };
  timeline: InteractionTimelineItem[];
}

const TRACE_EVENT_LABELS: Record<string, string> = {
  llm_call: "LLM Call",
  llm_request_built: "Model Request Prepared",
  llm_request_validation_failed: "Model Request Invalid",
  llm_sdk_error: "Model SDK Error",
  voice_llm: "Voice Model Call",
  voice_realtime_session_config: "Realtime Session Config",
  voice_realtime_provider_event: "Realtime Provider Event",
  voice_realtime_provider_error: "Realtime Provider Error",
  voice_realtime_diagnostic: "Realtime Diagnostic",
  voice_realtime_connection: "Realtime Connection",
  voice_realtime_turn_start: "Realtime Turn Start",
  voice_realtime_turn_end: "Realtime Turn End",
  voice_realtime_tool_call: "Realtime Tool Call",
  voice_realtime_interruption: "Realtime Interruption",
};

const MODEL_EVENT_TYPES = new Set([
  "llm_call",
  "llm_request_built",
  "llm_request_validation_failed",
  "llm_sdk_error",
  "voice_llm",
]);

const REALTIME_EVENT_TYPES = new Set([
  "voice_realtime_session_config",
  "voice_realtime_provider_event",
  "voice_realtime_provider_error",
  "voice_realtime_diagnostic",
  "voice_realtime_connection",
  "voice_realtime_turn_start",
  "voice_realtime_turn_end",
  "voice_realtime_tool_call",
  "voice_realtime_interruption",
]);

const INPUT_KEYS = [
  "provider",
  "model",
  "operationType",
  "stage",
  "category",
  "errorCode",
  "errorType",
  "errorSubtype",
  "toolName",
  "tool",
  "agentName",
  "stepName",
  "fieldName",
  "condition",
  "reason",
  "message",
  "requestId",
  "responseId",
  "sessionId",
  "providerEventType",
  "eventType",
  "eventName",
  "providerSessionId",
  "realtimeSessionId",
  "connectionId",
  "status",
  "closeCode",
  "closeReason",
  "messageCount",
  "contentBlockCount",
  "audioFormat",
  "inputAudioFormat",
  "outputAudioFormat",
  "voice",
  "modality",
  "modalities",
];

export function getTraceEventLabel(type: string): string {
  return (
    TRACE_EVENT_LABELS[type] ??
    type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function summarizeTraceEvent(event: TraceEventWithId): string {
  const data = event.data;
  switch (event.type) {
    case "llm_call":
      return compactJoin([
        getFirstString(data, ["provider"]),
        getFirstString(data, ["model"]),
        tokenSummary(data),
      ]);
    case "llm_request_built":
      return compactJoin([providerModelSummary(data), countSummary(data)]);
    case "llm_request_validation_failed":
    case "llm_sdk_error":
      return compactJoin([providerModelSummary(data), diagnosticMessage(data)]);
    case "voice_realtime_session_config":
      return compactJoin([
        providerModelSummary(data),
        getFirstString(data, ["voice"]),
        getFirstString(data, ["modality", "modalities"]),
        getFirstString(data, [
          "audioFormat",
          "inputAudioFormat",
          "outputAudioFormat",
        ]),
      ]);
    case "voice_realtime_provider_event":
      return compactJoin([
        getFirstNestedString(data, [
          "providerEventType",
          "eventType",
          "eventName",
          "type",
        ]),
        getFirstString(data, ["status", "stage"]),
      ]);
    case "voice_realtime_provider_error":
    case "voice_realtime_diagnostic":
      return compactJoin([
        diagnosticMessage(data),
        getFirstString(data, ["closeCode"]),
      ]);
    default:
      return (
        diagnosticMessage(data) ||
        getFirstString(data, ["message", "summary", "reason"])
      );
  }
}

export function formatTraceEvent(
  event: TraceEventWithId,
  options: { includeData?: boolean } = {},
): FormattedTraceEvent {
  return {
    id: event.id,
    identifiers: traceEventIdentifiers(event),
    type: event.type,
    label: getTraceEventLabel(event.type),
    timestamp: formatEventTimestamp(event),
    ...(event.agentName ? { agentName: event.agentName } : {}),
    ...(event.traceId ? { traceId: event.traceId } : {}),
    ...(event.spanId ? { spanId: event.spanId } : {}),
    summary: summarizeTraceEvent(event),
    ...(options.includeData ? { data: compactTraceData(event.data) } : {}),
  };
}

export function findTraceEvent(
  events: TraceEventWithId[],
  eventId: string,
): TraceEventWithId | undefined {
  return events.find((event) => traceEventIdentifiers(event).includes(eventId));
}

export function getNearbyTraceEvents(
  events: TraceEventWithId[],
  eventId: string,
  radius = 2,
): TraceEventWithId[] {
  const index = events.findIndex((event) =>
    traceEventIdentifiers(event).includes(eventId),
  );
  if (index < 0) return [];
  const start = Math.max(0, index - radius);
  const end = Math.min(events.length, index + radius + 1);
  return events.slice(start, end);
}

export function explainTraceEvent(
  event: TraceEventWithId,
  allEvents: TraceEventWithId[],
): TraceEventExplanation {
  const label = getTraceEventLabel(event.type);
  const summary = summarizeTraceEvent(event);
  return {
    headline: summary ? `${label}: ${summary}` : label,
    happened: summary || `${label} was recorded.`,
    why: traceEventWhy(event),
    likelyImpact: traceEventImpact(event),
    inspectNext: traceEventInspectNext(event),
    capturedInputs: capturedInputs(event),
    nearbyEvents: getNearbyTraceEvents(allEvents, event.id).map((nearbyEvent) =>
      formatTraceEvent(nearbyEvent),
    ),
    rawEvidence: {
      eventId: event.id,
      eventType: event.type,
      timestamp: formatEventTimestamp(event),
      ...(event.traceId ? { traceId: event.traceId } : {}),
      ...(event.spanId ? { spanId: event.spanId } : {}),
      sessionId: event.sessionId,
    },
  };
}

export function buildModelInteractionReport(
  events: TraceEventWithId[],
): InteractionReport {
  return buildInteractionReport(events.filter(isModelInteractionEvent));
}

export function buildRealtimeInteractionReport(
  events: TraceEventWithId[],
): InteractionReport {
  return buildInteractionReport(events.filter(isRealtimeInteractionEvent));
}

function buildInteractionReport(events: TraceEventWithId[]): InteractionReport {
  const timeline = events.map((event) => {
    const data = event.data;
    return {
      eventId: event.id,
      type: event.type,
      label: getTraceEventLabel(event.type),
      timestamp: formatEventTimestamp(event),
      ...(event.agentName ? { agentName: event.agentName } : {}),
      ...(event.traceId ? { traceId: event.traceId } : {}),
      ...(event.spanId ? { spanId: event.spanId } : {}),
      summary: summarizeTraceEvent(event),
      ...(getFirstNestedString(data, ["provider", "providerName"])
        ? { provider: getFirstNestedString(data, ["provider", "providerName"]) }
        : {}),
      ...(getFirstNestedString(data, ["model", "modelId", "deployment"])
        ? {
            model: getFirstNestedString(data, [
              "model",
              "modelId",
              "deployment",
            ]),
          }
        : {}),
      ...(getFirstNestedString(data, ["stage"])
        ? { stage: getFirstNestedString(data, ["stage"]) }
        : {}),
      ...(getFirstNestedString(data, ["status"])
        ? { status: getFirstNestedString(data, ["status"]) }
        : {}),
      severity: eventSeverity(event),
    };
  });

  return {
    summary: {
      totalEvents: timeline.length,
      errorEvents: timeline.filter((item) => item.severity === "error").length,
      providers: uniqueStrings(timeline.map((item) => item.provider)),
      models: uniqueStrings(timeline.map((item) => item.model)),
      spanIds: uniqueStrings(timeline.map((item) => item.spanId)),
      ...(timeline[0] ? { firstEventAt: timeline[0].timestamp } : {}),
      ...(timeline[timeline.length - 1]
        ? { lastEventAt: timeline[timeline.length - 1].timestamp }
        : {}),
    },
    timeline,
  };
}

function traceEventWhy(event: TraceEventWithId): string {
  const message = diagnosticMessage(event.data);
  if (message) return message;

  switch (event.type) {
    case "llm_request_built":
      return "The runtime prepared the final provider-facing model request before the SDK call.";
    case "llm_request_validation_failed":
      return "The runtime found the model request was invalid before sending it to the provider SDK.";
    case "llm_sdk_error":
      return "The provider SDK returned an error while the runtime was interacting with the model provider.";
    case "voice_realtime_session_config":
      return "The runtime captured the realtime session settings before opening or updating the provider connection.";
    case "voice_realtime_provider_event":
      return "The realtime provider emitted an event describing active session progress.";
    case "voice_realtime_provider_error":
      return "The realtime provider emitted an error event during the voice session.";
    case "voice_realtime_diagnostic":
      return "The realtime runtime emitted a diagnostic about provider, audio, or session behavior.";
    default:
      return "This event was recorded as part of the session trace timeline.";
  }
}

function traceEventImpact(event: TraceEventWithId): string {
  switch (event.type) {
    case "llm_request_validation_failed":
      return "The provider call was blocked before the SDK request, so the user response depends on runtime error handling.";
    case "llm_sdk_error":
      return "The model interaction failed at the provider boundary and may have been surfaced as a model/runtime error.";
    case "voice_realtime_provider_error":
    case "voice_realtime_diagnostic":
      return "Realtime voice behavior may be interrupted or degraded for this turn.";
    case "voice_realtime_session_config":
      return "This is configuration evidence; compare later provider errors against these settings.";
    case "voice_realtime_provider_event":
      return "This may be normal realtime progress unless nearby provider errors or diagnostics show degradation.";
    default:
      if (eventSeverity(event) === "error") {
        return "This is error-like evidence and should be reviewed with nearby trace events.";
      }
      return "This event contributes evidence to the trace timeline.";
  }
}

function traceEventInspectNext(event: TraceEventWithId): string[] {
  switch (event.type) {
    case "llm_request_validation_failed":
      return [
        "Inspect the model request built immediately before this event.",
        "Verify message content, role ordering, model selection, tools, and provider capabilities before the SDK call.",
      ];
    case "llm_sdk_error":
      return [
        "Preserve provider error code, status, request id, and response body excerpt.",
        "Check whether the failure is availability, authentication, rate limit, model/provider mapping, or invalid request shape.",
      ];
    case "voice_realtime_session_config":
      return [
        "Compare realtime session settings with provider capability requirements.",
        "Verify model, voice, modalities, audio formats, and turn detection.",
      ];
    case "voice_realtime_provider_error":
    case "voice_realtime_diagnostic":
      return [
        "Inspect realtime session configuration and provider event order.",
        "Check whether audio/input events were accepted before the failure.",
      ];
    case "voice_realtime_provider_event":
      return [
        "Check nearby provider events to determine whether this is normal progress or degradation.",
      ];
    default:
      return ["Compare this event with preceding and following trace events."];
  }
}

function capturedInputs(
  event: TraceEventWithId,
): Array<{ label: string; value: string }> {
  const nestedRecords = nestedDataRecords(event.data);
  const inputs: Array<{ label: string; value: string }> = [];

  for (const key of INPUT_KEYS) {
    for (const record of nestedRecords) {
      const value = stringifyValue(record[key]);
      if (value) {
        inputs.push({ label: toLabel(key), value });
        break;
      }
    }
  }

  return inputs.slice(0, 12);
}

function compactTraceData(data: JsonRecord): JsonRecord {
  const keepKeys = [
    "provider",
    "model",
    "operationType",
    "stage",
    "category",
    "errorType",
    "errorSubtype",
    "errorCode",
    "code",
    "message",
    "reason",
    "requestId",
    "responseId",
    "sessionId",
    "providerEventType",
    "eventType",
    "eventName",
    "providerSessionId",
    "realtimeSessionId",
    "connectionId",
    "status",
    "closeCode",
    "closeReason",
    "messageCount",
    "contentBlockCount",
    "audioFormat",
    "inputAudioFormat",
    "outputAudioFormat",
    "voice",
    "modality",
    "modalities",
    "sdkError",
    "providerError",
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

function providerModelSummary(data: JsonRecord): string {
  return compactJoin(
    [
      getFirstNestedString(data, ["provider", "providerName"]),
      getFirstNestedString(data, ["model", "modelId", "deployment"]),
    ],
    " / ",
  );
}

function countSummary(data: JsonRecord): string {
  const counts = [];
  const messageCount = getFirstString(data, ["messageCount"]);
  const contentBlockCount = getFirstString(data, ["contentBlockCount"]);
  const toolCount = getFirstString(data, ["toolCount"]);
  if (messageCount) counts.push(`${messageCount} messages`);
  if (contentBlockCount) counts.push(`${contentBlockCount} content blocks`);
  if (toolCount) counts.push(`${toolCount} tools`);
  return counts.join(" / ");
}

function tokenSummary(data: JsonRecord): string {
  const tokensIn = getFirstString(data, ["tokensIn", "promptTokens"]);
  const tokensOut = getFirstString(data, ["tokensOut", "completionTokens"]);
  if (!tokensIn && !tokensOut) return "";
  return `${tokensIn || "?"} in / ${tokensOut || "?"} out`;
}

function diagnosticMessage(data: JsonRecord): string {
  return (
    getFirstNestedString(data, [
      "message",
      "summary",
      "error",
      "errorMessage",
      "reason",
      "cause",
    ]) || getFirstNestedString(data, ["code", "errorCode", "errorSubtype"])
  );
}

function getFirstNestedString(data: JsonRecord, keys: string[]): string {
  for (const record of nestedDataRecords(data)) {
    const value = getFirstString(record, keys);
    if (value) return value;
  }
  return "";
}

function nestedDataRecords(data: JsonRecord): JsonRecord[] {
  return [
    data,
    asRecord(data.diagnostic),
    asRecord(data.diagnosticEnvelope),
    asRecord(data.runtimeDiagnostic),
    asRecord(data.sdkError),
    asRecord(data.providerError),
    asRecord(data.errorEnvelope),
  ].filter((record): record is JsonRecord => record !== null);
}

function getFirstString(data: JsonRecord, keys: string[]): string {
  for (const key of keys) {
    const value = stringifyValue(data[key]);
    if (value) return value;
  }
  return "";
}

function stringifyValue(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value.join(", ");
  }
  return "";
}

function eventSeverity(event: TraceEventWithId): "info" | "warning" | "error" {
  const severity =
    getFirstNestedString(event.data, ["severity"]) ||
    getFirstString(event.data, ["level"]);
  if (severity === "warning" || severity === "warn") return "warning";
  if (severity === "info" || severity === "debug") return "info";
  if (
    event.type.includes("error") ||
    event.type === "llm_request_validation_failed" ||
    event.data.error !== undefined ||
    event.data.errorCode !== undefined
  ) {
    return "error";
  }
  return "info";
}

function isModelInteractionEvent(event: TraceEventWithId): boolean {
  if (MODEL_EVENT_TYPES.has(event.type)) return true;
  if (event.type.startsWith("llm_")) return true;
  const category = getFirstNestedString(event.data, ["category"]);
  const operationType = getFirstNestedString(event.data, ["operationType"]);
  return category === "llm" || operationType.includes("model");
}

function isRealtimeInteractionEvent(event: TraceEventWithId): boolean {
  if (REALTIME_EVENT_TYPES.has(event.type)) return true;
  if (event.type.startsWith("voice_realtime")) return true;
  const category = getFirstNestedString(event.data, ["category"]);
  const providerEventType = getFirstNestedString(event.data, [
    "providerEventType",
    "eventType",
  ]);
  return category === "realtime" || Boolean(providerEventType);
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

function compactJoin(
  values: Array<string | undefined>,
  separator = " — ",
): string {
  return values
    .filter((value): value is string => Boolean(value))
    .join(separator);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function toLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").toLowerCase();
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function formatEventTimestamp(event: TraceEventWithId): string {
  return safeIsoTimestamp(event.timestamp);
}
