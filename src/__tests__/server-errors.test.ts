import { describe, expect, test } from "vitest";
import { z } from "zod";
import { formatToolCallError, formatUnknownToolError } from "../server.js";

describe("MCP server error formatting", () => {
  test("formats unknown tool errors with available tool hints", () => {
    const error = formatUnknownToolError("debug_missing_tool");

    expect(error).toMatchObject({
      success: false,
      errorCode: "UNKNOWN_TOOL",
      toolName: "debug_missing_tool",
    });
    expect(error.error).toContain("debug_missing_tool");
    expect(error.hint).toContain("tools/list");
    expect(error.availableTools).toEqual(
      expect.arrayContaining(["platform_connect", "debug_traces"]),
    );
  });

  test("formats Zod validation errors with field paths and options", () => {
    const schema = z.object({
      action: z.enum(["list", "get"]),
      traceLimit: z.number().int().positive().max(10),
    });

    const parseResult = schema.safeParse({
      action: "delete",
      traceLimit: 0,
    });
    expect(parseResult.success).toBe(false);
    if (parseResult.success) return;

    const error = formatToolCallError("debug_test_tool", parseResult.error);

    expect(error).toMatchObject({
      success: false,
      errorCode: "TOOL_ARGUMENT_VALIDATION_FAILED",
      toolName: "debug_test_tool",
      error: "Invalid arguments for debug_test_tool",
    });
    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "action",
          code: "invalid_enum_value",
          options: ["list", "get"],
        }),
        expect.objectContaining({
          path: "traceLimit",
          code: "too_small",
          minimum: 0,
          inclusive: false,
        }),
      ]),
    );
    expect(error.hint).toContain("inputSchema");
  });

  test("formats execution errors without losing code and cause", () => {
    const cause = new Error("provider returned 429");
    const executionError = new Error("Model provider request failed", {
      cause,
    }) as Error & { code?: string };
    executionError.code = "MODEL_PROVIDER_ERROR";

    const error = formatToolCallError(
      "debug_model_interactions",
      executionError,
    );

    expect(error).toMatchObject({
      success: false,
      errorCode: "MODEL_PROVIDER_ERROR",
      error: "Model provider request failed",
      toolName: "debug_model_interactions",
      cause: "provider returned 429",
    });
  });
});
