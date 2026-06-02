import { describe, expect, test } from "vitest";
import { SessionStore } from "../store/session-store.js";
import { TraceStore } from "../store/trace-store.js";
import type { DebugContext } from "../tools/index.js";
import {
  explainTraceEventTool,
  getTraceEvent,
  modelInteractions,
  realtimeInteractions,
} from "../tools/trace-diagnostics.js";
import {
  buildModelInteractionReport,
  buildRealtimeInteractionReport,
  explainTraceEvent,
  findTraceEvent,
  formatTraceEvent,
} from "../utils/trace-diagnostics.js";
import type { TraceEventWithId } from "../types.js";

function makeEvent(
  overrides: Partial<TraceEventWithId> & {
    id: string;
    type: TraceEventWithId["type"];
  },
): TraceEventWithId {
  return {
    sessionId: "session-1",
    timestamp: new Date("2026-06-02T07:41:00.000Z"),
    data: {},
    ...overrides,
  };
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

describe("trace diagnostics utilities", () => {
  test("explains model request validation failures with provider inputs", () => {
    const event = makeEvent({
      id: "event-invalid",
      type: "llm_request_validation_failed",
      data: {
        provider: "openai",
        model: "gpt-5.4",
        operationType: "tool-use-stream",
        diagnostic: {
          message: "The prepared SDK request had no valid message content.",
        },
      },
    });

    const explanation = explainTraceEvent(event, [event]);

    expect(explanation.headline).toContain("Model Request Invalid");
    expect(explanation.why).toBe(
      "The prepared SDK request had no valid message content.",
    );
    expect(explanation.capturedInputs).toEqual(
      expect.arrayContaining([
        { label: "provider", value: "openai" },
        { label: "model", value: "gpt-5.4" },
        { label: "operation type", value: "tool-use-stream" },
      ]),
    );
    expect(explanation.inspectNext[0]).toContain("model request");
  });

  test("builds model and realtime interaction reports", () => {
    const events = [
      makeEvent({
        id: "event-built",
        type: "llm_request_built",
        data: { provider: "openai", model: "gpt-5.4", messageCount: 4 },
      }),
      makeEvent({
        id: "event-sdk-error",
        type: "llm_sdk_error",
        data: {
          provider: "openai",
          model: "gpt-5.4",
          sdkError: { message: "Provider failed" },
        },
      }),
      makeEvent({
        id: "event-realtime",
        type: "voice_realtime_provider_event",
        data: {
          providerEventType: "response.audio.delta",
          status: "streaming",
        },
      }),
    ];

    const modelReport = buildModelInteractionReport(events);
    const realtimeReport = buildRealtimeInteractionReport(events);

    expect(modelReport.summary.totalEvents).toBe(2);
    expect(modelReport.summary.errorEvents).toBe(1);
    expect(modelReport.summary.providers).toEqual(["openai"]);
    expect(realtimeReport.summary.totalEvents).toBe(1);
    expect(realtimeReport.timeline[0].summary).toBe(
      "response.audio.delta — streaming",
    );
  });

  test("prefers nested provider messages over generic top-level error codes", () => {
    const event = makeEvent({
      id: "event-sdk-error",
      type: "llm_sdk_error",
      data: {
        provider: "openai",
        model: "gpt-5.4",
        errorCode: "MODEL_PROVIDER_ERROR",
        sdkError: {
          message: "Vercel AI SDK rejected the message array.",
          code: "invalid_request",
        },
      },
    });

    const explanation = explainTraceEvent(event, [event]);

    expect(explanation.why).toBe("Vercel AI SDK rejected the message array.");
    expect(explanation.headline).toContain(
      "openai / gpt-5.4 — Vercel AI SDK rejected the message array.",
    );
  });

  test("matches alternate event identifiers and classifies future event families", () => {
    const futureModelEvent = makeEvent({
      id: "normalized-event-id",
      type: "llm_provider_retry" as TraceEventWithId["type"],
      data: {
        eventId: "runtime-event-id",
        category: "llm",
        provider: "openai",
        model: "gpt-5.4",
        message: "Retrying provider request",
      },
    });
    const futureRealtimeEvent = makeEvent({
      id: "future-realtime",
      type: "voice_realtime_buffer_warning" as TraceEventWithId["type"],
      data: {
        providerEventType: "input_audio_buffer.timeout_triggered",
        status: "warning",
      },
    });

    expect(findTraceEvent([futureModelEvent], "runtime-event-id")?.id).toBe(
      "normalized-event-id",
    );
    expect(
      buildModelInteractionReport([futureModelEvent]).summary.totalEvents,
    ).toBe(1);
    expect(
      buildRealtimeInteractionReport([futureRealtimeEvent]).summary.totalEvents,
    ).toBe(1);
  });

  test("formats invalid in-memory timestamps without crashing explanations", () => {
    const event = makeEvent({
      id: "event-invalid-date",
      type: "llm_sdk_error",
      timestamp: new Date("not-a-date"),
      data: {
        sdkError: { message: "Provider rejected the request." },
      },
    });

    const explanation = explainTraceEvent(event, [event]);
    const report = buildModelInteractionReport([event]);

    expect(explanation.rawEvidence.timestamp).toBe("unknown");
    expect(explanation.nearbyEvents[0].timestamp).toBe("unknown");
    expect(report.timeline[0].timestamp).toBe("unknown");
  });

  test("compacts circular raw data without crashing trace formatting", () => {
    const sdkError: Record<string, unknown> = { message: "Provider failed" };
    sdkError.self = sdkError;
    const event = makeEvent({
      id: "event-circular",
      type: "llm_sdk_error",
      data: { sdkError },
    });

    const explanation = explainTraceEvent(event, [event]);
    const formatted = formatTraceEvent(event, { includeData: true });

    expect(explanation.capturedInputs).toEqual(
      expect.arrayContaining([{ label: "message", value: "Provider failed" }]),
    );
    expect(explanation.nearbyEvents[0].summary).toBe("Provider failed");
    expect((formatted.data?.sdkError as Record<string, unknown>).self).toBe(
      "[Circular]",
    );
  });
});

describe("trace diagnostics MCP tools", () => {
  test("gets and explains a specific trace event from session evidence", async () => {
    const event = makeEvent({
      id: "event-invalid",
      type: "llm_request_validation_failed",
      data: {
        provider: "openai",
        model: "gpt-5.4",
        diagnostic: { message: "Invalid request shape" },
      },
    });
    const ctx = makeContext([event]);

    const getResult = JSON.parse(
      await getTraceEvent(
        {
          sessionId: "session-1",
          eventId: "event-invalid",
          traceLimit: 1000,
          includeData: true,
          includeNearby: true,
        },
        ctx,
      ),
    );
    const explainResult = JSON.parse(
      await explainTraceEventTool(
        { sessionId: "session-1", eventId: "event-invalid", traceLimit: 1000 },
        ctx,
      ),
    );

    expect(getResult.success).toBe(true);
    expect(getResult.event.label).toBe("Model Request Invalid");
    expect(explainResult.success).toBe(true);
    expect(explainResult.explanation.why).toBe("Invalid request shape");
  });

  test("returns model and realtime interaction timelines from tools", async () => {
    const ctx = makeContext([
      makeEvent({
        id: "event-built",
        type: "llm_request_built",
        data: { provider: "openai", model: "gpt-5.4", messageCount: 4 },
      }),
      makeEvent({
        id: "event-realtime-error",
        type: "voice_realtime_provider_error",
        data: {
          providerEventType: "error",
          realtimeSessionId: "rt-1",
          message: "Provider rejected realtime input",
        },
      }),
    ]);

    const modelResult = JSON.parse(
      await modelInteractions(
        { sessionId: "session-1", includeTimeline: true, traceLimit: 1000 },
        ctx,
      ),
    );
    const realtimeResult = JSON.parse(
      await realtimeInteractions(
        { sessionId: "session-1", includeTimeline: true, traceLimit: 1000 },
        ctx,
      ),
    );

    expect(modelResult.success).toBe(true);
    expect(modelResult.modelInteractions.summary.totalEvents).toBe(1);
    expect(realtimeResult.success).toBe(true);
    expect(realtimeResult.realtimeInteractions.summary.errorEvents).toBe(1);
    expect(realtimeResult.realtimeInteractions.timeline[0].label).toBe(
      "Realtime Provider Error",
    );
  });
});
