import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';

// We test with a temp dir as the CWD substitute
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'arch-state-test-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('readCliState', () => {
  test('returns empty object when no state file exists', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    const { readCliState } = await import('../../cli/state.js');
    expect(readCliState()).toEqual({});
  });

  test('reads projectId from local .arch/state.json', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mkdirSync(join(tmpDir, '.arch'));
    writeFileSync(join(tmpDir, '.arch/state.json'), JSON.stringify({ projectId: 'proj-123' }));
    vi.resetModules();
    const { readCliState } = await import('../../cli/state.js');
    expect(readCliState()).toEqual({ projectId: 'proj-123' });
  });

  test('returns empty object on malformed JSON', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mkdirSync(join(tmpDir, '.arch'));
    writeFileSync(join(tmpDir, '.arch/state.json'), '{invalid}');
    vi.resetModules();
    const { readCliState } = await import('../../cli/state.js');
    expect(readCliState()).toEqual({});
  });
});

describe('writeCliState', () => {
  test('creates .arch/state.json in cwd when no existing local file', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
    const { writeCliState } = await import('../../cli/state.js');
    writeCliState({ projectId: 'proj-456' });
    const written = JSON.parse(readFileSync(join(tmpDir, '.arch/state.json'), 'utf-8'));
    expect(written).toEqual({ projectId: 'proj-456' });
  });

  test('merges patch into existing state', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mkdirSync(join(tmpDir, '.arch'));
    writeFileSync(join(tmpDir, '.arch/state.json'), JSON.stringify({ projectId: 'old', sessionId: 'sess-1' }));
    vi.resetModules();
    const { writeCliState } = await import('../../cli/state.js');
    writeCliState({ projectId: 'new' });
    const written = JSON.parse(readFileSync(join(tmpDir, '.arch/state.json'), 'utf-8'));
    expect(written).toEqual({ projectId: 'new', sessionId: 'sess-1' });
  });
});

describe('resolveProjectId', () => {
  test('returns explicit value when provided', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
    const { resolveProjectId } = await import('../../cli/state.js');
    expect(resolveProjectId('explicit-id')).toBe('explicit-id');
  });

  test('falls back to state file projectId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mkdirSync(join(tmpDir, '.arch'));
    writeFileSync(join(tmpDir, '.arch/state.json'), JSON.stringify({ projectId: 'from-state' }));
    vi.resetModules();
    const { resolveProjectId } = await import('../../cli/state.js');
    expect(resolveProjectId(undefined)).toBe('from-state');
  });

  test('returns undefined when no explicit and no state', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
    const { resolveProjectId } = await import('../../cli/state.js');
    expect(resolveProjectId(undefined)).toBeUndefined();
  });
});

describe('resolveSessionId', () => {
  test('returns explicit value when provided', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.resetModules();
    const { resolveSessionId } = await import('../../cli/state.js');
    expect(resolveSessionId('sess-explicit')).toBe('sess-explicit');
  });

  test('falls back to state file sessionId', async () => {
    vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    mkdirSync(join(tmpDir, '.arch'));
    writeFileSync(join(tmpDir, '.arch/state.json'), JSON.stringify({ sessionId: 'sess-from-state' }));
    vi.resetModules();
    const { resolveSessionId } = await import('../../cli/state.js');
    expect(resolveSessionId(undefined)).toBe('sess-from-state');
  });
});
