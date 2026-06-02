import type { TraceEventWithId } from "../types.js";

const UNKNOWN_TIMESTAMP = "unknown";

export function safeTimeMs(value: unknown): number | null {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === "string" && value.length > 0) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : null;
  }

  return null;
}

export function safeIsoTimestamp(
  value: unknown,
  fallback = UNKNOWN_TIMESTAMP,
): string {
  const time = safeTimeMs(value);
  return time === null ? fallback : new Date(time).toISOString();
}

export function compareTraceEventsChronologically(
  a: TraceEventWithId,
  b: TraceEventWithId,
): number {
  return compareNullableTimes(safeTimeMs(a.timestamp), safeTimeMs(b.timestamp));
}

export function compareTraceEventsRecentFirst(
  a: TraceEventWithId,
  b: TraceEventWithId,
): number {
  return compareNullableTimes(safeTimeMs(b.timestamp), safeTimeMs(a.timestamp));
}

export function safeStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();

  try {
    const result = JSON.stringify(
      value,
      (_key, nestedValue: unknown) => {
        if (typeof nestedValue === "object" && nestedValue !== null) {
          if (seen.has(nestedValue)) return "[Circular]";
          seen.add(nestedValue);
        }
        return nestedValue;
      },
      space,
    );
    return result ?? String(value);
  } catch {
    return String(value);
  }
}

export function isErrorLikeTraceEvent(event: TraceEventWithId): boolean {
  const data = event.data || {};
  const diagnostic =
    asRecord(data.diagnostic) ||
    asRecord(data.diagnosticEnvelope) ||
    asRecord(data.runtimeDiagnostic);

  return (
    event.type === "error" ||
    event.type.includes("error") ||
    event.type === "escalation" ||
    event.type === "agent_error_handled" ||
    event.type === "llm_request_validation_failed" ||
    event.type === "tool_call_error" ||
    event.type === "tool_error" ||
    data.error !== undefined ||
    data.sdkError !== undefined ||
    data.providerError !== undefined ||
    data.errorEnvelope !== undefined ||
    data.errorType !== undefined ||
    data.errorMessage !== undefined ||
    data.errorCode !== undefined ||
    data.warning !== undefined ||
    diagnostic !== null
  );
}

export function traceEventIdentifiers(event: TraceEventWithId): string[] {
  const data = event.data || {};
  const values = [
    event.id,
    event.eventId,
    event.eventCursor,
    typeof event.eventSeq === "number" ? String(event.eventSeq) : undefined,
    event.traceId,
    event.spanId,
    event.parentSpanId,
    stringField(data.eventId),
    stringField(data.event_id),
    stringField(data.id),
    stringField(data._id),
    stringField(data.traceId),
    stringField(data.trace_id),
    stringField(data.requestId),
    stringField(data.request_id),
    stringField(data.responseId),
    stringField(data.response_id),
    stringField(data.eventCursor),
    stringField(data.event_cursor),
    stringField(data.spanId),
    stringField(data.span_id),
  ];

  return [
    ...new Set(values.filter((value): value is string => Boolean(value))),
  ];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function compareNullableTimes(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function stringField(value: unknown): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return undefined;
}
