import { describe, expect, test } from "vitest";
import { buildDiagnosticLayer } from "../utils/diagnostic-layer.js";
import type { TraceEventWithId } from "../types.js";

function makeEvent(overrides: Partial<TraceEventWithId>): TraceEventWithId {
  return {
    id: "event-1",
    sessionId: "session-1",
    type: "llm_sdk_error",
    timestamp: new Date("2026-06-02T07:41:00.000Z"),
    data: {},
    ...overrides,
  } as TraceEventWithId;
}

describe("diagnostic layer", () => {
  test("uses nested SDK/provider messages as diagnostic titles and summaries", () => {
    const layer = buildDiagnosticLayer([
      makeEvent({
        id: "event-sdk-error",
        data: {
          errorCode: "MODEL_PROVIDER_ERROR",
          sdkError: {
            message: "Vercel AI SDK rejected the message array.",
            code: "invalid_request",
          },
        },
      }),
    ]);

    expect(layer.summary.groupCount).toBe(1);
    expect(layer.groups[0].title).toBe(
      "Vercel AI SDK rejected the message array.",
    );
    expect(layer.groups[0].code).toBe("invalid_request");
    expect(layer.groups[0].evidence[0].summary).toBe(
      "Vercel AI SDK rejected the message array.",
    );
  });

  test("accepts runtime diagnostics and truncates large nested evidence", () => {
    const layer = buildDiagnosticLayer([
      makeEvent({
        id: "event-runtime-diagnostic",
        type: "voice_realtime_diagnostic",
        data: {
          runtimeDiagnostic: {
            severity: "warn",
            category: "realtime",
            message: "Realtime input buffer is delayed.",
            recommendedActions: ["Inspect provider event order."],
          },
          providerError: {
            message: "x".repeat(800),
            nested: { deeper: { value: "hidden" } },
          },
        },
      }),
    ]);

    expect(layer.groups[0].severity).toBe("warning");
    expect(layer.groups[0].recommendedActions).toEqual([
      "Inspect provider event order.",
    ]);
    expect(JSON.stringify(layer.groups[0].evidence[0].data)).toContain("...");
  });

  test("includes diagnostic-looking payloads on otherwise generic event types", () => {
    const layer = buildDiagnosticLayer([
      makeEvent({
        id: "event-generic-warning",
        type: "agent_response",
        data: {
          warning: true,
          errorCode: "MODEL_RESPONSE_DEGRADED",
          message: "Response was generated from fallback handling.",
        },
      }),
    ]);

    expect(layer.summary.groupCount).toBe(1);
    expect(layer.groups[0].code).toBe("MODEL_RESPONSE_DEGRADED");
    expect(layer.groups[0].evidence[0].summary).toBe(
      "Response was generated from fallback handling.",
    );
  });

  test("formats invalid in-memory timestamps without crashing evidence output", () => {
    const layer = buildDiagnosticLayer([
      makeEvent({
        id: "event-invalid-date",
        timestamp: new Date("not-a-date"),
        data: {
          sdkError: {
            message: "Provider rejected the request.",
          },
        },
      }),
    ]);

    expect(layer.groups[0].evidence[0].timestamp).toBe("unknown");
  });

  test("compacts circular evidence payloads without crashing", () => {
    const sdkError: Record<string, unknown> = {
      message: "Provider rejected the request.",
    };
    sdkError.self = sdkError;

    const layer = buildDiagnosticLayer([
      makeEvent({
        id: "event-circular",
        data: { sdkError },
      }),
    ]);

    expect(
      (layer.groups[0].evidence[0].data?.sdkError as Record<string, unknown>)
        .self,
    ).toBe("[Circular]");
  });
});
