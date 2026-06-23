import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { DebugContext } from '../../tools/index.js';

// Mock all platform tool handlers
vi.mock('../../tools/connect.js', () => ({
  connect: vi.fn().mockResolvedValue('{"success":true,"status":"connected"}'),
  connectSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-projects.js', () => ({
  platformProjects: vi.fn().mockResolvedValue('{"projects":[]}'),
  platformProjectsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-agents.js', () => ({
  platformAgents: vi.fn().mockResolvedValue('{"agents":[]}'),
  platformAgentsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-versions.js', () => ({
  platformVersions: vi.fn().mockResolvedValue('{"versions":[]}'),
  platformVersionsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-deployments.js', () => ({
  platformDeployments: vi.fn().mockResolvedValue('{"deployments":[]}'),
  platformDeploymentsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-tools.js', () => ({
  platformTools: vi.fn().mockResolvedValue('{"tools":[]}'),
  platformToolsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-config.js', () => ({
  platformConfig: vi.fn().mockResolvedValue('{"settings":{}}'),
  platformConfigSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-workspaces.js', () => ({
  platformWorkspaces: vi.fn().mockResolvedValue('{"workspaces":[]}'),
  platformWorkspacesSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-import-export.js', () => ({
  platformImportExport: vi.fn().mockResolvedValue('{"result":"ok"}'),
  platformImportExportSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-validate-package.js', () => ({
  platformValidatePackage: vi.fn().mockResolvedValue('{"issues":[]}'),
  platformValidatePackageSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-package-model.js', () => ({
  platformPackageModel: vi.fn().mockResolvedValue('{"model":{}}'),
  platformPackageModelSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/platform-evals.js', () => ({
  platformEvalPersonas: vi.fn().mockResolvedValue('{"personas":[]}'),
  platformEvalPersonasSchema: { parse: vi.fn((x) => x) },
  platformEvalScenarios: vi.fn().mockResolvedValue('{"scenarios":[]}'),
  platformEvalScenariosSchema: { parse: vi.fn((x) => x) },
  platformEvalEvaluators: vi.fn().mockResolvedValue('{"evaluators":[]}'),
  platformEvalEvaluatorsSchema: { parse: vi.fn((x) => x) },
  platformEvalSets: vi.fn().mockResolvedValue('{"sets":[]}'),
  platformEvalSetsSchema: { parse: vi.fn((x) => x) },
  platformEvalRuns: vi.fn().mockResolvedValue('{"runs":[]}'),
  platformEvalRunsSchema: { parse: vi.fn((x) => x) },
}));

import { registerPlatformCommands } from '../../cli/commands/platform.js';
import { platformProjects } from '../../tools/platform-projects.js';
import { platformAgents } from '../../tools/platform-agents.js';
import { platformVersions } from '../../tools/platform-versions.js';
import { platformDeployments } from '../../tools/platform-deployments.js';
import { platformTools } from '../../tools/platform-tools.js';
import { platformConfig } from '../../tools/platform-config.js';
import { platformWorkspaces } from '../../tools/platform-workspaces.js';
import { platformImportExport } from '../../tools/platform-import-export.js';
import { platformEvalPersonas, platformEvalRuns } from '../../tools/platform-evals.js';

function createMockCtx(): DebugContext {
  return {
    wsClient: {} as never,
    httpClient: {} as never,
    sessionStore: {} as never,
    traceStore: {} as never,
    authenticate: vi.fn().mockResolvedValue({ token: 'jwt', method: 'stored_credentials' }),
  };
}

async function runCli(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  const ctx = createMockCtx();
  registerPlatformCommands(program, ctx);
  await program.parseAsync(['node', 'arch', ...args]);
}

describe('platform commands', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('platform projects list calls platformProjects with action=list', async () => {
    await runCli(['projects', 'list']);
    expect(platformProjects).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'list' }),
      expect.any(Object),
    );
  });

  test('platform projects get passes projectId', async () => {
    await runCli(['projects', 'get', '--project-id', 'proj-123']);
    expect(platformProjects).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'get', projectId: 'proj-123' }),
      expect.any(Object),
    );
  });

  test('platform projects create passes name and description', async () => {
    await runCli(['projects', 'create', '--name', 'My Project', '--description', 'Desc']);
    expect(platformProjects).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', name: 'My Project', description: 'Desc' }),
      expect.any(Object),
    );
  });

  test('platform projects delete passes confirm flag', async () => {
    await runCli(['projects', 'delete', '--project-id', 'proj-123', '--confirm']);
    expect(platformProjects).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete', projectId: 'proj-123', confirm: true }),
      expect.any(Object),
    );
  });

  test('platform agents list passes projectId', async () => {
    await runCli(['agents', 'list', '--project-id', 'proj-abc']);
    expect(platformAgents).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'list', projectId: 'proj-abc' }),
      expect.any(Object),
    );
  });

  test('platform versions diff passes both version numbers', async () => {
    await runCli(['versions', 'diff', '--project-id', 'p', '--agent-name', 'a', '--version', '2', '--other-version', '1']);
    expect(platformVersions).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'diff', version: 2, otherVersion: 1 }),
      expect.any(Object),
    );
  });

  test('platform deployments create parses agent-version-manifest JSON', async () => {
    const manifest = JSON.stringify({ agent1: 3 });
    await runCli(['deployments', 'create', '--project-id', 'p', '--agent-version-manifest', manifest]);
    expect(platformDeployments).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', agentVersionManifest: { agent1: 3 } }),
      expect.any(Object),
    );
  });

  test('platform tools test passes toolId', async () => {
    await runCli(['tools', 'test', '--project-id', 'p', '--tool-id', 't-1']);
    expect(platformTools).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'test', toolId: 't-1' }),
      expect.any(Object),
    );
  });

  test('platform config update-settings parses settings JSON', async () => {
    await runCli(['config', 'update-settings', '--project-id', 'p', '--settings', '{"timeout":30}']);
    expect(platformConfig).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update_settings', settings: { timeout: 30 } }),
      expect.any(Object),
    );
  });

  test('platform workspaces switch passes tenantId', async () => {
    await runCli(['workspaces', 'switch', '--tenant-id', 'tenant-xyz']);
    expect(platformWorkspaces).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'switch', tenantId: 'tenant-xyz' }),
      expect.any(Object),
    );
  });

  test('platform import-export export passes path', async () => {
    await runCli(['import-export', 'export', '--project-id', 'p', '--path', '/tmp/export']);
    expect(platformImportExport).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'export', path: '/tmp/export' }),
      expect.any(Object),
    );
  });

  test('platform evals personas list passes projectId', async () => {
    await runCli(['evals', 'personas', 'list', '--project-id', 'p']);
    expect(platformEvalPersonas).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'list', projectId: 'p' }),
      expect.any(Object),
    );
  });

  test('platform evals runs compare passes run-ids as array', async () => {
    await runCli(['evals', 'runs', 'compare', '--project-id', 'p', '--run-ids', 'r1,r2']);
    expect(platformEvalRuns).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'compare', runIds: ['r1', 'r2'] }),
      expect.any(Object),
    );
  });
});
