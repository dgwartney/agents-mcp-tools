import { Command } from 'commander';
import type { DebugContext } from '../../tools/index.js';
import { printResult, exitOnFailure } from '../output.js';
import { resolveProjectId, resolveSessionId, writeCliState } from '../state.js';

import { connect } from '../../tools/connect.js';
import { platformProjects } from '../../tools/platform-projects.js';
import { platformAgents } from '../../tools/platform-agents.js';
import { platformVersions } from '../../tools/platform-versions.js';
import { platformDeployments } from '../../tools/platform-deployments.js';
import { platformTools } from '../../tools/platform-tools.js';
import { platformConfig } from '../../tools/platform-config.js';
import { platformWorkspaces } from '../../tools/platform-workspaces.js';
import { platformImportExport } from '../../tools/platform-import-export.js';
import { platformValidatePackage } from '../../tools/platform-validate-package.js';
import { platformPackageModel } from '../../tools/platform-package-model.js';
import {
  platformEvalPersonas,
  platformEvalScenarios,
  platformEvalEvaluators,
  platformEvalSets,
  platformEvalRuns,
} from '../../tools/platform-evals.js';

type Ctx = DebugContext;

/**
 * Extract the agent name from an ABL DSL string.
 * Matches the first `AGENT: Name` or `SUPERVISOR: Name` declaration.
 */
function extractDslAgentName(dsl: string): string | undefined {
  const match = dsl.match(/^(?:AGENT|SUPERVISOR):\s*(\S+)/im);
  return match?.[1];
}

function run(handler: () => Promise<string>): void {
  handler()
    .then((result) => {
      printResult(result);
      exitOnFailure(result);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}

function parseJsonOpt(value: string | undefined): unknown | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Invalid JSON: ${value}`);
  }
}

export function registerPlatformCommands(program: Command, ctx: Ctx): void {
  // ── connect ──────────────────────────────────────────────────────────────
  program
    .command('connect')
    .description('Connect to the Arch platform and authenticate')
    .option('--server-url <url>', 'Server URL')
    .option('--auth-token <token>', 'Explicit JWT token')
    .option('--force', 'Force disconnect and reconnect', false)
    .option('--device-code <code>', 'Device code from prior auth')
    .action((opts) => {
      const handler = async (): Promise<string> => {
        const result = await connect({
          serverUrl: opts.serverUrl,
          authToken: opts.authToken,
          force: opts.force,
          deviceCode: opts.deviceCode,
        }, ctx);
        // On successful connect, persist the server URL and workspace info.
        try {
          const parsed = JSON.parse(result) as { success?: boolean; serverUrl?: string };
          if (parsed.success && parsed.serverUrl) {
            const patch: Parameters<typeof writeCliState>[0] = { serverUrl: parsed.serverUrl };
            // Decode JWT to extract tenantId (no API call needed)
            const token = ctx.httpClient.getAuthToken();
            if (token) {
              const parts = token.split('.');
              if (parts.length === 3) {
                try {
                  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as Record<string, unknown>;
                  if (payload.tenantId) patch.tenantId = payload.tenantId as string;
                } catch { /* malformed JWT */ }
              }
            }
            writeCliState(patch);
          }
        } catch { /* ignore parse errors */ }
        return result;
      };
      run(handler);
    });

  // ── projects ─────────────────────────────────────────────────────────────
  const projects = program.command('projects').description('Manage projects');

  projects.command('list')
    .description('List all projects')
    .action(() => run(() => platformProjects({ action: 'list' }, ctx)));

  projects.command('get')
    .description('Get a project by ID')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformProjects({ action: 'get', projectId }, ctx));
    });

  projects.command('create')
    .description('Create a new project')
    .option('--name <name>', 'Project name')
    .option('--description <desc>', 'Project description')
    .option('--save-context', 'Save the new project ID to .arch/state.json as the default project', false)
    .action((opts) => {
      const handler = async (): Promise<string> => {
        const result = await platformProjects({
          action: 'create',
          name: opts.name,
          description: opts.description,
        }, ctx);

        // Extract project ID from the response
        try {
          const parsed = JSON.parse(result) as { success?: boolean; project?: { id?: string } };
          const projectId = parsed.project?.id;
          if (parsed.success && projectId) {
            if (opts.saveContext) {
              // --save-context flag: save silently
              writeCliState({ projectId });
              const enriched = { ...parsed, contextSaved: true, savedProjectId: projectId };
              return JSON.stringify(enriched, null, 2);
            } else {
              // No flag: append a hint showing the command to save it
              const enriched = {
                ...parsed,
                hint: `To set as default project: agentcl context set-project --project-id ${projectId}`,
              };
              return JSON.stringify(enriched, null, 2);
            }
          }
        } catch { /* return original result if parsing fails */ }
        return result;
      };
      run(handler);
    });

  projects.command('update')
    .description('Update a project')
    .option('--project-id <id>', 'Project ID')
    .option('--name <name>', 'New name')
    .option('--description <desc>', 'New description')
    .option('--entry-agent-name <name>', 'Entry agent name (use "" to clear)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformProjects({
        action: 'update',
        projectId,
        name: opts.name,
        description: opts.description,
        entryAgentName: opts.entryAgentName,
      }, ctx));
    });

  projects.command('delete')
    .description('Delete a project')
    .option('--project-id <id>', 'Project ID')
    .option('--confirm', 'Confirm destructive operation', false)
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformProjects({ action: 'delete', projectId, confirm: opts.confirm }, ctx));
    });

  // ── agents ────────────────────────────────────────────────────────────────
  const agents = program.command('agents').description('Manage agents');

  agents.command('list')
    .description('List all agents in a project')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformAgents({ action: 'list', projectId }, ctx));
    });

  agents.command('get')
    .description('Get agent details')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformAgents({ action: 'get', projectId, agentName: opts.agentName }, ctx));
    });

  agents.command('save-dsl')
    .description('Save agent DSL — agent name is inferred from the AGENT:/SUPERVISOR: declaration if --agent-name is omitted')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name (inferred from DSL if not set)')
    .option('--dsl-content <content>', 'DSL content')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      const dslContent: string = opts.dslContent ?? '';

      // Extract the declared name from the DSL header (AGENT: Name or SUPERVISOR: Name)
      const declaredName = extractDslAgentName(dslContent);

      let agentName: string | undefined = opts.agentName;
      if (!agentName && declaredName) {
        agentName = declaredName;
      } else if (agentName && declaredName && agentName !== declaredName) {
        // Mismatch: always use the DSL declaration to avoid AGENT_DSL_NAME_MISMATCH 409
        console.error(`[agentcl] Warning: --agent-name "${agentName}" does not match DSL declaration "${declaredName}". Using "${declaredName}".`);
        agentName = declaredName;
      }

      run(() => platformAgents({ action: 'save_dsl', projectId, agentName, dslContent }, ctx));
    });

  // ── versions ──────────────────────────────────────────────────────────────
  const versions = program.command('versions').description('Manage agent versions');

  versions.command('list')
    .description('List all versions for an agent')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformVersions({ action: 'list', projectId, agentName: opts.agentName }, ctx));
    });

  versions.command('create')
    .description('Create a new agent version')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name')
    .option('--changelog <text>', 'Changelog')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformVersions({
        action: 'create',
        projectId,
        agentName: opts.agentName,
        changelog: opts.changelog,
      }, ctx));
    });

  versions.command('get')
    .description('Get a specific agent version')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name')
    .option('--version <n>', 'Version number', parseInt)
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformVersions({
        action: 'get',
        projectId,
        agentName: opts.agentName,
        version: opts.version,
      }, ctx));
    });

  versions.command('promote')
    .description('Promote an agent version to a new status')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name')
    .option('--version <n>', 'Version number', parseInt)
    .option('--status <status>', 'New status')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformVersions({
        action: 'promote',
        projectId,
        agentName: opts.agentName,
        version: opts.version,
        status: opts.status,
      }, ctx));
    });

  versions.command('diff')
    .description('Diff two agent versions')
    .option('--project-id <id>', 'Project ID')
    .option('--agent-name <name>', 'Agent name')
    .option('--version <n>', 'Version number', parseInt)
    .option('--other-version <m>', 'Other version number', parseInt)
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformVersions({
        action: 'diff',
        projectId,
        agentName: opts.agentName,
        version: opts.version,
        otherVersion: opts.otherVersion,
      }, ctx));
    });

  // ── deployments ───────────────────────────────────────────────────────────
  const deployments = program.command('deployments').description('Manage deployments');

  deployments.command('list')
    .description('List all deployments')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformDeployments({ action: 'list', projectId }, ctx));
    });

  deployments.command('create')
    .description('Create a new deployment')
    .option('--project-id <id>', 'Project ID')
    .option('--label <label>', 'Deployment label')
    .option('--environment <env>', 'Environment')
    .option('--entry-agent-name <name>', 'Entry agent name')
    .option('--agent-version-manifest <json>', 'Agent version manifest (JSON)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformDeployments({
        action: 'create',
        projectId,
        label: opts.label,
        environment: opts.environment,
        entryAgentName: opts.entryAgentName,
        agentVersionManifest: parseJsonOpt(opts.agentVersionManifest) as Record<string, string> | undefined,
      }, ctx));
    });

  deployments.command('get')
    .description('Get a deployment by ID')
    .option('--project-id <id>', 'Project ID')
    .option('--deployment-id <id>', 'Deployment ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformDeployments({
        action: 'get',
        projectId,
        deploymentId: opts.deploymentId,
      }, ctx));
    });

  deployments.command('retire')
    .description('Retire a deployment')
    .option('--project-id <id>', 'Project ID')
    .option('--deployment-id <id>', 'Deployment ID')
    .option('--confirm', 'Confirm destructive operation', false)
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformDeployments({
        action: 'retire',
        projectId,
        deploymentId: opts.deploymentId,
        confirm: opts.confirm,
      }, ctx));
    });

  deployments.command('rollback')
    .description('Rollback a deployment')
    .option('--project-id <id>', 'Project ID')
    .option('--deployment-id <id>', 'Deployment ID')
    .option('--confirm', 'Confirm destructive operation', false)
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformDeployments({
        action: 'rollback',
        projectId,
        deploymentId: opts.deploymentId,
        confirm: opts.confirm,
      }, ctx));
    });

  // ── tools ─────────────────────────────────────────────────────────────────
  const tools = program.command('tools').description('Manage platform tools');

  tools.command('list')
    .description('List all tools')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformTools({ action: 'list', projectId }, ctx));
    });

  tools.command('get')
    .description('Get a tool by ID')
    .option('--project-id <id>', 'Project ID')
    .option('--tool-id <id>', 'Tool ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformTools({ action: 'get', projectId, toolId: opts.toolId }, ctx));
    });

  tools.command('create')
    .description('Create a new tool')
    .option('--project-id <id>', 'Project ID')
    .option('--name <name>', 'Tool name')
    .option('--type <type>', 'Tool type')
    .option('--definition <json>', 'Tool definition (JSON)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformTools({
        action: 'create',
        projectId,
        name: opts.name,
        type: opts.type,
        definition: parseJsonOpt(opts.definition) as Record<string, unknown> | undefined,
      }, ctx));
    });

  tools.command('update')
    .description('Update a tool')
    .option('--project-id <id>', 'Project ID')
    .option('--tool-id <id>', 'Tool ID')
    .option('--name <name>', 'New name')
    .option('--definition <json>', 'New definition (JSON)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformTools({
        action: 'update',
        projectId,
        toolId: opts.toolId,
        name: opts.name,
        definition: parseJsonOpt(opts.definition) as Record<string, unknown> | undefined,
      }, ctx));
    });

  tools.command('delete')
    .description('Delete a tool')
    .option('--project-id <id>', 'Project ID')
    .option('--tool-id <id>', 'Tool ID')
    .option('--confirm', 'Confirm destructive operation', false)
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformTools({
        action: 'delete',
        projectId,
        toolId: opts.toolId,
        confirm: opts.confirm,
      }, ctx));
    });

  tools.command('test')
    .description('Test a tool')
    .option('--project-id <id>', 'Project ID')
    .option('--tool-id <id>', 'Tool ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformTools({ action: 'test', projectId, toolId: opts.toolId }, ctx));
    });

  // ── config ────────────────────────────────────────────────────────────────
  const config = program.command('config').description('Manage project configuration');

  config.command('get-settings')
    .description('Get project settings')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformConfig({ action: 'get_settings', projectId }, ctx));
    });

  config.command('update-settings')
    .description('Update project settings')
    .option('--project-id <id>', 'Project ID')
    .option('--settings <json>', 'Settings object (JSON)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformConfig({
        action: 'update_settings',
        projectId,
        settings: parseJsonOpt(opts.settings) as Record<string, unknown> | undefined,
      }, ctx));
    });

  config.command('get-llm-config')
    .description('Get LLM configuration')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformConfig({ action: 'get_llm_config', projectId }, ctx));
    });

  config.command('update-llm-config')
    .description('Update LLM configuration')
    .option('--project-id <id>', 'Project ID')
    .option('--settings <json>', 'LLM config object (JSON)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformConfig({
        action: 'update_llm_config',
        projectId,
        settings: parseJsonOpt(opts.settings) as Record<string, unknown> | undefined,
      }, ctx));
    });

  // ── workspaces ────────────────────────────────────────────────────────────
  const workspaces = program.command('workspaces').description('Manage workspaces');

  workspaces.command('list')
    .description('List all workspaces')
    .action(() => run(() => platformWorkspaces({ action: 'list' }, ctx)));

  workspaces.command('current')
    .description('Show the current active workspace')
    .action(() => {
      const handler = async (): Promise<string> => {
        const result = await platformWorkspaces({ action: 'current' }, ctx);
        // Save workspace info to context whenever it is resolved
        try {
          const parsed = JSON.parse(result) as { success?: boolean; tenantId?: string; workspaceName?: string };
          if (parsed.success && parsed.tenantId) {
            writeCliState({ tenantId: parsed.tenantId, workspaceName: parsed.workspaceName ?? undefined });
          }
        } catch { /* ignore */ }
        return result;
      };
      run(handler);
    });

  workspaces.command('switch')
    .description('Switch to a different workspace')
    .option('--tenant-id <id>', 'Tenant ID')
    .action((opts) => {
      const handler = async (): Promise<string> => {
        const result = await platformWorkspaces({ action: 'switch', tenantId: opts.tenantId }, ctx);
        // Persist the new workspace to context
        try {
          const parsed = JSON.parse(result) as { success?: boolean; tenantId?: string; workspaceName?: string };
          if (parsed.success && parsed.tenantId) {
            writeCliState({ tenantId: parsed.tenantId, workspaceName: parsed.workspaceName ?? undefined });
          }
        } catch { /* ignore */ }
        return result;
      };
      run(handler);
    });

  // ── import-export ─────────────────────────────────────────────────────────
  const importExport = program.command('import-export').description('Import and export projects');

  importExport.command('export-preview')
    .description('Preview project export metadata')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformImportExport({ action: 'export_preview', projectId }, ctx));
    });

  importExport.command('export')
    .description('Export a project')
    .option('--project-id <id>', 'Project ID')
    .option('--path <path>', 'Output path')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformImportExport({ action: 'export', projectId, path: opts.path }, ctx));
    });

  importExport.command('import-preview')
    .description('Preview a project import (dry run)')
    .option('--project-id <id>', 'Project ID')
    .option('--path <path>', 'Input path')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformImportExport({ action: 'import_preview', projectId, path: opts.path }, ctx));
    });

  importExport.command('import')
    .description('Import a project')
    .option('--project-id <id>', 'Project ID')
    .option('--path <path>', 'Input path')
    .option('--confirm', 'Confirm import', false)
    .option('--preview-digest <digest>', 'Preview digest for acknowledgement')
    .option('--data <json>', 'Import data (JSON)')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformImportExport({
        action: 'import',
        projectId,
        path: opts.path,
        confirm: opts.confirm,
        previewDigest: opts.previewDigest,
        data: parseJsonOpt(opts.data) as Record<string, unknown> | undefined,
      }, ctx));
    });

  // ── validate-package ──────────────────────────────────────────────────────
  program.command('validate-package')
    .description('Validate a local ABL project package')
    .option('--path <path>', 'Local folder or .zip path')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(() => platformValidatePackage({ path: opts.path, projectId }, ctx));
    });

  // ── package-model ─────────────────────────────────────────────────────────
  program.command('package-model')
    .description('Show compiler model for a local package')
    .option('--path <path>', 'Local folder or .zip path')
    .action((opts) => {
      run(() => platformPackageModel({ path: opts.path }, ctx));
    });

  // ── evals ─────────────────────────────────────────────────────────────────
  const evals = program.command('evals').description('Manage evaluations');

  // Helper to register eval resource sub-commands (personas, scenarios, etc.)
  function registerEvalResource(
    parent: Command,
    name: string,
    actions: string[],
    idFlag: string | null,
    handler: (args: unknown, ctx: Ctx) => Promise<string>,
  ): void {
    const resource = parent.command(name).description(`Manage eval ${name}`);
    for (const action of actions) {
      const cmd = resource.command(action);
      cmd.option('--project-id <id>', 'Project ID');
      if (idFlag && ['get', 'update', 'delete'].includes(action)) {
        cmd.option(`--${idFlag} <id>`, `${name.slice(0, -1)} ID`);
      }
      if (['create', 'update', 'generate', 'quick'].includes(action)) {
        cmd.option('--body <json>', 'Request body (JSON)');
      }
      if (action === 'delete') {
        cmd.option('--confirm', 'Confirm destructive operation', false);
      }
      cmd.action((opts) => {
        const projectId = resolveProjectId(opts.projectId) ?? '';
        const idKey = idFlag ? idFlag.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) : undefined;
        const args: Record<string, unknown> = {
          action,
          projectId,
          body: parseJsonOpt(opts.body),
        };
        if (idKey && opts[idKey]) args[idKey] = opts[idKey];
        if (action === 'delete') args.confirm = opts.confirm;
        run(() => handler(args, ctx));
      });
    }
  }

  registerEvalResource(evals, 'personas', ['list', 'get', 'create', 'update', 'delete', 'templates', 'generate'], 'persona-id', platformEvalPersonas as (args: unknown, ctx: Ctx) => Promise<string>);
  registerEvalResource(evals, 'scenarios', ['list', 'get', 'create', 'update', 'delete', 'generate'], 'scenario-id', platformEvalScenarios as (args: unknown, ctx: Ctx) => Promise<string>);
  registerEvalResource(evals, 'evaluators', ['list', 'get', 'create', 'update', 'delete', 'templates'], 'evaluator-id', platformEvalEvaluators as (args: unknown, ctx: Ctx) => Promise<string>);
  registerEvalResource(evals, 'sets', ['list', 'get', 'create', 'update', 'delete'], 'set-id', platformEvalSets as (args: unknown, ctx: Ctx) => Promise<string>);

  // runs — special handling for compare (needs run-ids array) and status/heatmap/cases
  const runs = evals.command('runs').description('Manage eval runs');
  const runsActions = ['list', 'get', 'create', 'update', 'start', 'cancel', 'status', 'heatmap', 'cases', 'compare', 'preflight', 'quick'];
  for (const action of runsActions) {
    const cmd = runs.command(action);
    cmd.option('--project-id <id>', 'Project ID');
    if (['get', 'update', 'start', 'cancel', 'status', 'heatmap', 'cases'].includes(action)) {
      cmd.option('--run-id <id>', 'Run ID');
    }
    if (action === 'compare') {
      cmd.option('--run-ids <ids>', 'Comma-separated run IDs (e.g. r1,r2)');
    }
    if (['create', 'update', 'quick'].includes(action)) {
      cmd.option('--body <json>', 'Request body (JSON)');
    }
    cmd.action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      const args: Record<string, unknown> = {
        action,
        projectId,
        runId: opts.runId,
        body: parseJsonOpt(opts.body),
      };
      if (opts.runIds) {
        args.runIds = opts.runIds.split(',');
      }
      run(() => platformEvalRuns(args as never, ctx));
    });
  }
}
