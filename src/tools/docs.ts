/**
 * Documentation Tools
 *
 * debug_docs - Get or search embedded Agent ABL documentation.
 */

import { z } from 'zod';
import { ABL_DOCS, DOC_TOPICS, searchDocumentation } from '../docs/index.js';
import type { DebugContext } from './index.js';

// =============================================================================
// debug_docs — unified get + search
// =============================================================================

export const docsSchema = z.object({
  topic: z
    .enum(DOC_TOPICS as [string, ...string[]])
    .optional()
    .describe(
      `Documentation topic to retrieve full content for. Available: ${DOC_TOPICS.join(', ')}`,
    ),
  query: z.string().optional().describe('Search term to find across all documentation topics'),
});

type DocsArgs = z.infer<typeof docsSchema>;

export async function docs(args: DocsArgs, _ctx: DebugContext): Promise<string> {
  const { topic, query } = args;

  // If topic provided, return full content for that topic
  if (topic) {
    const content = ABL_DOCS[topic];

    if (!content) {
      return JSON.stringify(
        {
          error: `Unknown topic: ${topic}`,
          availableTopics: DOC_TOPICS,
        },
        null,
        2,
      );
    }

    return JSON.stringify(
      {
        topic,
        content,
      },
      null,
      2,
    );
  }

  // If query provided, search across all topics
  if (query) {
    const results = searchDocumentation(query);

    return JSON.stringify(
      {
        query,
        resultCount: results.length,
        results,
      },
      null,
      2,
    );
  }

  // Neither provided — return available topic list
  return JSON.stringify(
    {
      availableTopics: DOC_TOPICS,
      hint: 'Provide a "topic" to get full content, or a "query" to search across all topics.',
    },
    null,
    2,
  );
}
