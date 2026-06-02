/**
 * Span Builder
 *
 * Builds hierarchical span trees from trace events for execution flow visualization.
 */

import type { TraceEventWithId, SpanNode, TraceEventType } from "../types.js";
import {
  compareTraceEventsChronologically,
  safeTimeMs,
} from "../utils/trace-formatting.js";

// Events that start a span
const SPAN_START_EVENTS: TraceEventType[] = [
  "agent_enter",
  "flow_step_enter",
  "delegate_start",
  "llm_call",
  "tool_call",
];

// Events that end a span
const SPAN_END_EVENTS: TraceEventType[] = [
  "agent_exit",
  "flow_step_exit",
  "delegate_complete",
];

// Mapping of start -> end event types
const SPAN_PAIRS: Record<string, TraceEventType> = {
  agent_enter: "agent_exit",
  flow_step_enter: "flow_step_exit",
  delegate_start: "delegate_complete",
};

export class SpanBuilder {
  /**
   * Build a span tree from trace events
   */
  buildTree(events: TraceEventWithId[]): SpanNode[] {
    // Sort events by timestamp
    const sortedEvents = [...events].sort(compareTraceEventsChronologically);

    const rootNodes: SpanNode[] = [];
    const spanMap = new Map<string, SpanNode>();
    const openSpans = new Map<string, SpanNode>(); // spanId -> node for unclosed spans

    for (const event of sortedEvents) {
      if (!event.spanId) {
        // Events without spanId become their own root node
        const node = this.createNodeFromEvent(event);
        if (event.parentSpanId && spanMap.has(event.parentSpanId)) {
          spanMap.get(event.parentSpanId)!.children.push(node);
        } else {
          rootNodes.push(node);
        }
        continue;
      }

      if (SPAN_START_EVENTS.includes(event.type)) {
        // Create a new span node
        const node = this.createNodeFromEvent(event);
        spanMap.set(event.spanId, node);
        openSpans.set(event.spanId, node);

        // Attach to parent if exists
        if (event.parentSpanId && spanMap.has(event.parentSpanId)) {
          const parent = spanMap.get(event.parentSpanId)!;
          parent.children.push(node);
          node.parentId = event.parentSpanId;
        } else {
          rootNodes.push(node);
        }
      } else if (SPAN_END_EVENTS.includes(event.type)) {
        // Close the span
        const node = spanMap.get(event.spanId);
        if (node) {
          const endTime = safeTimeMs(event.timestamp);
          if (endTime !== null) {
            node.endTime = new Date(endTime);
          }
          node.durationMs =
            safeDurationMs(event.durationMs) ??
            calculateDurationMs(node.startTime, node.endTime);

          // Merge end event data
          Object.assign(node.data, event.data);
          openSpans.delete(event.spanId);
        }
      } else {
        // Other events - add as leaf nodes
        const node = this.createNodeFromEvent(event);

        if (event.spanId && spanMap.has(event.spanId)) {
          // Add as child of its span
          spanMap.get(event.spanId)!.children.push(node);
        } else if (event.parentSpanId && spanMap.has(event.parentSpanId)) {
          // Add as child of parent span
          spanMap.get(event.parentSpanId)!.children.push(node);
        } else {
          // No parent found, add as root
          rootNodes.push(node);
        }
      }
    }

    return rootNodes;
  }

  /**
   * Create a span node from an event
   */
  private createNodeFromEvent(event: TraceEventWithId): SpanNode {
    const startTime = safeTimeMs(event.timestamp);
    return {
      id: event.spanId || event.id,
      name: this.getSpanName(event),
      type: event.type,
      startTime: new Date(startTime ?? Number.NaN),
      durationMs: safeDurationMs(event.durationMs),
      data: { ...event.data },
      children: [],
      parentId: event.parentSpanId,
    };
  }

  /**
   * Get a human-readable name for a span
   */
  private getSpanName(event: TraceEventWithId): string {
    switch (event.type) {
      case "agent_enter":
      case "agent_exit":
        return `Agent: ${event.agentName || event.data.agentName || "unknown"}`;

      case "flow_step_enter":
      case "flow_step_exit":
        return `Step: ${event.data.step || event.data.stepName || "unknown"}`;

      case "delegate_start":
      case "delegate_complete":
        return `Delegate: ${event.data.agent || event.data.targetAgent || "unknown"}`;

      case "llm_call":
        return `LLM: ${event.data.model || "unknown"}`;

      case "tool_call":
        return `Tool: ${event.data.tool || event.data.toolName || "unknown"}`;

      case "decision":
        return `Decision: ${event.data.decision || "unknown"}`;

      case "constraint_check":
        return `Constraint: ${event.data.constraint || "check"}`;

      case "handoff":
        return `Handoff: ${event.data.to || event.data.target || "unknown"}`;

      case "escalation":
        return `Escalation: ${event.data.reason || "triggered"}`;

      case "error":
        return `Error: ${event.data.errorType || event.data.message || "unknown"}`;

      case "flow_transition":
        return `Transition: ${event.data.from || "?"} -> ${event.data.to || "?"}`;

      default:
        if (event.type.startsWith("dsl_")) {
          return `DSL: ${event.type.replace("dsl_", "")}`;
        }
        return event.type;
    }
  }

  /**
   * Flatten a span tree to a list (depth-first)
   */
  flatten(tree: SpanNode[]): SpanNode[] {
    const result: SpanNode[] = [];

    const visit = (nodes: SpanNode[], depth: number) => {
      for (const node of nodes) {
        result.push({ ...node, data: { ...node.data, _depth: depth } });
        visit(node.children, depth + 1);
      }
    };

    visit(tree, 0);
    return result;
  }

  /**
   * Get span summary statistics
   */
  getTreeStats(tree: SpanNode[]): {
    totalSpans: number;
    maxDepth: number;
    totalDurationMs: number;
    byType: Record<string, number>;
  } {
    let totalSpans = 0;
    let maxDepth = 0;
    let totalDurationMs = 0;
    const byType: Record<string, number> = {};

    const visit = (nodes: SpanNode[], depth: number) => {
      for (const node of nodes) {
        totalSpans++;
        maxDepth = Math.max(maxDepth, depth);
        totalDurationMs += node.durationMs || 0;
        byType[node.type] = (byType[node.type] || 0) + 1;
        visit(node.children, depth + 1);
      }
    };

    visit(tree, 1);
    return { totalSpans, maxDepth, totalDurationMs, byType };
  }
}

function safeDurationMs(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function calculateDurationMs(
  startTime: Date,
  endTime?: Date,
): number | undefined {
  const start = safeTimeMs(startTime);
  const end = safeTimeMs(endTime);
  if (start === null || end === null) return undefined;
  const duration = end - start;
  return Number.isFinite(duration) ? duration : undefined;
}
