/**
 * Tests for the documentation stub.
 *
 * Docs are served by the Studio API — the MCP package has no embedded content.
 * These tests verify the stub exports compile and return empty values.
 */
import { describe, test, expect } from "vitest";
import { ABL_DOCS, DOC_TOPICS, searchDocumentation } from "../docs/index.js";

describe("Documentation Stub", () => {
  test("ABL_DOCS is empty (docs are API-only)", () => {
    expect(ABL_DOCS).toEqual({});
  });

  test("DOC_TOPICS is empty", () => {
    expect(DOC_TOPICS).toEqual([]);
  });

  test("searchDocumentation returns empty array", () => {
    expect(searchDocumentation("anything")).toEqual([]);
  });
});
