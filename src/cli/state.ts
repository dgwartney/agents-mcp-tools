import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface CliState {
  projectId?: string;
  sessionId?: string;
}

const LOCAL_STATE_FILE = '.arch/state.json';

export function globalStatePath(): string {
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  return join(base, 'kore-platform', 'cli-state.json');
}

function findLocalStatePath(): string | null {
  let dir = process.cwd();
  while (true) {
    const candidate = join(dir, LOCAL_STATE_FILE);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function localWritePath(): string {
  return findLocalStatePath() ?? join(process.cwd(), LOCAL_STATE_FILE);
}

export function activeStatePath(global = false): string {
  return global ? globalStatePath() : (findLocalStatePath() ?? localWritePath());
}

export function readCliState(): CliState {
  const paths = [findLocalStatePath(), globalStatePath()].filter(Boolean) as string[];
  for (const p of paths) {
    try {
      if (existsSync(p)) {
        return JSON.parse(readFileSync(p, 'utf-8')) as CliState;
      }
    } catch { /* malformed — skip */ }
  }
  return {};
}

export function writeCliState(patch: Partial<CliState>, global = false): void {
  const targetPath = global ? globalStatePath() : localWritePath();
  const existing = (() => {
    try { return existsSync(targetPath) ? (JSON.parse(readFileSync(targetPath, 'utf-8')) as CliState) : {}; }
    catch { return {}; }
  })();
  const merged = { ...existing, ...patch };
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');
}

export function resolveProjectId(explicit?: string): string | undefined {
  return explicit ?? readCliState().projectId;
}

export function resolveSessionId(explicit?: string): string | undefined {
  return explicit ?? readCliState().sessionId;
}
