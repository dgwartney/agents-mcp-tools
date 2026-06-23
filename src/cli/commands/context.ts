import { Command } from 'commander';
import { readCliState, writeCliState, activeStatePath, globalStatePath } from '../state.js';
import { printResult } from '../output.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export function registerContextCommands(program: Command): void {
  const ctx = program.command('context').description('Manage saved CLI context (project ID, session ID)');

  ctx.command('show')
    .description('Display active state file path and current values')
    .option('--global', 'Show global state file', false)
    .action((opts) => {
      const state = readCliState();
      let path: string;
      if (opts.global) {
        path = globalStatePath();
      } else {
        // Walk up to find the local state file that readCliState() would have used
        const localCandidate = join(process.cwd(), '.arch/state.json');
        const gPath = globalStatePath();
        // Use the same resolution order as readCliState(): local first, then global
        if (existsSync(localCandidate)) {
          path = localCandidate;
        } else if (existsSync(gPath)) {
          path = gPath;
        } else {
          // Neither exists; show where local would be written
          path = activeStatePath(false);
        }
      }
      printResult(JSON.stringify({ path, state }, null, 2));
    });

  ctx.command('set-project')
    .description('Save a default project ID')
    .requiredOption('--project-id <id>', 'Project ID to save')
    .option('--global', 'Write to global state file', false)
    .action((opts) => {
      writeCliState({ projectId: opts.projectId }, opts.global);
      console.log(`Saved projectId="${opts.projectId}" to ${activeStatePath(opts.global)}`);
    });

  ctx.command('set-session')
    .description('Save a default session ID')
    .requiredOption('--session-id <id>', 'Session ID to save')
    .option('--global', 'Write to global state file', false)
    .action((opts) => {
      writeCliState({ sessionId: opts.sessionId }, opts.global);
      console.log(`Saved sessionId="${opts.sessionId}" to ${activeStatePath(opts.global)}`);
    });

  ctx.command('set-workspace')
    .description('Save a default workspace (tenant)')
    .requiredOption('--tenant-id <id>', 'Tenant ID to save')
    .option('--workspace-name <name>', 'Workspace display name')
    .option('--global', 'Write to global state file', false)
    .action((opts) => {
      writeCliState({ tenantId: opts.tenantId, workspaceName: opts.workspaceName }, opts.global);
      const label = opts.workspaceName ? `"${opts.workspaceName}" (${opts.tenantId})` : opts.tenantId;
      console.log(`Saved workspace ${label} to ${activeStatePath(opts.global)}`);
    });

  ctx.command('clear')
    .description('Clear saved project ID, session ID, and workspace')
    .option('--global', 'Clear global state file', false)
    .action((opts) => {
      writeCliState({ projectId: undefined, sessionId: undefined, tenantId: undefined, workspaceName: undefined }, opts.global);
      console.log(`Cleared context in ${activeStatePath(opts.global)}`);
    });
}
