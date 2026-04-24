/**
 * Tests for the documentation module (post-migration)
 *
 * After migration, docs are served by the platform API.
 * The local docs/index.ts module is a stub with no content.
 */
import { describe, test, expect } from 'vitest';
import { ABL_DOCS, DOC_TOPICS, getDocumentation, searchDocumentation } from '../docs/index.js';

describe('Documentation Stub (content moved to platform API)', () => {
  test('ABL_DOCS should be empty — content is served by the platform', () => {
    expect(Object.keys(ABL_DOCS)).toHaveLength(0);
  });

  test('DOC_TOPICS should be empty — topics are fetched from the platform', () => {
    expect(DOC_TOPICS).toHaveLength(0);
  });

  test('getDocumentation should return null for any topic', () => {
    expect(getDocumentation('overview')).toBeNull();
    expect(getDocumentation('scripted')).toBeNull();
    expect(getDocumentation('nonexistent')).toBeNull();
  });

  test('searchDocumentation should return empty array', () => {
    expect(searchDocumentation('agent')).toHaveLength(0);
    expect(searchDocumentation('anything')).toHaveLength(0);
  });
});
