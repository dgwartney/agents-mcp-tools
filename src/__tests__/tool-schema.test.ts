import { describe, expect, test } from "vitest";
import { z } from "zod";
import { diagnosticLayerSchema } from "../tools/diagnostic-layer.js";
import { getFlowGraphSchema } from "../tools/flow.js";
import { zodToJsonSchema } from "../tools/index.js";
import { platformEvalRunsSchema } from "../tools/platform-evals.js";
import { platformProjectsSchema } from "../tools/platform-projects.js";
import { getTraceEventSchema } from "../tools/trace-diagnostics.js";

describe("MCP tool JSON schema generation", () => {
  test("preserves defaults, enums, descriptions, and required fields", () => {
    const schema = zodToJsonSchema(getFlowGraphSchema);
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(schema).toMatchObject({
      type: "object",
      additionalProperties: false,
    });
    expect(schema.required).toBeUndefined();
    expect(properties.format).toMatchObject({
      type: "string",
      enum: ["json", "mermaid"],
      default: "json",
      description: "Output format",
    });
    expect(properties.includeAppGraph).toMatchObject({
      type: "boolean",
      default: false,
    });
  });

  test("emits integer constraints for trace limits", () => {
    const diagnosticSchema = zodToJsonSchema(diagnosticLayerSchema);
    const diagnosticProperties = diagnosticSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(diagnosticProperties.traceLimit).toMatchObject({
      type: "integer",
      exclusiveMinimum: 0,
      maximum: 2000,
      default: 750,
    });

    const eventSchema = zodToJsonSchema(getTraceEventSchema);
    const eventProperties = eventSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    expect(eventProperties.eventId).toMatchObject({
      type: "string",
      minLength: 1,
    });
  });

  test("represents records and unions for eval query parameters", () => {
    const schema = zodToJsonSchema(platformEvalRunsSchema);
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;
    const query = properties.query as {
      additionalProperties: { anyOf: Array<Record<string, unknown>> };
    };

    expect(properties.action.enum).toContain("quick");
    expect(query).toMatchObject({
      type: "object",
    });
    expect(query.additionalProperties.anyOf.map((entry) => entry.type)).toEqual(
      ["string", "number", "boolean"],
    );
  });

  test("represents nullable fields without making them required", () => {
    const schema = zodToJsonSchema(platformProjectsSchema);
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(schema.required).toEqual(["action"]);
    expect(properties.entryAgentName).toMatchObject({
      type: ["string", "null"],
    });
  });

  test("handles literals, effects, and unknown payloads for future schemas", () => {
    const schema = zodToJsonSchema(
      z.object({
        mode: z.literal("debug").default("debug"),
        payload: z.unknown().optional(),
        trimmed: z.string().transform((value) => value.trim()),
      }),
    );
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(properties.mode).toMatchObject({
      type: "string",
      const: "debug",
      default: "debug",
    });
    expect(properties.payload).toEqual({});
    expect(properties.trimmed).toMatchObject({ type: "string" });
    expect(schema.required).toEqual(["trimmed"]);
  });
});
