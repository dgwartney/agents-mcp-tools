#!/usr/bin/env node
/**
 * MCP Debug Server CLI
 *
 * Usage: mcp-debug [options]
 *
 * Options:
 *   --server-url <url>   Runtime server URL (or set AGENTS_URL env var)
 *   --ws-url <url>       (Deprecated) WebSocket URL
 *   --http-url <url>     (Deprecated) HTTP API URL
 *   --help               Show help
 */

import { MCPDebugServer } from '../src/server.js';

function parseArgs(args: string[]): {
  serverUrl?: string;
  wsUrl?: string;
  httpUrl?: string;
  help?: boolean;
} {
  const result: { serverUrl?: string; wsUrl?: string; httpUrl?: string; help?: boolean } = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--server-url' && args[i + 1]) {
      result.serverUrl = args[++i];
    } else if (arg === '--ws-url' && args[i + 1]) {
      result.wsUrl = args[++i];
    } else if (arg === '--http-url' && args[i + 1]) {
      result.httpUrl = args[++i];
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Kore.ai Agent Platform — MCP Tools for Claude Code

Debug, manage, and interact with Agent Platform via Model Context Protocol.

Usage: agents-mcp-tools [options]

Options:
  --server-url <url>   Runtime server URL (or set AGENTS_URL env var)
  --help, -h           Show this help message

Environment Variables:
  AGENTS_URL           Default server URL when --server-url is not passed to platform_connect
                       Examples: https://agents.kore.ai        (production)
                                 https://agents-dev.kore.ai     (dev)
                                 https://agents-staging.kore.ai (staging)
                                 http://localhost:3112           (local)

Available MCP Tools (23):

  Debug Tools:
  platform_connect               Connect to server (auth is automatic)
  debug_list_agents           List available agents
  debug_load_agent            Load an agent and create debug session
  debug_send_message          Send a message to the agent
  debug_get_current_state     Get current agent state (live)
  debug_traces                Get/search trace events with filters
  debug_get_span_tree         Get hierarchical execution flow
  debug_explain_decision      Explain a decision with context
  debug_get_flow_graph        Get agent graph (JSON or Mermaid)
  debug_get_errors            Get categorized errors and warnings
  debug_diagnose              Diagnose agent config + execution (configOnly mode available)
  debug_analyze_session       Automated diagnostics with issue detection
  debug_list_active_sessions  List observable sessions
  debug_session               Subscribe/unsubscribe to session traces
  debug_docs                  Get or search ABL documentation
  debug_harness_logs          Get Harness CI execution logs

  Platform Management:
  platform_projects           Manage projects (list, get, create, delete)
  platform_agents             Manage agents (list, get, save_dsl)
  platform_versions           Manage agent versions (list, create, get, promote, diff)
  platform_deployments        Manage deployments (list, create, get, retire, rollback)
  platform_tools              Manage tools (list, get, create, update, delete, test)
  platform_import_export      Import/export projects (export_preview, export, import_preview, import)
  platform_config             Manage project config (get_settings, update_settings, get_llm_config, update_llm_config)

Claude Code Configuration:
  Add to your project's .mcp.json or ~/.claude/settings.json:
  {
    "mcpServers": {
      "agent-platform-debug": {
        "command": "npx",
        "args": ["@koredotcom/agents-mcp-tools"],
        "env": {
          "AGENTS_URL": "https://agents.kore.ai"
        }
      }
    }
  }
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const server = new MCPDebugServer({
    serverUrl: args.serverUrl,
    wsUrl: args.wsUrl,
    httpUrl: args.httpUrl,
  });

  // Handle shutdown
  process.on('SIGINT', async () => {
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.stop();
    process.exit(0);
  });

  // Start the server
  await server.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
