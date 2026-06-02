import { describe, expect, test } from "vitest";
import { EventBuffer } from "../client/event-buffer.js";
import type { TraceEventWithId } from "../types.js";

function makeEvent(overrides: Partial<TraceEventWithId>): TraceEventWithId {
  return {
    id: "event-1",
    eventId: "runtime-event-1",
    sessionId: "session-1",
    type: "llm_request_built",
    timestamp: new Date("2026-06-02T07:41:00.000Z"),
    data: {},
    ...overrides,
  } as TraceEventWithId;
}

describe("EventBuffer", () => {
  test("search handles circular payloads without throwing", () => {
    const circular: Record<string, unknown> = { message: "provider failed" };
    circular.self = circular;
    const buffer = new EventBuffer();
    buffer.push(makeEvent({ data: circular }));

    expect(buffer.search({ text: "provider" })).toHaveLength(1);
  });

  test("error filters include model validation and provider diagnostics", () => {
    const buffer = new EventBuffer();
    buffer.push(
      makeEvent({
        id: "event-invalid",
        type: "llm_request_validation_failed",
        data: {},
      }),
    );
    buffer.push(
      makeEvent({
        id: "event-provider-error",
        type: "agent_response",
        data: { providerError: { message: "provider failed" } },
      }),
    );
    buffer.push(
      makeEvent({ id: "event-ok", type: "agent_response", data: {} }),
    );

    expect(buffer.getErrors().map((event) => event.id)).toEqual([
      "event-invalid",
      "event-provider-error",
    ]);
    expect(buffer.search({ hasError: true }).map((event) => event.id)).toEqual([
      "event-invalid",
      "event-provider-error",
    ]);
    expect(buffer.search({ hasError: false }).map((event) => event.id)).toEqual(
      ["event-ok"],
    );
  });

  test("getById resolves runtime event aliases", () => {
    const buffer = new EventBuffer();
    buffer.push(
      makeEvent({
        id: "normalized-event-id",
        eventId: "runtime-event-id",
        eventCursor: "cursor-1",
        eventSeq: 7,
        traceId: "trace-1",
        data: { requestId: "request-1" },
      }),
    );

    expect(buffer.getById("runtime-event-id")?.id).toBe("normalized-event-id");
    expect(buffer.getById("cursor-1")?.id).toBe("normalized-event-id");
    expect(buffer.getById("request-1")?.id).toBe("normalized-event-id");
  });
});
