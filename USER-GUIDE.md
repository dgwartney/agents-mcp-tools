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

Set your server URL once via environment variable:

```bash
export AGENTS_URL=https://agents.kore.ai
```

Then authenticate (opens browser on first run):

```bash
agentcl platform connect
```

On first run this opens your browser and waits for you to approve. Credentials are saved to `.arch/credentials.json` (in project directory) for future sessions — you won't need to log in again until the token expires.

To connect to a different server for a single command:

```bash
agentcl platform connect --server-url https://agents-staging.kore.ai
agentcl --server-url https://agents-staging.kore.ai platform projects list
```

To force re-authentication:

```bash
agentcl platform connect --force
```

---

## 2. Set Your Working Context

Most commands need a `--project-id`. Set it once per project directory so you don't have to repeat it:

```bash
# Navigate to your project directory
cd my-agent-project

# Save default project ID (writes to .arch/state.json)
agentcl context set-project --project-id proj-abc123

# Verify
agentcl context show
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
agentcl platform agents list          # no --project-id needed
agentcl platform versions list --agent-name booking-agent
agentcl debug traces
```

To set a **global** default (used when no project-local state exists):

```bash
agentcl context set-project --project-id proj-abc123 --global
```

To save the active debug session:

```bash
agentcl context set-session --session-id sess-xyz789
agentcl debug get-current-state       # uses saved session ID
agentcl debug get-errors              # same
```

To clear saved context:

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
| Use staging vs production | Set `AGENTS_URL` per shell session |
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

| Location | Scope | Created by |
|---|---|---|
| `.arch/state.json` | Project-local (gitignored) | `agentcl context set-project` |
| `~/.config/kore-platform/cli-state.json` | Global user | `agentcl context set-project --global` |
| `.arch/credentials.json` (in project directory) | Auth credentials | `agentcl platform connect` |
