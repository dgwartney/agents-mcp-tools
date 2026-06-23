# Arch CLI — User Guide

The `agentcl` CLI gives you direct shell access to the Arch Agent Platform without requiring an LLM. It follows AWS CLI conventions: `agentcl <group> <command> [flags]`.

---

## Installation

The `agentcl` CLI is built from source and installed globally via `npm link`:

```bash
git clone git@github.com:dgwartney/agents-mcp-tools.git
cd agents-mcp-tools
npm install
npm run build
npm link
```

`npm link` registers the compiled binary as a global command. Verify it works:

```bash
agentcl --help
```

**To update** when the repo changes:

```bash
cd agents-mcp-tools
git pull
npm run build   # npm link only needs to run once
```

---

## 1. Connect and Authenticate

Pass the server URL once with `--server-url` — it is saved to `.arch/state.json` so every subsequent command in this directory knows where to connect:

```bash
agentcl platform connect --server-url https://agents.kore.ai
```

Your browser opens automatically on the first run. After approving, two files are written to `.arch/` in the current directory (gitignored):

- `.arch/credentials.json` — your auth token
- `.arch/state.json` — the server URL and the workspace (tenant) the token is scoped to

All subsequent commands work with no flags or environment variables.

To connect to a staging environment from a different project directory:

```bash
cd ~/projects/my-staging-project
agentcl platform connect --server-url https://agents-staging.kore.ai
```

To force fresh browser authentication (clears stored credentials):

```bash
agentcl platform connect --force
```

> **`AGENTS_URL` environment variable** is still supported as an alternative to `--server-url` and takes precedence over the saved state. Useful in CI pipelines: `AGENTS_URL=https://agents.kore.ai agentcl platform projects list`.

---

## 2. Set Your Working Context

After connecting, run `agentcl context show` to see everything that's been saved:

```bash
agentcl context show
```

```json
{
  "path": "/path/to/my-agent-project/.arch/state.json",
  "state": {
    "serverUrl": "https://agents.kore.ai",
    "tenantId": "019e6686-...",
    "workspaceName": "my-workspace"
  }
}
```

`tenantId` and `workspaceName` are saved automatically on `platform connect` (decoded from the JWT). To also save a default project ID — so commands don't need `--project-id` — either use the flag at creation time or set it manually:

```bash
# Save when creating a project
agentcl platform projects create --name "My Agent" --save-context

# Or set manually after the fact
agentcl context set-project --project-id proj-abc123
```

Now every command in this directory resolves `--project-id` automatically:

```bash
agentcl platform agents list          # no --project-id needed
agentcl platform versions list --agent-name booking-agent
agentcl debug traces
```

To save the active debug session:

```bash
agentcl context set-session --session-id sess-xyz789
agentcl debug get-current-state       # uses saved session ID
agentcl debug get-errors              # same
```

To manually set the workspace (e.g. after switching):

```bash
agentcl platform workspaces switch --tenant-id tenant-xyz
# workspace is saved automatically, or set manually:
agentcl context set-workspace --tenant-id tenant-xyz --workspace-name "My Workspace"
```

To set a **global** default (used when no project-local state exists):

```bash
agentcl context set-project --project-id proj-abc123 --global
```

To clear all saved context:

```bash
agentcl context clear
```

---

## 3. Managing Projects

```bash
# List all projects
agentcl platform projects list

# Get project details
agentcl platform projects get --project-id proj-abc123

# Create a new project
agentcl platform projects create --name "Hotel Booking Agent" --description "Handles hotel reservations"

# Update project entry agent
agentcl platform projects update --project-id proj-abc123 --entry-agent-name booking_agent

# Delete a project (requires --confirm)
agentcl platform projects delete --project-id proj-abc123 --confirm
```

---

## 4. Managing Agents and Versions

```bash
# List agents in the current project
agentcl platform agents list

# Get agent DSL
agentcl platform agents get --agent-name booking_agent

# Update agent DSL from a file
agentcl platform agents save-dsl \
  --agent-name booking_agent \
  --dsl-content "$(cat booking_agent.abl)"

# List versions
agentcl platform versions list --agent-name booking_agent

# Create a new version
agentcl platform versions create \
  --agent-name booking_agent \
  --changelog "Fix RESPOND handling in finalize step"

# Promote version to production
agentcl platform versions promote \
  --agent-name booking_agent \
  --version 3 \
  --status production

# Diff two versions
agentcl platform versions diff \
  --agent-name booking_agent \
  --version 3 \
  --other-version 2
```

---

## 5. Managing Deployments

```bash
# List deployments
agentcl platform deployments list

# Create a deployment
agentcl platform deployments create \
  --environment production \
  --label "v3 release" \
  --entry-agent-name booking_agent \
  --agent-version-manifest '{"booking_agent": 3}'

# Retire a deployment
agentcl platform deployments retire \
  --deployment-id dep-abc \
  --confirm

# Rollback
agentcl platform deployments rollback \
  --deployment-id dep-abc \
  --confirm
```

---

## 6. Validating and Linting Local Packages

```bash
# Validate an ABL project folder
agentcl platform validate-package --path ./my-agent-project

# Show the compiler's parsed model
agentcl platform package-model --path ./my-agent-project

# Run lint checks
agentcl debug lint-abl --path ./my-agent-project
```

---

## 7. Debugging Sessions

```bash
# List active sessions on the server
agentcl debug list-active-sessions

# Save session to context
agentcl context set-session --session-id sess-xyz789

# Get current agent state
agentcl debug get-current-state

# Get span tree (execution flow)
agentcl debug get-span-tree

# Get span tree as flat list
agentcl debug get-span-tree --flat

# Get errors and warnings
agentcl debug get-errors --include-warnings

# Search trace events
agentcl debug traces --text "RESPOND" --limit 20
agentcl debug traces --types "DECISION,ERROR" --limit 50
agentcl debug traces --has-error

# Get flow graph as Mermaid diagram
agentcl debug get-flow-graph --format mermaid

# Explain a specific decision
agentcl debug explain-decision --event-id evt-abc123

# Full automated diagnosis
agentcl debug diagnose --depth deep

# Analyze session
agentcl debug analyze-session

# Diagnostic layer (root-cause grouping)
agentcl debug diagnostic-layer
```

---

## 8. Evaluations

```bash
# List personas
agentcl platform evals personas list

# Create a scenario
agentcl platform evals scenarios create \
  --body '{"name":"Happy path booking","turns":[{"user":"Book a hotel in NYC"}]}'

# List eval runs
agentcl platform evals runs list

# Start a run
agentcl platform evals runs start --run-id run-abc123

# Check run status
agentcl platform evals runs status --run-id run-abc123

# Compare two runs
agentcl platform evals runs compare --run-ids run-abc,run-def
```

---

## 9. Import / Export Projects

```bash
# Preview what an export would include
agentcl platform import-export export-preview

# Export project to a directory
agentcl platform import-export export --path ./export-output

# Preview an import (dry run)
agentcl platform import-export import-preview --path ./export-output

# Apply the import
agentcl platform import-export import \
  --path ./export-output \
  --confirm
```

---

## 10. Output and Scripting

All commands output pretty-printed JSON to stdout. Use `jq` to extract fields:

```bash
# Get just the project IDs
agentcl platform projects list | jq '.[].id'

# Get the latest version number for an agent
agentcl platform versions list --agent-name booking_agent | jq 'max_by(.version).version'

# Check if any errors exist (exit code 1 on {"success":false})
agentcl debug get-errors && echo "No errors" || echo "Errors found"
```

---

## Tips

| Tip | Command |
|---|---|
| Check all available commands | `agentcl --help` |
| Check options for a command | `agentcl platform projects --help` |
| Override server URL for one command | `agentcl --server-url https://agents-staging.kore.ai platform projects list` |
| Use staging vs production | Run `agentcl platform connect --server-url <url>` once per project directory |
| See which state file is active | `agentcl context show` |
| Use global context on a shared server | `agentcl context set-project --project-id <id> --global` |

---

## Environment Variables

| Variable | Description |
|---|---|
| `AGENTS_URL` | Default server URL (e.g. `https://agents.kore.ai`) |
| `HARNESS_API_KEY` | Required for `agentcl debug harness-logs` |
| `XDG_CONFIG_HOME` | Override config directory (default: `~/.config`) |

---

## Context State Files

| Location | Contents | Created by |
|---|---|---|
| `.arch/state.json` | `serverUrl`, `tenantId`, `workspaceName`, `projectId`, `sessionId` | `agentcl platform connect`, workspace/project commands |
| `.arch/credentials.json` | Auth token, expiry, email | `agentcl platform connect` |
| `~/.config/kore-platform/cli-state.json` | Global `projectId`/`sessionId` fallback | `agentcl context set-project --global` |
| `~/.config/kore-platform/credentials.json` | Global credential fallback | Legacy / prior versions |

Both `.arch/` files are gitignored. Each project directory has its own set, enabling different server URLs, workspaces, and credentials per project.

**What saves what automatically:**

| Command | Saves to state |
|---|---|
| `agentcl platform connect` | `serverUrl`, `tenantId` (from JWT) |
| `agentcl platform workspaces current` | `tenantId`, `workspaceName` |
| `agentcl platform workspaces switch` | `tenantId`, `workspaceName` |
| `agentcl platform projects create --save-context` | `projectId` |
| `agentcl context set-project` | `projectId` |
| `agentcl context set-session` | `sessionId` |
| `agentcl context set-workspace` | `tenantId`, `workspaceName` |
