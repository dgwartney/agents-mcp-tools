# @koredotcom/agents-mcp-tools

MCP tools for [Claude Code](https://claude.com/claude-code) to debug, manage, and interact with the [Kore.ai Agent Platform](https://agents.kore.ai).

## Install

```json
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
```

Add this to your project's `.mcp.json` or `~/.claude/settings.json`.

### Environment URLs

| Environment | URL                              |
| ----------- | -------------------------------- |
| Production  | `https://agents.kore.ai`         |
| Dev         | `https://agents-dev.kore.ai`     |
| Staging     | `https://agents-staging.kore.ai` |
| QA          | `https://agents-qa.kore.ai`      |
| Local       | `http://localhost:3112`          |

Set `AGENTS_URL` in the `env` block, or pass `serverUrl` directly to `platform_connect`.

## Tools (24)

### Connection

| Tool               | Description                                                                  |
| ------------------ | ---------------------------------------------------------------------------- |
| `platform_connect` | Connect and authenticate to the platform (stored credentials or device auth) |

### Platform Management

| Tool                     | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `platform_projects`      | Manage projects (list, get, create, delete)              |
| `platform_agents`        | Manage agents (list, get, save_dsl)                      |
| `platform_versions`      | Manage agent versions (list, create, get, promote, diff) |
| `platform_deployments`   | Manage deployments (list, create, get, retire, rollback) |
| `platform_tools`         | Manage tools (list, get, create, update, delete, test)   |
| `platform_import_export` | Import/export projects                                   |
| `platform_config`        | Manage project and LLM configuration                     |

### Debug

| Tool                         | Description                                        |
| ---------------------------- | -------------------------------------------------- |
| `debug_list_agents`          | List available agents by domain                    |
| `debug_load_agent`           | Load an agent and create a debug session           |
| `debug_send_message`         | Send a message to an agent                         |
| `debug_reset_session`        | Reset session (clear history)                      |
| `debug_get_current_state`    | Inspect agent context, gather progress, flow state |
| `debug_traces`               | Search trace events (type, text, agent, error)     |
| `debug_get_span_tree`        | View hierarchical execution flow                   |
| `debug_explain_decision`     | Explain agent decisions with context               |
| `debug_get_flow_graph`       | View state machine graph (JSON or Mermaid)         |
| `debug_get_errors`           | Get errors, warnings, and escalations              |
| `debug_diagnose`             | Diagnose agent config and execution issues         |
| `debug_analyze_session`      | Automated session diagnostics                      |
| `debug_list_active_sessions` | List observable sessions                           |
| `debug_session`              | Subscribe/unsubscribe to session traces            |

### Docs & CI

| Tool                 | Description                     |
| -------------------- | ------------------------------- |
| `debug_docs`         | Get or search ABL documentation |
| `debug_harness_logs` | Get Harness CI execution logs   |

## Authentication

Authentication is automatic when you call `platform_connect`:

1. **Explicit token** — pass `authToken` parameter
2. **Stored credentials** — reads `~/.config/kore-platform/credentials.json`
3. **Device auth** — returns a verification URL for browser approval, then call `platform_connect` again with the `deviceCode` to complete

## License

UNLICENSED
