#!/usr/bin/env node
// bin/agentcl.ts
// agentcl — AWS-CLI-style interface to the Arch MCP tools
// Usage: agentcl <platform|debug> <command> [flags]

import { Command } from 'commander';
import { buildCliContext } from '../src/cli/context.js';
import { registerPlatformCommands } from '../src/cli/commands/platform.js';
import { registerDebugCommands } from '../src/cli/commands/debug.js';
import { registerContextCommands } from '../src/cli/commands/context.js';

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('agentcl')
    .description('agentcl — direct access to Arch Agent Platform tools')
    .version('1.0.0')
    .option('--server-url <url>', 'Server URL (overrides AGENTS_URL env var)');

  // Pre-parse to extract global options BEFORE registering sub-commands.
  // program.parseOptions() extracts flags without running actions — this lets
  // us read --server-url to build the context before registerXxxCommands() runs.
  program.parseOptions(process.argv.slice(2));
  const { serverUrl } = program.opts<{ serverUrl?: string }>();

  // Build shared context once — reused by all commands in this invocation.
  const ctx = buildCliContext(serverUrl);

  // platform group
  const platform = program.command('platform').description('Manage Arch platform resources');
  registerPlatformCommands(platform, ctx);

  // debug group
  const debug = program.command('debug').description('Debug agent sessions and traces');
  registerDebugCommands(debug, ctx);

  // context group — manages .arch/state.json, no DebugContext needed
  registerContextCommands(program);

  await program.parseAsync(process.argv);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
