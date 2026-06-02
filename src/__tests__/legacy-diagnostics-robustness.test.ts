import { describe, expect, test } from "vitest";
import { SessionStore } from "../store/session-store.js";
import { TraceStore } from "../store/trace-store.js";
import { analyzeSession } from "../tools/analysis.js";
import { explainDecision } from "../tools/decisions.js";
import { getErrors } from "../tools/errors.js";
import type { DebugContext } from "../tools/index.js";
import { traces } from "../tools/traces.js";
import type { TraceEventWithId } from "../types.js";

function makeEvent(overrides: Partial<TraceEventWithId>): TraceEventWithId {
  return {
    id: "event-1",
    sessionId: "session-1",
    type: "agent_response",
    timestamp: new Date("2026-06-02T07:41:00.000Z"),
    data: {},
    ...overrides,
  } as TraceEventWithId;
}

function makeContext(events: TraceEventWithId[]): DebugContext {
  const sessionStore = new SessionStore();
  sessionStore.createSession("session-1", "FidiumCallSupervisor");
  const traceStore = new TraceStore();
  for (const event of events) {
    traceStore.addEvent(event);
  }

  return {
    sessionStore,
    traceStore,
    wsClient: { isConnected: () => false },
    httpClient: {},
    authenticate: async () => ({ status: "authenticated" }),
  } as unknown as DebugContext;
}

describe("legacy diagnostic tool robustness", () => {
  test("debug_traces returns JSON-safe summaries for circular payloads", async () => {
    const circular: Record<string, unknown> = { message: "provider failed" };
    circular.self = circular;
    const ctx = makeContext([
      makeEvent({
        id: "event-circular",
        type: "llm_sdk_error",
        data: circular,
      }),
    ]);

    const result = JSON.parse(
      await traces(
        { sessionId: "session-1", text: "provider", limit: 50 },
        ctx,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(result.events[0].data.self.self).toBe("[Circular]");
  });

  test("debug_explain_decision resolves event aliases and hides invalid timestamps", async () => {
    const ctx = makeContext([
      makeEvent({
        id: "normalized-event-id",
        eventId: "runtime-event-id",
        type: "handoff",
        timestamp: new Date("not-a-date"),
        data: { to: "TransferCoordinator", reason: "fallback" },
      }),
    ]);

    const result = JSON.parse(
      await explainDecision({ eventId: "runtime-event-id", lastN: 5 }, ctx),
    );

    expect(result.success).toBe(true);
    expect(result.explanation.eventId).toBe("normalized-event-id");
    expect(result.explanation.timestamp).toBe("unknown");
  });

  test("debug_analyze_session counts provider diagnostics as errors", async () => {
    const ctx = makeContext([
      makeEvent({
        id: "event-provider-error",
        type: "agent_response",
        data: {
          providerError: {
            message: "Vercel AI SDK rejected the request.",
          },
        },
      }),
    ]);

    const result = JSON.parse(
      await analyzeSession({ sessionId: "session-1" }, ctx),
    );

    expect(result.analysis.summary.errors).toBe(1);
    expect(result.analysis.issues[0]).toMatchObject({
      type: "error",
      eventId: "event-provider-error",
    });
  });

  test("debug_get_errors surfaces nested provider messages", async () => {
    const ctx = makeContext([
      makeEvent({
        id: "event-provider-error",
        type: "agent_response",
        data: {
          providerError: {
            message: "Provider refused the message array.",
          },
        },
      }),
    ]);

    const result = JSON.parse(
      await getErrors({ sessionId: "session-1", includeWarnings: true }, ctx),
    );

    expect(result.summary.errorCount).toBe(1);
    expect(result.errors[0].message).toBe(
      "Provider refused the message array.",
    );
  });
});
