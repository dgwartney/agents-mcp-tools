/**
 * Tool Registry
 *
 * Centralizes all MCP tools and their schemas.
 */

import { z } from "zod";
import type { WebSocketClient } from "../client/websocket-client.js";
import type { HttpClient } from "../client/http-client.js";
import type { SessionStore } from "../store/session-store.js";
import type { TraceStore } from "../store/trace-store.js";
import type { AuthResult, AuthOptions } from "../client/auth-client.js";

// Import tools
import { connect, connectSchema } from "./connect.js";
import {
  listAgents,
  listAgentsSchema,
  loadAgent,
  loadAgentSchema,
} from "./agents.js";
import { traces, tracesSchema } from "./traces.js";
import { getCurrentState, getCurrentStateSchema } from "./state.js";
import { getSpanTree, getSpanTreeSchema } from "./spans.js";
import { getErrors, getErrorsSchema } from "./errors.js";
import { explainDecision, explainDecisionSchema } from "./decisions.js";
import { getFlowGraph, getFlowGraphSchema } from "./flow.js";
import { sendMessage, sendMessageSchema } from "./interaction.js";
import {
  listActiveSessions,
  listActiveSessionsSchema,
  session,
  sessionSchema,
} from "./subscription.js";
import { docs, docsSchema } from "./docs.js";
import { analyzeSession, analyzeSessionSchema } from "./analysis.js";
import { diagnosticLayer, diagnosticLayerSchema } from "./diagnostic-layer.js";
import {
  explainTraceEventSchema,
  explainTraceEventTool,
  getTraceEvent,
  getTraceEventSchema,
  modelInteractions,
  modelInteractionsSchema,
  realtimeInteractions,
  realtimeInteractionsSchema,
} from "./trace-diagnostics.js";
import { harnessLogs, harnessLogsSchema } from "./harness-logs.js";
import { diagnose, diagnoseSchema } from "./diagnose.js";
import {
  platformProjects,
  platformProjectsSchema,
} from "./platform-projects.js";
import { platformAgents, platformAgentsSchema } from "./platform-agents.js";
import {
  platformVersions,
  platformVersionsSchema,
} from "./platform-versions.js";
import {
  platformDeployments,
  platformDeploymentsSchema,
} from "./platform-deployments.js";
import { platformTools, platformToolsSchema } from "./platform-tools.js";
import {
  platformImportExport,
  platformImportExportSchema,
} from "./platform-import-export.js";
import {
  platformValidatePackage,
  platformValidatePackageSchema,
} from "./platform-validate-package.js";
import {
  platformPackageModel,
  platformPackageModelSchema,
} from "./platform-package-model.js";
import { debugLintAbl, debugLintAblSchema } from "./debug-lint-abl.js";
import {
  debugWhyTranscriptFailed,
  debugWhyTranscriptFailedSchema,
} from "./debug-why-transcript-failed.js";
import {
  platformEvalPersonas,
  platformEvalPersonasSchema,
  platformEvalScenarios,
  platformEvalScenariosSchema,
  platformEvalEvaluators,
  platformEvalEvaluatorsSchema,
  platformEvalSets,
  platformEvalSetsSchema,
  platformEvalRuns,
  platformEvalRunsSchema,
} from "./platform-evals.js";
import { platformConfig, platformConfigSchema } from "./platform-config.js";
import {
  platformWorkspaces,
  platformWorkspacesSchema,
} from "./platform-workspaces.js";

/**
 * Context passed to all tool handlers
 */
export interface DebugContext {
  wsClient: WebSocketClient;
  httpClient: HttpClient;
  sessionStore: SessionStore;
  traceStore: TraceStore;
  /** Authenticate using cascade: explicit token → stored credentials → device auth */
  authenticate: (options?: AuthOptions) => Promise<AuthResult>;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  schema: z.ZodType<unknown>;
  handler: (args: unknown, ctx: DebugContext) => Promise<string>;
}

/**
 * All available tools
 */
export const tools: ToolDefinition[] = [
  {
    name: "platform_connect",
    description:
      "Connect to the server WebSocket to start receiving traces. Call this first before using other Arch debug tools. " +
      "Auth is automatic — stored credentials or device auth are tried in order. " +
      "If device auth is needed, the browser opens automatically and the tool polls until approved (single call, no two-phase). " +
      "Credentials are saved to ~/.config/kore-platform/credentials.json for future sessions. " +
      "If already connected and a new authToken is provided, the token is refreshed without dropping the WebSocket. " +
      "Use force=true to fully disconnect and reconnect (e.g. when credentials have expired). " +
      "If it fails, report the error as-is to the user. Do NOT try alternative approaches like REST calls.",
    schema: connectSchema,
    handler: connect as (args: unknown, ctx: DebugContext) => Promise<string>,
  },
  {
    name: "debug_list_agents",
    description:
      "List all available agents from the server. Returns agents grouped by domain.",
    schema: listAgentsSchema,
    handler: listAgents as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_load_agent",
    description:
      'Load an agent and create a debug session. Use the agentPath format "domain/name" (e.g., "hotel-booking/booking_agent").',
    schema: loadAgentSchema,
    handler: loadAgent as (args: unknown, ctx: DebugContext) => Promise<string>,
  },
  {
    name: "debug_send_message",
    description:
      "Send a message to the loaded agent and optionally wait for the response.",
    schema: sendMessageSchema,
    handler: sendMessage as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_traces",
    description:
      "Get and search trace events. Filter by type, agent, text, error, or session. " +
      "With no search filters (text/agentName/hasError), returns recent events. " +
      "With search filters, searches across stored events.",
    schema: tracesSchema,
    handler: traces as (args: unknown, ctx: DebugContext) => Promise<string>,
  },
  {
    name: "debug_get_current_state",
    description:
      "Get the current agent state including context, gather progress, flow state, and more.",
    schema: getCurrentStateSchema,
    handler: getCurrentState as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_get_span_tree",
    description:
      "Get hierarchical span tree showing execution flow. Useful for understanding agent behavior.",
    schema: getSpanTreeSchema,
    handler: getSpanTree as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_get_errors",
    description:
      "Get all errors and warnings from the session. Includes escalations and constraint failures.",
    schema: getErrorsSchema,
    handler: getErrors as (args: unknown, ctx: DebugContext) => Promise<string>,
  },
  {
    name: "debug_explain_decision",
    description:
      "Get detailed explanation of a decision event with surrounding context. Helps understand why the agent made a choice.",
    schema: explainDecisionSchema,
    handler: explainDecision as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_get_flow_graph",
    description:
      "Get the execution graph for any agent type (scripted, reasoning, or supervisor). Shows flow steps, tools, handoffs, and routing logic. Returns JSON or Mermaid diagram format.",
    schema: getFlowGraphSchema,
    handler: getFlowGraph as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  // Session subscription tools (for observing UI-created sessions)
  {
    name: "debug_list_active_sessions",
    description:
      "List all active sessions from the server that can be subscribed to. Use this to find sessions created by the UI.",
    schema: listActiveSessionsSchema,
    handler: listActiveSessions as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_session",
    description:
      "Subscribe to or unsubscribe from an existing session's trace events. " +
      "Use action='subscribe' to start receiving traces (buffered + live), " +
      "or action='unsubscribe' to stop. Use debug_list_active_sessions to find session IDs.",
    schema: sessionSchema,
    handler: session as (args: unknown, ctx: DebugContext) => Promise<string>,
  },

  // Documentation tools
  {
    name: "debug_docs",
    description: `Get or search Agent ABL documentation from the platform. Requires platform_connect first. Provide 'topic' for full content, 'query' to search, or neither to list all available topics.`,
    schema: docsSchema,
    handler: docs as (args: unknown, ctx: DebugContext) => Promise<string>,
  },

  // Analysis tools
  {
    name: "debug_analyze_session",
    description: `Get automated analysis and diagnostics for a session. Returns:
- Summary statistics (event counts, duration, LLM calls)
- Current state (step, collected fields, missing fields)
- Detected issues (loops, errors, constraint violations, tool failures)
- Suggestions for fixing problems

Use this as a starting point for debugging - it identifies common issues automatically.`,
    schema: analyzeSessionSchema,
    handler: analyzeSession as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_diagnostic_layer",
    description:
      "Build a layered, causal diagnostic view for a session. Groups raw trace events into root-cause incidents with evidence and recommended actions. Prefer this over reading raw traces when troubleshooting.",
    schema: diagnosticLayerSchema,
    handler: diagnosticLayer as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_get_trace_event",
    description:
      "Fetch one trace event by eventId from an active MCP session or persisted Studio/UI session. Returns readable label, summary, compact raw data, nearby events, and evidence source diagnostics.",
    schema: getTraceEventSchema,
    handler: getTraceEvent as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_explain_trace_event",
    description:
      "Explain one trace event by eventId with what happened, why it exists, likely impact, captured inputs, nearby events, and next inspection steps. Use this from a specific timeline event.",
    schema: explainTraceEventSchema,
    handler: explainTraceEventTool as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_model_interactions",
    description:
      "Summarize model-provider interactions for a session, including model request preparation, validation failures, SDK errors, providers, models, spans, and ordered evidence.",
    schema: modelInteractionsSchema,
    handler: modelInteractions as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_realtime_interactions",
    description:
      "Summarize realtime voice/model provider interactions for a session, including session config, provider events, provider errors, diagnostics, spans, and ordered evidence.",
    schema: realtimeInteractionsSchema,
    handler: realtimeInteractions as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },

  // Harness CI tools
  {
    name: "debug_harness_logs",
    description: `Download and parse Harness CI execution logs. Returns parsed, readable log lines.

Use this to get full build/test failure logs that harness_diagnose cannot retrieve.

Common usage:
- Get test failure details: stage_id="build_test", step_id="unit_tests" or "integration_tests"
- Get Docker build errors: stage_id="docker_search_ai", step_id="build_image"
- Get security scan failures: stage_id="docker_codetool_sandbox", step_id="trivy_scan"

Use the filter parameter to search for specific errors (e.g., "ECONNREFUSED|mongo|redis").
Requires HARNESS_API_KEY environment variable.`,
    schema: harnessLogsSchema,
    handler: harnessLogs as unknown as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },

  // Platform management tools
  {
    name: "platform_projects",
    description:
      "Manage projects on the platform. Actions: list (all projects), get (by projectId), create (with name/description), update (modify name/description/entryAgentName by projectId), delete (by projectId).",
    schema: platformProjectsSchema,
    handler: platformProjects as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_agents",
    description:
      "Manage agents within a project. Actions: list (all agents in project), get (agent details including DSL), save_dsl (update agent DSL). Compilation happens implicitly during version creation.",
    schema: platformAgentsSchema,
    handler: platformAgents as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_versions",
    description:
      "Manage agent versions. Actions: list (all versions), create (new version with optional changelog), get (specific version), promote (change version status), diff (compare two versions).",
    schema: platformVersionsSchema,
    handler: platformVersions as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_deployments",
    description:
      "Manage deployments within a project. Actions: list (all deployments), create (new deployment with environment and agent versions), get (deployment details), retire (deactivate deployment), rollback (revert deployment).",
    schema: platformDeploymentsSchema,
    handler: platformDeployments as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_tools",
    description:
      "Manage tools within a project. Actions: list (all tools), get (tool detail), create (new tool), update (modify tool), delete (remove tool), test (execute tool test). Note: tool CRUD routes through the Studio API.",
    schema: platformToolsSchema,
    handler: platformTools as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_import_export",
    description:
      "Import and export projects. Actions: export_preview (metadata preview), export (full project export as file map + manifest), import_preview (dry-run import showing changes), import (apply import). Import actions accept data.files, files, or a local folder/.zip path.",
    schema: platformImportExportSchema,
    handler: platformImportExport as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_validate_package",
    description:
      "Validate a local project folder/.zip or file map using platform-owned compiler and design diagnostics. Use in ABL repair/eval loops; returns normalized issues with suggested fixes.",
    schema: platformValidatePackageSchema,
    handler: platformValidatePackage as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_package_model",
    description:
      "Show what the platform compiler sees in a local project package: agents, tools, handoffs, memory variables, behavior profile references, flow steps, and unresolved refs.",
    schema: platformPackageModelSchema,
    handler: platformPackageModel as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_lint_abl",
    description:
      "Run ABL design and repair lint checks for empty RESPOND values, empty finalize steps, undeclared handoff-condition variables, side-effect tool chains, and tool+text reasoning risks.",
    schema: debugLintAblSchema,
    handler: debugLintAbl as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_why_transcript_failed",
    description:
      'Given a transcript JSON and exported package folder/.zip or file map, correlate transcript failure symptoms with ABL file/line diagnoses such as finalize -> COMPLETE -> RESPOND: "".',
    schema: debugWhyTranscriptFailedSchema,
    handler: debugWhyTranscriptFailed as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "debug_diagnose_transcript",
    description:
      "Alias for debug_why_transcript_failed. Given transcript JSON plus project files, returns correlated ABL file/line diagnoses.",
    schema: debugWhyTranscriptFailedSchema,
    handler: debugWhyTranscriptFailed as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_eval_personas",
    description:
      "Manage eval personas through the mounted Studio API paths under /api/projects/:projectId/evals/personas. Actions: list, get, create, update, delete, templates, generate.",
    schema: platformEvalPersonasSchema,
    handler: platformEvalPersonas as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_eval_scenarios",
    description:
      "Manage eval scenarios through /api/projects/:projectId/evals/scenarios. Actions: list, get, create, update, delete, generate.",
    schema: platformEvalScenariosSchema,
    handler: platformEvalScenarios as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_eval_evaluators",
    description:
      "Manage eval evaluators through /api/projects/:projectId/evals/evaluators. Actions: list, get, create, update, delete, templates.",
    schema: platformEvalEvaluatorsSchema,
    handler: platformEvalEvaluators as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_eval_sets",
    description:
      "Manage eval sets through /api/projects/:projectId/evals/sets. Actions: list, get, create, update, delete.",
    schema: platformEvalSetsSchema,
    handler: platformEvalSets as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_eval_runs",
    description:
      "Manage eval runs for ABL repair loops. Actions: list, get, create, update, start, cancel, status, heatmap, cases, compare, preflight, quick.",
    schema: platformEvalRunsSchema,
    handler: platformEvalRuns as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_config",
    description:
      "Manage project configuration. Actions: get_settings (project settings), update_settings (modify settings), get_llm_config (LLM configuration), update_llm_config (modify LLM config).",
    schema: platformConfigSchema,
    handler: platformConfig as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },
  {
    name: "platform_workspaces",
    description:
      "Manage workspaces (tenants). Actions: list (all workspaces the user belongs to, with active flag), switch (switch to a different workspace — updates auth token for all subsequent calls), current (show active workspace decoded from JWT).",
    schema: platformWorkspacesSchema,
    handler: platformWorkspaces as (
      args: unknown,
      ctx: DebugContext,
    ) => Promise<string>,
  },

  // Diagnostic tools
  {
    name: "debug_diagnose",
    description:
      "Run diagnostic analysis on an agent or session. Returns config, findings, and suggestions. " +
      "Provide sessionId for session diagnostics or agentName for agent config diagnostics. " +
      "Set configOnly=true to inspect only config (model chain, credentials, tools) without running full diagnostics.",
    schema: diagnoseSchema,
    handler: diagnose as (args: unknown, ctx: DebugContext) => Promise<string>,
  },
];

/**
 * Get a tool by name
 */
export function getTool(name: string): ToolDefinition | undefined {
  return tools.find((t) => t.name === name);
}

/**
 * Convert Zod schema to JSON Schema for MCP
 */
export function zodToJsonSchema(
  schema: z.ZodType<unknown>,
): Record<string, unknown> {
  const unwrapped = unwrapSchema(schema);

  if (unwrapped.schema instanceof z.ZodObject) {
    const shape = unwrapped.schema.shape;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      const zodValue = value as z.ZodType<unknown>;
      properties[key] = zodTypeToJsonSchema(zodValue);

      if (isRequiredProperty(zodValue)) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = {
      type: "object",
      properties,
      additionalProperties: false,
    };
    if (required.length > 0) result.required = required;
    return result;
  }

  return { type: "object" };
}

function zodTypeToJsonSchema(
  schema: z.ZodType<unknown>,
): Record<string, unknown> {
  const { schema: innerSchema, defaultValue, nullable } = unwrapSchema(schema);
  const base = schemaMetadata(schema);
  if (defaultValue !== undefined) base.default = defaultValue;

  let result: Record<string, unknown>;

  if (innerSchema instanceof z.ZodString) {
    result = { ...base, type: "string", ...stringConstraints(innerSchema) };
  } else if (innerSchema instanceof z.ZodNumber) {
    result = { ...base, ...numberSchema(innerSchema) };
  } else if (innerSchema instanceof z.ZodBoolean) {
    result = { ...base, type: "boolean" };
  } else if (innerSchema instanceof z.ZodArray) {
    result = {
      ...base,
      type: "array",
      items: zodTypeToJsonSchema(innerSchema.element),
      ...arrayConstraints(innerSchema),
    };
  } else if (innerSchema instanceof z.ZodEnum) {
    result = {
      ...base,
      type: "string",
      enum: innerSchema.options,
    };
  } else if (innerSchema instanceof z.ZodLiteral) {
    result = literalSchema(base, innerSchema);
  } else if (innerSchema instanceof z.ZodUnion) {
    const options = innerSchema.options as z.ZodType<unknown>[];
    result = {
      ...base,
      anyOf: options.map((option) => zodTypeToJsonSchema(option)),
    };
  } else if (innerSchema instanceof z.ZodObject) {
    result = { ...base, ...zodToJsonSchema(innerSchema) };
  } else if (innerSchema instanceof z.ZodRecord) {
    const valueSchema = innerSchema._def.valueType as
      | z.ZodType<unknown>
      | undefined;
    result = {
      ...base,
      type: "object",
      additionalProperties: valueSchema
        ? zodTypeToJsonSchema(valueSchema)
        : true,
    };
  } else if (
    innerSchema instanceof z.ZodUnknown ||
    innerSchema instanceof z.ZodAny
  ) {
    result = { ...base };
  } else {
    result = { ...base, type: "string" };
  }

  if (nullable) {
    const type = result.type;
    if (typeof type === "string") {
      result.type = [type, "null"];
    } else if (Array.isArray(type) && !type.includes("null")) {
      result.type = [...type, "null"];
    }
  }

  return result;
}

interface UnwrappedSchema {
  schema: z.ZodType<unknown>;
  defaultValue?: unknown;
  nullable: boolean;
}

function unwrapSchema(schema: z.ZodType<unknown>): UnwrappedSchema {
  let current = schema;
  let defaultValue: unknown;
  let nullable = false;

  while (true) {
    if (current instanceof z.ZodOptional) {
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodDefault) {
      defaultValue = readDefaultValue(current);
      current = current._def.innerType;
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }
    break;
  }

  return { schema: current, defaultValue, nullable };
}

function isRequiredProperty(schema: z.ZodType<unknown>): boolean {
  let current = schema;
  while (true) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodDefault) {
      return false;
    }
    if (current instanceof z.ZodNullable) {
      current = current.unwrap();
      continue;
    }
    if (current instanceof z.ZodEffects) {
      current = current.innerType();
      continue;
    }
    return true;
  }
}

function schemaMetadata(schema: z.ZodType<unknown>): Record<string, unknown> {
  const description = findDescription(schema);
  return description ? { description } : {};
}

function findDescription(schema: z.ZodType<unknown>): string | undefined {
  let current: z.ZodType<unknown> | undefined = schema;
  while (current) {
    const description = current.description;
    if (description) return description;

    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
    } else if (current instanceof z.ZodDefault) {
      current = current._def.innerType;
    } else if (current instanceof z.ZodEffects) {
      current = current.innerType();
    } else {
      current = undefined;
    }
  }
  return undefined;
}

function readDefaultValue(schema: z.ZodDefault<z.ZodTypeAny>): unknown {
  const defaultFactory = schema._def.defaultValue;
  return typeof defaultFactory === "function"
    ? defaultFactory()
    : defaultFactory;
}

function numberSchema(schema: z.ZodNumber): Record<string, unknown> {
  const constraints: Record<string, unknown> = {
    type: schema.isInt ? "integer" : "number",
  };

  for (const check of schema._def.checks) {
    if (check.kind === "min") {
      constraints[check.inclusive ? "minimum" : "exclusiveMinimum"] =
        check.value;
    } else if (check.kind === "max") {
      constraints[check.inclusive ? "maximum" : "exclusiveMaximum"] =
        check.value;
    }
  }

  return constraints;
}

function stringConstraints(schema: z.ZodString): Record<string, unknown> {
  const constraints: Record<string, unknown> = {};
  for (const check of schema._def.checks) {
    if (check.kind === "min") {
      constraints.minLength = check.value;
    } else if (check.kind === "max") {
      constraints.maxLength = check.value;
    }
  }
  return constraints;
}

function arrayConstraints(
  schema: z.ZodArray<z.ZodTypeAny>,
): Record<string, unknown> {
  const constraints: Record<string, unknown> = {};
  if (schema._def.minLength?.value !== undefined) {
    constraints.minItems = schema._def.minLength.value;
  }
  if (schema._def.maxLength?.value !== undefined) {
    constraints.maxItems = schema._def.maxLength.value;
  }
  return constraints;
}

function literalSchema(
  base: Record<string, unknown>,
  schema: z.ZodLiteral<unknown>,
): Record<string, unknown> {
  const value = schema.value;
  const valueType = value === null ? "null" : typeof value;
  if (
    valueType === "string" ||
    valueType === "number" ||
    valueType === "boolean" ||
    valueType === "null"
  ) {
    return { ...base, type: valueType, const: value };
  }
  return { ...base, const: value };
}
