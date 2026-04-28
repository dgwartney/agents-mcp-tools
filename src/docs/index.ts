/**
 * Embedded docs stub.
 *
 * The MCP tool fetches docs from the Studio API (GET /api/abl/docs).
 * These empty exports exist only so the TypeScript imports in docs.ts compile.
 * They are never used when the API is reachable.
 */

export const ABL_DOCS: Record<string, string> = {};

export const DOC_TOPICS: string[] = [];

export function searchDocumentation(
  _query: string,
): Array<{ topic: string; excerpt: string }> {
  return [];
}
