/**
 * Documentation Tools
 *
 * debug_docs - Get or search Agent ABL documentation via the Studio API.
 * Requires an active platform connection (platform_connect).
 */

import { z } from "zod";
import { fetchWithTimeout } from "../utils/fetch.js";
import type { DebugContext } from "./index.js";

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_STUDIO_PORT = 5173;
const FETCH_TIMEOUT_MS = 10_000;

// =============================================================================
// HELPERS
// =============================================================================

function deriveStudioUrl(runtimeBaseUrl: string): string {
  try {
    const url = new URL(runtimeBaseUrl);
    if (url.port && url.port !== "443" && url.port !== "80") {
      url.port = String(DEFAULT_STUDIO_PORT);
    }
    return url.origin;
  } catch {
    return runtimeBaseUrl;
  }
}

function buildHeaders(ctx: DebugContext): Record<string, string> {
  const headers: Record<string, string> = {};
  const token = ctx.httpClient.getAuthToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

function error(message: string, detail?: string): string {
  return JSON.stringify(
    { success: false, error: message, ...(detail ? { detail } : {}) },
    null,
    2,
  );
}

// =============================================================================
// REMOTE DOCS (Studio API)
// =============================================================================

interface TopicMeta {
  id: string;
  title: string;
  category: string;
}

interface RemoteTopicResult {
  success: boolean;
  topic?: { id: string; title: string; category: string; content: string };
  error?: string;
}

interface RemoteIndexResult {
  success: boolean;
  topics?: TopicMeta[];
}

interface RemoteSearchResult {
  success: boolean;
  results?: Array<{ id: string; title: string; excerpt: string }>;
}

async function apiFetch<T>(
  url: string,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetchWithTimeout(url, { headers }, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${body ? `: ${body}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

// =============================================================================
// SCHEMA
// =============================================================================

export const docsSchema = z.object({
  topic: z
    .string()
    .optional()
    .describe(
      "Documentation topic to retrieve full content for. Use without arguments to list all available topics.",
    ),
  query: z
    .string()
    .optional()
    .describe("Search term to find across all documentation topics"),
});

type DocsArgs = z.infer<typeof docsSchema>;

// =============================================================================
// HANDLER
// =============================================================================

export async function docs(args: DocsArgs, ctx: DebugContext): Promise<string> {
  const { topic, query } = args;

  const baseUrl = ctx.httpClient.getBaseUrl();
  if (!baseUrl) {
    return error(
      "Not connected. Call platform_connect first.",
      "Documentation is served by the Studio API and requires an active connection.",
    );
  }

  const headers = buildHeaders(ctx);
  if (!headers["Authorization"]) {
    return error(
      "Not authenticated. Call platform_connect first.",
      "The docs API requires authentication.",
    );
  }

  const studioBase = deriveStudioUrl(baseUrl);

  // ── LIST TOPICS ──────────────────────────────────────────────────────────
  if (!topic && !query) {
    try {
      const data = await apiFetch<RemoteIndexResult>(
        `${studioBase}/api/abl/docs`,
        headers,
      );
      if (data.success && data.topics) {
        return JSON.stringify(
          {
            source: "api",
            availableTopics: data.topics,
            total: data.topics.length,
            hint: 'Provide a "topic" (by id) to get full content, or a "query" to search across all topics.',
          },
          null,
          2,
        );
      }
      return error("API returned no topics.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return error(
        `Failed to list topics: ${msg}`,
        "Ensure Studio is running and you are authenticated (platform_connect).",
      );
    }
  }

  // ── GET TOPIC ────────────────────────────────────────────────────────────
  if (topic) {
    try {
      const safeTopic = encodeURIComponent(topic);
      const data = await apiFetch<RemoteTopicResult>(
        `${studioBase}/api/abl/docs?topic=${safeTopic}`,
        headers,
      );
      if (data.success && data.topic) {
        return JSON.stringify(
          {
            source: "api",
            topic: data.topic.id,
            title: data.topic.title,
            category: data.topic.category,
            content: data.topic.content,
          },
          null,
          2,
        );
      }
      return error(
        `Topic "${topic}" not found.`,
        "Use debug_docs without arguments to list available topics.",
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return error(
        `Failed to fetch topic "${topic}": ${msg}`,
        "Ensure Studio is running and you are authenticated (platform_connect).",
      );
    }
  }

  // ── SEARCH ───────────────────────────────────────────────────────────────
  if (query) {
    try {
      const safeQuery = encodeURIComponent(query);
      const data = await apiFetch<RemoteSearchResult>(
        `${studioBase}/api/abl/docs?search=${safeQuery}`,
        headers,
      );
      if (data.success && data.results) {
        return JSON.stringify(
          {
            source: "api",
            query,
            resultCount: data.results.length,
            results: data.results,
          },
          null,
          2,
        );
      }
      return error("Search returned no results.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return error(
        `Search failed: ${msg}`,
        "Ensure Studio is running and you are authenticated (platform_connect).",
      );
    }
  }

  return error('Provide a "topic" or "query" parameter.');
}
