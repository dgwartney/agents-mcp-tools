/**
 * Documentation Tools
 *
 * debug_docs - Fetch ABL documentation from the authenticated platform API.
 * Docs are served by the runtime behind auth, not embedded in this package.
 */

import { z } from 'zod';
import type { DebugContext } from './index.js';

// =============================================================================
// debug_docs — unified get + search (fetched from platform API)
// =============================================================================

export const docsSchema = z.object({
  topic: z
    .string()
    .optional()
    .describe(
      'Documentation topic to retrieve full content for (e.g. overview, scripted, reasoning, supervisor, trace-events, debugging, context). Call without topic to list available topics.',
    ),
  query: z.string().optional().describe('Search term to find across all documentation topics'),
});

type DocsArgs = z.infer<typeof docsSchema>;

export async function docs(args: DocsArgs, ctx: DebugContext): Promise<string> {
  const { topic, query } = args;

  if (!ctx.httpClient.getBaseUrl()) {
    return JSON.stringify({
      error: 'Not connected. Run platform_connect first.',
    });
  }

  try {
    if (topic) {
      const data = await ctx.httpClient.get<{
        success: boolean;
        topic: string;
        content: string;
        error?: { code: string; message: string };
        availableTopics?: string[];
      }>(`/api/docs/${encodeURIComponent(topic)}`);

      if (!data.success) {
        return JSON.stringify({
          error: data.error?.message || `Unknown topic: ${topic}`,
          availableTopics: data.availableTopics,
        });
      }

      return JSON.stringify({ topic: data.topic, content: data.content }, null, 2);
    }

    if (query) {
      const data = await ctx.httpClient.get<{
        success: boolean;
        query: string;
        resultCount: number;
        results: Array<{ topic: string; excerpt: string }>;
      }>(`/api/docs/search/query?q=${encodeURIComponent(query)}`);

      return JSON.stringify(
        { query: data.query, resultCount: data.resultCount, results: data.results },
        null,
        2,
      );
    }

    const data = await ctx.httpClient.get<{
      success: boolean;
      topics: string[];
    }>('/api/docs');

    return JSON.stringify(
      {
        availableTopics: data.topics,
        hint: 'Provide a "topic" to get full content, or a "query" to search across all topics.',
      },
      null,
      2,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('401') || message.includes('403')) {
      return JSON.stringify({
        error: 'Authentication required. Run platform_connect first, then retry.',
      });
    }

    return JSON.stringify({ error: `Failed to fetch docs: ${message}` });
  }
}
