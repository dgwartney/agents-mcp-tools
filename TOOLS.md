# Arch MCP Tools Reference

Complete reference for all 39 tools exposed by the Arch MCP server and `agentcl` CLI.

**Authentication:** All tools require connection to the Arch platform. Set `AGENTS_URL` env var or use `--server-url` flag.

---

## Platform Tools

### platform_connect
Connect to the server and authenticate. Auth cascade: explicit token → stored credentials → device auth (browser).

**CLI:** `agentcl platform connect [--server-url <url>] [--auth-token <token>] [--force] [--device-code <code>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| serverUrl | string | No | Server URL (or set AGENTS_URL) |
| authToken | string | No | Explicit JWT token |
| force | boolean | No | Force disconnect and reconnect |
| deviceCode | string | No | Device code from prior auth initiation |

---

### platform_projects
Manage projects on the platform.

**CLI:** `agentcl platform projects <list|get|create|update|delete> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| list | — | — |
| get | `--project-id` | — |
| create | `--name` | `--description` |
| update | `--project-id` | `--name`, `--description`, `--entry-agent-name` |
| delete | `--project-id` | `--confirm` (destructive, must be `true`) |

---

### platform_agents
Manage agents within a project.

**CLI:** `agentcl platform agents <list|get|save-dsl> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| list | `--project-id` | — |
| get | `--project-id`, `--agent-name` | — |
| save-dsl | `--project-id`, `--agent-name`, `--dsl-content` | — |

---

### platform_versions
Manage agent versions.

**CLI:** `agentcl platform versions <list|create|get|promote|diff> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| list | `--project-id`, `--agent-name` | — |
| create | `--project-id`, `--agent-name` | `--changelog` |
| get | `--project-id`, `--agent-name`, `--version` | — |
| promote | `--project-id`, `--agent-name`, `--version`, `--status` | — |
| diff | `--project-id`, `--agent-name`, `--version`, `--other-version` | — |

---

### platform_deployments
Manage deployments.

**CLI:** `agentcl platform deployments <list|create|get|retire|rollback> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| list | `--project-id` | — |
| create | `--project-id` | `--label`, `--environment`, `--entry-agent-name`, `--agent-version-manifest` |
| get | `--project-id`, `--deployment-id` | — |
| retire | `--project-id`, `--deployment-id` | `--confirm` |
| rollback | `--project-id`, `--deployment-id` | `--confirm` |

---

### platform_tools
Manage tools within a project.

**CLI:** `agentcl platform tools <list|get|create|update|delete|test> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| list | `--project-id` | — |
| get | `--project-id`, `--tool-id` | — |
| create | `--project-id`, `--name`, `--type`, `--definition` | — |
| update | `--project-id`, `--tool-id` | `--name`, `--definition` |
| delete | `--project-id`, `--tool-id` | `--confirm` |
| test | `--project-id`, `--tool-id` | — |

---

### platform_config
Manage project configuration and LLM settings.

**CLI:** `agentcl platform config <get-settings|update-settings|get-llm-config|update-llm-config> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| get-settings | `--project-id` | — |
| update-settings | `--project-id`, `--settings` (JSON) | — |
| get-llm-config | `--project-id` | — |
| update-llm-config | `--project-id`, `--settings` (JSON) | — |

---

### platform_workspaces
Manage workspaces (tenants).

**CLI:** `agentcl platform workspaces <list|current|switch> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| list | — | — |
| current | — | — |
| switch | `--tenant-id` | — |

---

### platform_import_export
Import and export projects.

**CLI:** `agentcl platform import-export <export-preview|export|import-preview|import> [flags]`

**Actions & required flags:**
| Action | Required flags | Optional flags |
|---|---|---|
| export-preview | `--project-id` | — |
| export | `--project-id` | `--path` |
| import-preview | `--project-id` | `--path` |
| import | `--project-id` | `--path`, `--confirm`, `--preview-digest`, `--data` (JSON) |

---

### platform_validate_package
Validate a local ABL project package using the platform compiler.

**CLI:** `agentcl platform validate-package [--path <path>] [--project-id <id>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| path | string | No | Local folder or .zip path |
| projectId | string | No | Project ID for context |

---

### platform_package_model
Show the platform compiler's parsed model for a local package.

**CLI:** `agentcl platform package-model [--path <path>] [--project-id <id>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| path | string | No | Local folder or .zip path |
| projectId | string | No | Project ID for context |

---

### platform_eval_personas
Manage eval personas.

**CLI:** `agentcl platform evals personas <list|get|create|update|delete|templates|generate> [flags]`

**Parameters:** `--project-id` (required), `--persona-id` (for get/update/delete), `--body <json>` (for create/update/generate), `--confirm` (for delete)

---

### platform_eval_scenarios
Manage eval scenarios.

**CLI:** `agentcl platform evals scenarios <list|get|create|update|delete|generate> [flags]`

**Parameters:** `--project-id` (required), `--scenario-id` (for get/update/delete), `--body <json>` (for create/update/generate), `--confirm` (for delete)

---

### platform_eval_evaluators
Manage eval evaluators.

**CLI:** `agentcl platform evals evaluators <list|get|create|update|delete|templates> [flags]`

**Parameters:** `--project-id` (required), `--evaluator-id` (for get/update/delete), `--body <json>` (for create/update), `--confirm` (for delete)

---

### platform_eval_sets
Manage eval sets.

**CLI:** `agentcl platform evals sets <list|get|create|update|delete> [flags]`

**Parameters:** `--project-id` (required), `--set-id` (for get/update/delete), `--body <json>` (for create/update)

---

### platform_eval_runs
Manage eval runs.

**CLI:** `agentcl platform evals runs <list|get|create|update|start|cancel|status|heatmap|cases|compare|preflight|quick> [flags]`

**Parameters:** `--project-id` (required), `--run-id` (for single-run actions), `--run-ids <id1,id2>` (for compare), `--body <json>` (for create/update/quick)

---

## Debug Tools

### debug_list_agents
List all available agents from the server.

**CLI:** `agentcl debug list-agents [--domain <domain>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| domain | string | No | Filter by domain |

---

### debug_load_agent
Load an agent and create a debug session.

**CLI:** `agentcl debug load-agent --agent-path <domain/name> --project-id <id>`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| agentPath | string | Yes | Format: "domain/name" |
| projectId | string | Yes | Project ID |

---

### debug_send_message
Send a message to the loaded agent.

**CLI:** `agentcl debug send-message --text <text> [--session-id <id>] [--wait-for-response] [--timeout <ms>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| text | string | Yes | Message text |
| sessionId | string | No | Target session |
| waitForResponse | boolean | No | Wait for agent response (default: true) |
| timeout | number | No | Timeout ms (default: 60000) |

---

### debug_traces
Get and search trace events.

**CLI:** `agentcl debug traces [--text <text>] [--types <t1,t2>] [--agent-name <name>] [--has-error] [--session-id <id>] [--project-id <id>] [--limit <n>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| text | string | No | Text filter |
| types | string[] | No | Event type filter (comma-separated in CLI) |
| agentName | string | No | Agent name filter |
| hasError | boolean | No | Filter to error events |
| sessionId | string | No | Session ID |
| projectId | string | No | Project ID for REST-based lookup |
| limit | number | No | Max events (default: 50) |

---

### debug_get_current_state
Get current agent state.

**CLI:** `agentcl debug get-current-state [--session-id <id>] [--project-id <id>]`

---

### debug_get_span_tree
Get hierarchical span tree showing execution flow.

**CLI:** `agentcl debug get-span-tree [--session-id <id>] [--project-id <id>] [--flat]`

---

### debug_get_errors
Get all errors and warnings from the session.

**CLI:** `agentcl debug get-errors [--session-id <id>] [--project-id <id>] [--include-warnings]`

---

### debug_explain_decision
Get detailed explanation of a decision event.

**CLI:** `agentcl debug explain-decision [--event-id <id>] [--session-id <id>] [--project-id <id>] [--last-n <n>] [--turn <n>] [--type <type>]`

---

### debug_get_flow_graph
Get the execution graph for an agent.

**CLI:** `agentcl debug get-flow-graph [--session-id <id>] [--project-id <id>] [--format json|mermaid] [--include-app-graph]`

---

### debug_list_active_sessions
List all active sessions on the server.

**CLI:** `agentcl debug list-active-sessions`

---

### debug_session
Subscribe to or unsubscribe from a session's trace events.

**CLI:** `agentcl debug session <subscribe|unsubscribe> --session-id <id>`

---

### debug_docs
Get or search Agent ABL documentation.

**CLI:** `agentcl debug docs [--topic <topic>] [--query <query>]`

---

### debug_analyze_session
Get automated analysis and diagnostics for a session.

**CLI:** `agentcl debug analyze-session [--session-id <id>] [--project-id <id>]`

---

### debug_diagnostic_layer
Build layered causal diagnostic view for a session.

**CLI:** `agentcl debug diagnostic-layer [--session-id <id>] [--project-id <id>] [--trace-limit <n>]`

---

### debug_get_trace_event
Fetch one trace event by ID.

**CLI:** `agentcl debug get-trace-event --event-id <id> [--session-id <id>] [--project-id <id>] [--trace-limit <n>] [--include-data] [--include-nearby]`

---

### debug_explain_trace_event
Explain one trace event.

**CLI:** `agentcl debug explain-trace-event --event-id <id> [--session-id <id>] [--project-id <id>] [--trace-limit <n>]`

---

### debug_model_interactions
Summarize model-provider interactions for a session.

**CLI:** `agentcl debug model-interactions [--session-id <id>] [--project-id <id>] [--trace-limit <n>] [--include-timeline]`

---

### debug_realtime_interactions
Summarize realtime voice/model provider interactions.

**CLI:** `agentcl debug realtime-interactions [--session-id <id>] [--project-id <id>] [--trace-limit <n>] [--include-timeline]`

---

### debug_harness_logs
Download and parse Harness CI execution logs. Requires `HARNESS_API_KEY` env var.

**CLI:** `agentcl debug harness-logs --execution-id <id> --run-sequence <n> --stage-id <id> --step-id <id> [--pipeline-id <id>] [--filter <regex>] [--tail <n>]`

**Parameters:**
| Parameter | Type | Required | Description |
|---|---|---|---|
| execution_id | string | Yes | Harness execution ID |
| run_sequence | number | Yes | Run sequence number |
| stage_id | string | Yes | Stage identifier |
| step_id | string | Yes | Step identifier |
| pipeline_id | string | No | Pipeline ID (default: ci_build) |
| filter | string | No | Regex filter for log lines |
| tail | number | No | Last N lines (default: 200) |

---

### debug_diagnose
Run full diagnostic analysis on an agent or session.

**CLI:** `agentcl debug diagnose [--session-id <id>] [--agent-name <name>] [--project-id <id>] [--depth quick|standard|deep] [--config-only]`

---

### debug_lint_abl
Run ABL design and repair lint checks.

**CLI:** `agentcl debug lint-abl [--path <path>]`

---

### debug_why_transcript_failed
Correlate transcript failures with ABL diagnoses.

**CLI:** `agentcl debug why-transcript-failed [--path <path>] [--transcript-path <path>]`

---

### debug_diagnose_transcript
Alias for `debug_why_transcript_failed`. Accepts identical parameters.

**CLI:** `agentcl debug why-transcript-failed` (CLI exposes this via the canonical command)

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `AGENTS_URL` | Default server URL | `https://agents.kore.ai` |
| `HARNESS_API_KEY` | Harness CI API key (for debug harness-logs) | — |

## Authentication

The `agentcl` CLI uses the same three-stage auth cascade as the MCP server:

1. **Explicit token** — pass `--auth-token <jwt>` to `agentcl platform connect`
2. **Stored credentials** — reads from `.arch/credentials.json` (in project directory)
3. **Device authorization** — opens browser automatically, polls until approved

Credentials are saved to `.arch/credentials.json` (in project directory) after successful device auth.
