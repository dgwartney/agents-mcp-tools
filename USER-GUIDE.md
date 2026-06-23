# Arch CLI — User Guide

The `arch` CLI gives you direct shell access to the Arch Agent Platform without requiring an LLM. It follows AWS CLI conventions: `arch <group> <command> [flags]`.

---

## Installation

```bash
npm install -g @koredotcom/agents-mcp-tools   # install globally
arch --help                                    # verify
```

Or run without installing:

```bash
npx @koredotcom/agents-mcp-tools arch --help
```

---

## 1. Connect and Authenticate

Set your server URL once via environment variable:

```bash
export AGENTS_URL=https://agents.kore.ai
```

Then authenticate (opens browser on first run):

```bash
arch platform connect
```

On first run this opens your browser and waits for you to approve. Credentials are saved to `~/.config/kore-platform/credentials.json` for future sessions — you won't need to log in again until the token expires.

To connect to a different server for a single command:

```bash
arch platform connect --server-url https://agents-staging.kore.ai
arch --server-url https://agents-staging.kore.ai platform projects list
```

To force re-authentication:

```bash
arch platform connect --force
```

---

## 2. Set Your Working Context

Most commands need a `--project-id`. Set it once per project directory so you don't have to repeat it:

```bash
# Navigate to your project directory
cd my-agent-project

# Save default project ID (writes to .arch/state.json)
arch context set-project --project-id proj-abc123

# Verify
arch context show
```

Output:
```json
{
  "path": "/path/to/my-agent-project/.arch/state.json",
  "state": {
    "projectId": "proj-abc123"
  }
}
```

Now every command in this directory resolves `--project-id` automatically:

```bash
arch platform agents list          # no --project-id needed
arch platform versions list --agent-name booking-agent
arch debug traces
```

To set a **global** default (used when no project-local state exists):

```bash
arch context set-project --project-id proj-abc123 --global
```

To save the active debug session:

```bash
arch context set-session --session-id sess-xyz789
arch debug get-current-state       # uses saved session ID
arch debug get-errors              # same
```

To clear saved context:

```bash
arch context clear
```

---

## 3. Managing Projects

```bash
# List all projects
arch platform projects list

# Get project details
arch platform projects get --project-id proj-abc123

# Create a new project
arch platform projects create --name "Hotel Booking Agent" --description "Handles hotel reservations"

# Update project entry agent
arch platform projects update --project-id proj-abc123 --entry-agent-name booking_agent

# Delete a project (requires --confirm)
arch platform projects delete --project-id proj-abc123 --confirm
```

---

## 4. Managing Agents and Versions

```bash
# List agents in the current project
arch platform agents list

# Get agent DSL
arch platform agents get --agent-name booking_agent

# Update agent DSL from a file
arch platform agents save-dsl \
  --agent-name booking_agent \
  --dsl-content "$(cat booking_agent.abl)"

# List versions
arch platform versions list --agent-name booking_agent

# Create a new version
arch platform versions create \
  --agent-name booking_agent \
  --changelog "Fix RESPOND handling in finalize step"

# Promote version to production
arch platform versions promote \
  --agent-name booking_agent \
  --version 3 \
  --status production

# Diff two versions
arch platform versions diff \
  --agent-name booking_agent \
  --version 3 \
  --other-version 2
```

---

## 5. Managing Deployments

```bash
# List deployments
arch platform deployments list

# Create a deployment
arch platform deployments create \
  --environment production \
  --label "v3 release" \
  --entry-agent-name booking_agent \
  --agent-version-manifest '{"booking_agent": 3}'

# Retire a deployment
arch platform deployments retire \
  --deployment-id dep-abc \
  --confirm

# Rollback
arch platform deployments rollback \
  --deployment-id dep-abc \
  --confirm
```

---

## 6. Validating and Linting Local Packages

```bash
# Validate an ABL project folder
arch platform validate-package --path ./my-agent-project

# Show the compiler's parsed model
arch platform package-model --path ./my-agent-project

# Run lint checks
arch debug lint-abl --path ./my-agent-project
```

---

## 7. Debugging Sessions

```bash
# List active sessions on the server
arch debug list-active-sessions

# Save session to context
arch context set-session --session-id sess-xyz789

# Get current agent state
arch debug get-current-state

# Get span tree (execution flow)
arch debug get-span-tree

# Get span tree as flat list
arch debug get-span-tree --flat

# Get errors and warnings
arch debug get-errors --include-warnings

# Search trace events
arch debug traces --text "RESPOND" --limit 20
arch debug traces --types "DECISION,ERROR" --limit 50
arch debug traces --has-error

# Get flow graph as Mermaid diagram
arch debug get-flow-graph --format mermaid

# Explain a specific decision
arch debug explain-decision --event-id evt-abc123

# Full automated diagnosis
arch debug diagnose --depth deep

# Analyze session
arch debug analyze-session

# Diagnostic layer (root-cause grouping)
arch debug diagnostic-layer
```

---

## 8. Evaluations

```bash
# List personas
arch platform evals personas list

# Create a scenario
arch platform evals scenarios create \
  --body '{"name":"Happy path booking","turns":[{"user":"Book a hotel in NYC"}]}'

# List eval runs
arch platform evals runs list

# Start a run
arch platform evals runs start --run-id run-abc123

# Check run status
arch platform evals runs status --run-id run-abc123

# Compare two runs
arch platform evals runs compare --run-ids run-abc,run-def
```

---

## 9. Import / Export Projects

```bash
# Preview what an export would include
arch platform import-export export-preview

# Export project to a directory
arch platform import-export export --path ./export-output

# Preview an import (dry run)
arch platform import-export import-preview --path ./export-output

# Apply the import
arch platform import-export import \
  --path ./export-output \
  --confirm
```

---

## 10. Output and Scripting

All commands output pretty-printed JSON to stdout. Use `jq` to extract fields:

```bash
# Get just the project IDs
arch platform projects list | jq '.[].id'

# Get the latest version number for an agent
arch platform versions list --agent-name booking_agent | jq 'max_by(.version).version'

# Check if any errors exist (exit code 1 on {"success":false})
arch debug get-errors && echo "No errors" || echo "Errors found"
```

---

## Tips

| Tip | Command |
|---|---|
| Check all available commands | `arch --help` |
| Check options for a command | `arch platform projects --help` |
| Override server URL for one command | `arch --server-url https://agents-staging.kore.ai platform projects list` |
| Use staging vs production | Set `AGENTS_URL` per shell session |
| See which state file is active | `arch context show` |
| Use global context on a shared server | `arch context set-project --project-id <id> --global` |

---

## Environment Variables

| Variable | Description |
|---|---|
| `AGENTS_URL` | Default server URL (e.g. `https://agents.kore.ai`) |
| `HARNESS_API_KEY` | Required for `arch debug harness-logs` |
| `XDG_CONFIG_HOME` | Override config directory (default: `~/.config`) |

---

## Context State Files

| Location | Scope | Created by |
|---|---|---|
| `.arch/state.json` | Project-local (gitignored) | `arch context set-project` |
| `~/.config/kore-platform/cli-state.json` | Global user | `arch context set-project --global` |
| `~/.config/kore-platform/credentials.json` | Auth credentials | `arch platform connect` |
