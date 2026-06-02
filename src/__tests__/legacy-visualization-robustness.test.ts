import { describe, expect, test } from "vitest";
import { SessionStore } from "../store/session-store.js";
import { TraceStore } from "../store/trace-store.js";
import { getFlowGraph } from "../tools/flow.js";
import type { DebugContext } from "../tools/index.js";
import { getSpanTree } from "../tools/spans.js";
import { getCurrentState } from "../tools/state.js";
import { listActiveSessions, session } from "../tools/subscription.js";
import type {
  AgentDetails,
  AgentState,
  SessionInfo,
  TraceEventWithId,
} from "../types.js";

function makeEvent(overrides: Partial<TraceEventWithId>): TraceEventWithId {
  return {
    id: "event-1",
    sessionId: "session-1",
    type: "flow_step_enter",
    timestamp: new Date("2026-06-02T07:41:00.000Z"),
    data: {},
    ...overrides,
  } as TraceEventWithId;
}

function makeContext(options: {
  events?: TraceEventWithId[];
  agentDetails?: AgentDetails;
  wsClient?: Record<string, unknown>;
}): DebugContext {
  const sessionStore = new SessionStore();
  sessionStore.createSession(
    "session-1",
    "FidiumCallSupervisor",
    options.agentDetails,
  );
  const traceStore = new TraceStore();
  for (const event of options.events || []) {
    traceStore.addEvent(event);
  }

  return {
    sessionStore,
    traceStore,
    wsClient: options.wsClient || { isConnected: () => false },
    httpClient: {},
    authenticate: async () => ({ status: "authenticated" }),
  } as unknown as DebugContext;
}

describe("legacy visualization tool robustness", () => {
  test("debug_get_span_tree renders invalid timestamps as unknown", async () => {
    const ctx = makeContext({
      events: [
        makeEvent({
          id: "event-invalid-time",
          spanId: "span-1",
          timestamp: new Date("not-a-date"),
          data: { stepName: "collect_zip" },
        }),
      ],
    });

    const result = JSON.parse(
      await getSpanTree({ sessionId: "session-1", flat: true }, ctx),
    );

    expect(result.success).toBe(true);
    expect(result.spans[0]).toMatchObject({
      id: "span-1",
      startTime: "unknown",
    });
    expect(result.spans[0]).not.toHaveProperty("durationMs");
  });

  test("debug_get_current_state serializes circular state snapshots", async () => {
    const ctx = makeContext({});
    const context: Record<string, unknown> = { zip: "90210" };
    context.self = context;
    ctx.sessionStore.updateState("session-1", {
      context,
      conversationPhase: "active",
      gatherProgress: {},
      constraintResults: {},
      lastToolResults: {},
      memory: { session: {}, persistentCache: {}, pendingRemembers: [] },
    } as AgentState);

    const result = JSON.parse(
      await getCurrentState({ sessionId: "session-1" }, ctx),
    );

    expect(result.success).toBe(true);
    expect(result.state.context.self).toBe("[Circular]");
    expect(result.lastActivityAt).toMatch(/^\d{4}-/);
  });

  test("debug_get_flow_graph escapes Mermaid labels and uses stable node ids", async () => {
    const ctx = makeContext({
      agentDetails: {
        id: "agent-1",
        name: "FidiumCallSupervisor",
        domain: "support",
        filePath: "support/FidiumCallSupervisor.abl",
        type: "agent",
        mode: "reasoning",
        toolCount: 1,
        gatherFieldCount: 0,
        isSupervisor: false,
        dsl: "",
        ir: {
          tools: [
            {
              name: 'lookup"address\nwith newline',
              description: "lookup address",
            },
          ],
        },
      },
    });

    const result = JSON.parse(
      await getFlowGraph(
        {
          sessionId: "session-1",
          format: "mermaid",
          includeAppGraph: false,
        },
        ctx,
      ),
    );

    expect(result.success).toBe(true);
    expect(result.mermaid).toContain(
      'state "lookup\\"address with newline" as n',
    );
    expect(result.mermaid).not.toContain('__tool_lookup"address');
  });

  test("subscription tools normalize session and replay timestamps", async () => {
    const replayEvent = makeEvent({
      id: "event-invalid-time",
      timestamp: new Date("not-a-date"),
    });
    const wsClient: Record<string, unknown> = {
      isConnected: () => true,
      listSessions() {
        const sessions: SessionInfo[] = [
          {
            sessionId: "session-1",
            agentName: "FidiumCallSupervisor",
            eventCount: 1,
            lastActivity: new Date("not-a-date"),
          },
        ];
        (wsClient.onSessionList as (sessions: SessionInfo[]) => void)(sessions);
      },
      subscribeSession(sessionId: string) {
        (
          wsClient.onTraceReplay as (
            sid: string,
            events: TraceEventWithId[],
            totalBuffered: number,
          ) => void
        )(sessionId, [replayEvent], 1);
        (wsClient.onSubscribed as (sid: string, count: number) => void)(
          sessionId,
          1,
        );
      },
    };
    const ctx = makeContext({ wsClient });

    const listResult = JSON.parse(await listActiveSessions({}, ctx));
    const subscribeResult = JSON.parse(
      await session({ action: "subscribe", sessionId: "session-1" }, ctx),
    );

    expect(listResult.sessions[0].lastActivity).toBe("unknown");
    expect(subscribeResult.replayedEvents[0].timestamp).toBe("unknown");
  });
});
