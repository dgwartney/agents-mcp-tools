/**
 * Agent ABL Documentation
 *
 * Documentation is now served by the platform API behind authentication.
 * This module is kept for backward compatibility but contains no content.
 * The debug_docs tool fetches docs from GET /api/docs/:topic at runtime.
 */

export const ABL_DOCS: Record<string, string> = {};

export const DOC_TOPICS: string[] = [];

export function getDocumentation(_topic: string): string | null {
  return null;
}

export function searchDocumentation(_query: string): Array<{ topic: string; excerpt: string }> {
  return [];
}
