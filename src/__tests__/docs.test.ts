/**
 * Tests for the documentation system
 */
import { describe, test, expect } from 'vitest';
import { ABL_DOCS, DOC_TOPICS, getDocumentation, searchDocumentation } from '../docs/index.js';

describe('Documentation System', () => {
  describe('DOC_TOPICS', () => {
    test('should contain all expected topics', () => {
      expect(DOC_TOPICS).toContain('overview');
      expect(DOC_TOPICS).toContain('scripted');
      expect(DOC_TOPICS).toContain('reasoning');
      expect(DOC_TOPICS).toContain('supervisor');
      expect(DOC_TOPICS).toContain('trace-events');
      expect(DOC_TOPICS).toContain('debugging');
      expect(DOC_TOPICS).toContain('context');
    });

    test('should have 7 topics', () => {
      expect(DOC_TOPICS).toHaveLength(7);
    });
  });

  describe('ABL_DOCS', () => {
    test('should have content for all topics', () => {
      for (const topic of DOC_TOPICS) {
        expect(ABL_DOCS[topic]).toBeDefined();
        expect(ABL_DOCS[topic].length).toBeGreaterThan(0);
      }
    });

    test('overview should contain key concepts', () => {
      const overview = ABL_DOCS['overview'];
      expect(overview).toContain('Agent ABL');
      expect(overview).toContain('scripted');
      expect(overview).toContain('reasoning');
      expect(overview).toContain('supervisor');
    });

    test('scripted docs should contain flow syntax', () => {
      const scripted = ABL_DOCS['scripted'];
      expect(scripted).toContain('flow');
      expect(scripted).toContain('transitions');
      expect(scripted).toContain('collect');
      expect(scripted).toContain('prompt');
    });

    test('reasoning docs should contain tools and constraints', () => {
      const reasoning = ABL_DOCS['reasoning'];
      expect(reasoning).toContain('tools');
      expect(reasoning).toContain('constraints');
      expect(reasoning).toContain('goals');
    });

    test('supervisor docs should contain delegation concepts', () => {
      const supervisor = ABL_DOCS['supervisor'];
      expect(supervisor).toContain('delegate');
      expect(supervisor).toContain('routing');
      expect(supervisor).toContain('escalation');
    });

    test('trace-events docs should list all event types', () => {
      const traceEvents = ABL_DOCS['trace-events'];
      expect(traceEvents).toContain('agent_enter');
      expect(traceEvents).toContain('agent_exit');
      expect(traceEvents).toContain('flow_step_enter');
      expect(traceEvents).toContain('llm_call');
      expect(traceEvents).toContain('tool_call');
      expect(traceEvents).toContain('error');
    });

    test('debugging guide should contain common issues', () => {
      const debugging = ABL_DOCS['debugging'];
      expect(debugging).toContain('loop');
      expect(debugging).toContain('stuck');
      expect(debugging).toContain('Tool not being called');
    });

    test('context docs should explain context structure', () => {
      const context = ABL_DOCS['context'];
      expect(context).toContain('user');
      expect(context).toContain('agent');
      expect(context).toContain('collected');
    });
  });

  describe('getDocumentation', () => {
    test('should return documentation for valid topic', () => {
      const doc = getDocumentation('overview');
      expect(doc).toBeDefined();
      expect(doc).toContain('Agent ABL');
    });

    test('should return null for invalid topic', () => {
      const doc = getDocumentation('nonexistent');
      expect(doc).toBeNull();
    });

    test('should return correct content for each topic', () => {
      for (const topic of DOC_TOPICS) {
        const doc = getDocumentation(topic);
        expect(doc).toBe(ABL_DOCS[topic]);
      }
    });
  });

  describe('searchDocumentation', () => {
    test('should find results for common terms', () => {
      const results = searchDocumentation('agent');
      expect(results.length).toBeGreaterThan(0);
    });

    test('should return topic and excerpt for matches', () => {
      const results = searchDocumentation('scripted');
      expect(results.length).toBeGreaterThan(0);

      const firstResult = results[0];
      expect(firstResult.topic).toBeDefined();
      expect(firstResult.excerpt).toBeDefined();
    });

    test('should be case insensitive', () => {
      const lowerResults = searchDocumentation('agent');
      const upperResults = searchDocumentation('AGENT');
      const mixedResults = searchDocumentation('Agent');

      expect(lowerResults.length).toBe(upperResults.length);
      expect(lowerResults.length).toBe(mixedResults.length);
    });

    test('should return empty array for no matches', () => {
      const results = searchDocumentation('xyznonexistentterm123');
      expect(results).toHaveLength(0);
    });

    test('should find specific DSL keywords', () => {
      const flowResults = searchDocumentation('flow');
      expect(flowResults.length).toBeGreaterThan(0);
      expect(flowResults.some((r) => r.topic === 'scripted')).toBe(true);

      const toolResults = searchDocumentation('tool_call');
      expect(toolResults.length).toBeGreaterThan(0);
      expect(toolResults.some((r) => r.topic === 'trace-events')).toBe(true);
    });

    test('should include context around the match in excerpt', () => {
      const results = searchDocumentation('transitions');
      const scriptedResult = results.find((r) => r.topic === 'scripted');
      expect(scriptedResult).toBeDefined();
      expect(scriptedResult?.excerpt).toContain('transitions');
    });

    test('should handle multi-word searches', () => {
      const results = searchDocumentation('flow step');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('Documentation Content Quality', () => {
    test('all docs should have markdown headers', () => {
      for (const topic of DOC_TOPICS) {
        const doc = ABL_DOCS[topic];
        expect(doc).toMatch(/^#\s/m); // Should start with a header
      }
    });

    test('all docs should have code examples', () => {
      for (const topic of DOC_TOPICS) {
        const doc = ABL_DOCS[topic];
        expect(doc).toContain('```'); // Should have code blocks
      }
    });

    test('scripted docs should have yaml examples', () => {
      const scripted = ABL_DOCS['scripted'];
      expect(scripted).toContain('```yaml');
    });

    test('trace-events should have json example', () => {
      const traceEvents = ABL_DOCS['trace-events'];
      expect(traceEvents).toContain('```json');
    });

    test('debugging guide should have diagnostic steps', () => {
      const debugging = ABL_DOCS['debugging'];
      expect(debugging).toContain('Diagnosis');
      expect(debugging).toContain('Solution');
    });
  });
});
