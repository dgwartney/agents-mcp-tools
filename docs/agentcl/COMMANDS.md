# agentcl Command Reference

Complete flat reference for all `agentcl` commands and options. Format: `agentcl <group> <command> [options]`.

**Global option (applies to all commands):**
```
--server-url <url>   Override server URL for this invocation only
```

---

## `agentcl chat`

Start an interactive REPL session with an agent.

```
agentcl chat [options]
```

| Option | Description |
|--------|-------------|
| `--agent-path <path>` | Agent path (`domain/name`) — loads a new session |
| `--project-id <id>` | Project ID (resolved from state if omitted) |

**REPL commands (type inside the session):**

| Command | Action |
|---------|--------|
| `/session` | Print the current session ID |
| `/help` | Show available slash commands |
| `/exit` | End the session |
| `/quit` | End the session |

**Notes:** Session ID is written to `.arch/state.json` on load. Run `agentcl chat` (no `--agent-path`) to resume the last session. Responses stream chunk-by-chunk.

---

## `agentcl init`

Scaffold a new agent project.

```
agentcl init [options]
```

| Option | Description |
|--------|-------------|
| `--bare` | Create directory structure and Makefile only — no `.abl` template files |
| `--platform` | Also authenticate, create platform project, and import tools interactively |

---

## `agentcl platform connect`

Authenticate with the platform and save credentials.

```
agentcl platform connect [options]
```

| Option | Description |
|--------|-------------|
| `--server-url <url>` | Platform URL — saved to `.arch/state.json` for reuse |
| `--auth-token <jwt>` | Explicit JWT (skips browser auth) |
| `--force` | Force fresh browser authentication |
| `--device-code <code>` | Resume interrupted device auth flow |

---

## `agentcl platform projects`

```
agentcl platform projects list
agentcl platform projects get         --project-id <id>
agentcl platform projects create      --name <name> [--description <text>] [--save-context]
agentcl platform projects update      --project-id <id> [--name <name>] [--description <text>] [--entry-agent-name <name>]
agentcl platform projects delete      --project-id <id> --confirm
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--name <name>` | Project name |
| `--description <text>` | Project description |
| `--save-context` | Write project ID to `.arch/state.json` after create |
| `--entry-agent-name <name>` | Entry agent for the project |
| `--confirm` | Required for destructive operations |

---

## `agentcl platform agents`

```
agentcl platform agents list
agentcl platform agents get           --agent-name <name>
agentcl platform agents save-dsl      --file <path>
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--agent-name <name>` | Agent name |
| `--file <path>` | Path to `.agent.abl` or `.supervisor.abl` file; resolves `file:` tool imports; agent name inferred from `AGENT:`/`SUPERVISOR:` declaration |

---

## `agentcl platform versions`

```
agentcl platform versions list        --agent-name <name>
agentcl platform versions create      --agent-name <name> [--changelog <text>]
agentcl platform versions get         --agent-name <name> --version <n>
agentcl platform versions promote     --agent-name <name> --version <n> --status <status>
agentcl platform versions diff        --agent-name <name> --version <n> --other-version <m>
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--agent-name <name>` | Agent name |
| `--version <n>` | Version number |
| `--other-version <m>` | Second version for diff |
| `--changelog <text>` | Changelog message for new version |
| `--status <status>` | Promotion target status (e.g. `production`) |

---

## `agentcl platform deployments`

```
agentcl platform deployments list
agentcl platform deployments create   --environment <env> --entry-agent-name <name> --agent-version-manifest <json> [--label <text>]
agentcl platform deployments get      --deployment-id <id>
agentcl platform deployments retire   --deployment-id <id> --confirm
agentcl platform deployments rollback --deployment-id <id> --confirm
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--deployment-id <id>` | Deployment ID |
| `--environment <env>` | Target environment (`staging`, `production`) |
| `--entry-agent-name <name>` | Entry agent for this deployment |
| `--agent-version-manifest <json>` | JSON map of agent name → version number |
| `--label <text>` | Deployment label |
| `--confirm` | Required for retire and rollback |

---

## `agentcl platform tools`

```
agentcl platform tools list
agentcl platform tools get            --tool-id <id>
agentcl platform tools create         --name <name> --type <type> --definition <json>
agentcl platform tools update         --tool-id <id> [--name <name>] [--definition <json>]
agentcl platform tools delete         --tool-id <id> --confirm
agentcl platform tools test           --tool-id <id>
agentcl platform tools import-abl     --file <path> [--dry-run]
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--tool-id <id>` | Tool ID |
| `--name <name>` | Tool name |
| `--type <type>` | Tool type |
| `--definition <json>` | Tool definition as JSON |
| `--file <path>` | Path to `.tools.abl` file for `import-abl` |
| `--dry-run` | Preview what `import-abl` would create/update without making changes |
| `--confirm` | Required for delete |

---

## `agentcl platform config`

```
agentcl platform config get-settings
agentcl platform config update-settings    --settings <json>
agentcl platform config get-llm-config
agentcl platform config update-llm-config  --settings <json>
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--settings <json>` | Settings as JSON object |

---

## `agentcl platform workspaces`

```
agentcl platform workspaces list
agentcl platform workspaces current
agentcl platform workspaces switch    --tenant-id <id>
```

| Option | Description |
|--------|-------------|
| `--tenant-id <id>` | Tenant ID to switch to |

**Note:** `current` and `switch` save `tenantId` and `workspaceName` to `.arch/state.json` automatically.

---

## `agentcl platform import-export`

```
agentcl platform import-export export-preview
agentcl platform import-export export          --path <dir>
agentcl platform import-export import-preview  --path <dir>
agentcl platform import-export import          --path <dir> --confirm [--preview-digest <digest>] [--data <json>]
```

| Option | Description |
|--------|-------------|
| `--project-id <id>` | Project ID (resolved from state if omitted) |
| `--path <dir>` | Directory to export to or import from |
| `--confirm` | Required for import |
| `--preview-digest <digest>` | Digest from import-preview for idempotent apply |
| `--data <json>` | Additional import options as JSON |

---

## `agentcl platform validate-package`

Validate a local ABL project folder against the platform compiler.

```
agentcl platform validate-package --path <dir> [--project-id <id>]
```

---

## `agentcl platform package-model`

Show the compiler-visible model for a local ABL project.

```
agentcl platform package-model --path <dir>
```

---

## `agentcl platform evals personas`

```
agentcl platform evals personas list
agentcl platform evals personas get       --persona-id <id>
agentcl platform evals personas create    --body <json>
agentcl platform evals personas update    --persona-id <id> --body <json>
agentcl platform evals personas delete    --persona-id <id> --confirm
agentcl platform evals personas generate  [--body <json>]
agentcl platform evals personas templates
```

---

## `agentcl platform evals scenarios`

```
agentcl platform evals scenarios list
agentcl platform evals scenarios get       --scenario-id <id>
agentcl platform evals scenarios create    --body <json>
agentcl platform evals scenarios update    --scenario-id <id> --body <json>
agentcl platform evals scenarios delete    --scenario-id <id> --confirm
agentcl platform evals scenarios generate  [--body <json>]
```

---

## `agentcl platform evals evaluators`

```
agentcl platform evals evaluators list
agentcl platform evals evaluators get       --evaluator-id <id>
agentcl platform evals evaluators create    --body <json>
agentcl platform evals evaluators update    --evaluator-id <id> --body <json>
agentcl platform evals evaluators delete    --evaluator-id <id> --confirm
agentcl platform evals evaluators templates
```

---

## `agentcl platform evals sets`

```
agentcl platform evals sets list
agentcl platform evals sets get     --set-id <id>
agentcl platform evals sets create  --body <json>
agentcl platform evals sets update  --set-id <id> --body <json>
agentcl platform evals sets delete  --set-id <id> --confirm
```

---

## `agentcl platform evals runs`

```
agentcl platform evals runs list
agentcl platform evals runs get       --run-id <id>
agentcl platform evals runs create    --body <json>
agentcl platform evals runs start     --run-id <id>
agentcl platform evals runs status    --run-id <id>
agentcl platform evals runs compare   --run-ids <id1,id2>
```

---

## `agentcl debug`

**Session setup:**

```
agentcl debug list-agents            [--domain <domain>]
agentcl debug load-agent             --agent-path <domain/name> [--project-id <id>]
agentcl debug send-message           --text <message> [--session-id <id>] [--no-wait] [--timeout <ms>]
agentcl debug list-active-sessions
agentcl debug session subscribe      [--session-id <id>]
agentcl debug session unsubscribe    [--session-id <id>]
```

| Option | Description |
|--------|-------------|
| `--agent-path <domain/name>` | Agent path, e.g. `default/supervisor` |
| `--text <message>` | Message to send |
| `--session-id <id>` | Session ID (resolved from state if omitted) |
| `--no-wait` | Send without waiting for response |
| `--timeout <ms>` | Response wait timeout in milliseconds |

**Notes:**
- `load-agent` and `send-message` auto-connect from stored credentials — no prior `platform connect` needed
- `load-agent` writes `sessionId` to `.arch/state.json` automatically

**Session inspection:**

```
agentcl debug get-current-state      [--session-id <id>] [--project-id <id>]
agentcl debug get-span-tree          [--session-id <id>] [--project-id <id>] [--flat]
agentcl debug get-errors             [--session-id <id>] [--project-id <id>] [--include-warnings]
agentcl debug get-flow-graph         [--session-id <id>] [--project-id <id>] [--format json|mermaid]
agentcl debug traces                 [--session-id <id>] [--project-id <id>] [--text <filter>] [--types <type,...>] [--agent-name <name>] [--has-error] [--limit <n>]
agentcl debug get-trace-event        --event-id <id> [--session-id <id>] [--project-id <id>] [--include-data] [--include-nearby]
agentcl debug explain-trace-event    --event-id <id> [--session-id <id>] [--project-id <id>]
agentcl debug explain-decision       [--event-id <id>] [--session-id <id>] [--project-id <id>] [--last-n <n>] [--turn <n>] [--type <type>]
agentcl debug model-interactions     [--session-id <id>] [--project-id <id>] [--include-timeline]
agentcl debug realtime-interactions  [--session-id <id>] [--project-id <id>] [--include-timeline]
```

**Diagnostics:**

```
agentcl debug diagnose               [--session-id <id>] [--project-id <id>] [--agent-name <name>] [--depth quick|standard|deep] [--config-only]
agentcl debug analyze-session        [--session-id <id>] [--project-id <id>]
agentcl debug diagnostic-layer       [--session-id <id>] [--project-id <id>] [--trace-limit <n>]
agentcl debug lint-abl               [--path <dir>]
agentcl debug why-transcript-failed  [--path <dir>] [--transcript-path <file>]
```

**Documentation:**

```
agentcl debug docs                   [--topic <id>] [--query <text>]
```

Run `agentcl debug docs` with no arguments to list all available topic IDs. Topics use slash-separated IDs (e.g. `abl-reference/multi-agent-and-supervisor`).

**CI logs:**

```
agentcl debug harness-logs           --execution-id <id> --run-sequence <n> --stage-id <id> --step-id <id> [--pipeline-id <id>] [--filter <regex>] [--tail <n>]
```

Requires `HARNESS_API_KEY` environment variable.

---

## `agentcl context`

```
agentcl context show              [--global]
agentcl context set-project       --project-id <id> [--global]
agentcl context set-session       --session-id <id> [--global]
agentcl context set-workspace     --tenant-id <id> [--workspace-name <name>] [--global]
agentcl context clear             [--global]
```

**State files:**

| File | Contents |
|------|----------|
| `.arch/state.json` | `serverUrl`, `tenantId`, `workspaceName`, `projectId`, `sessionId` |
| `.arch/credentials.json` | Auth token and expiry |
| `~/.config/kore-platform/cli-state.json` | Global fallback for `projectId`/`sessionId` |

**What writes state automatically:**

| Command | Fields written |
|---------|----------------|
| `platform connect` | `serverUrl`, `tenantId` |
| `platform workspaces current/switch` | `tenantId`, `workspaceName` |
| `platform projects create --save-context` | `projectId`, `projectName` |
| `debug load-agent` | `sessionId` |
| `chat --agent-path <path>` | `sessionId` |
