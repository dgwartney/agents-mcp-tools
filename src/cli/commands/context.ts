import { Command } from 'commander';
import { readCliState, writeCliState, activeStatePath } from '../state.js';
import { printResult } from '../output.js';

export function registerContextCommands(program: Command): void {
  const ctx = program.command('context').description('Manage saved CLI context (project ID, session ID)');

  ctx.command('show')
    .description('Display active state file path and current values')
    .option('--global', 'Show global state file', false)
    .action((opts) => {
      const path = activeStatePath(opts.global);
      const state = readCliState();
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

  ctx.command('clear')
    .description('Clear saved project ID and session ID')
    .option('--global', 'Clear global state file', false)
    .action((opts) => {
      writeCliState({ projectId: undefined, sessionId: undefined }, opts.global);
      console.log(`Cleared context in ${activeStatePath(opts.global)}`);
    });
}
