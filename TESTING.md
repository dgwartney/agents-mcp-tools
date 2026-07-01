# agentcl Manual Testing Guide

This document provides step-by-step examples for manually validating every `agentcl` capability. Work through sections in order — later sections depend on context (project ID, session ID) established by earlier ones.

---

## Prerequisites

```bash
# Install and link the CLI
npm install && npm run build && npm link

# Verify the CLI is available
agentcl --version
agentcl --help
```

**Expected:** version string and top-level help text listing all command groups.

---

## 1. `init` — Scaffold a New Project

### 1a. Full template (hotel booking example)

```bash
mkdir /tmp/test-hotel && cd /tmp/test-hotel
agentcl init
```

**At the prompts:**
- Project name: `Test Hotel Agent`
- Description: `Manual testing project`

**Expected files created:**
```
agents/hotel.supervisor.abl
agents/hotel_search.agent.abl
agents/hotel_booking.agent.abl
tools/hotels-api.tools.abl
Makefile
README.md
.gitignore
```
**Expected:** git repo initialised with an initial commit.

---

### 1b. Bare scaffold (no .abl files)

```bash
mkdir /tmp/test-bare && cd /tmp/test-bare
agentcl init --bare
```

**Expected:** `agents/`, `tools/` directories created; `Makefile`, `README.md`, `.gitignore` written; **no** `.abl` files.

---

### 1c. Full platform setup (requires platform access)

```bash
mkdir /tmp/test-platform && cd /tmp/test-platform
agentcl init --platform
```

**At the prompts:**
- Project name: `Test Platform Agent`
- Description: `Platform integration test`
- Platform URL: `https://agents.kore.ai` (or your instance URL)

**Expected:** browser opens for login; project created on platform; `.arch/state.json` written with `projectId`, `serverUrl`, `tenantId`.

---

## 2. `platform connect` — Authenticate

```bash
agentcl platform connect --server-url https://agents.kore.ai
```

**Expected:** browser opens (or device-code flow); JSON response `{ "success": true, "serverUrl": "..." }`; `.arch/state.json` updated with `serverUrl` and `tenantId`.

### Force reconnect

```bash
agentcl platform connect --server-url https://agents.kore.ai --force
```

**Expected:** discards existing token and re-authenticates.

---

## 3. `context` — Manage Saved State

### 3a. Show active context

```bash
agentcl context show
```

**Expected:** JSON with `path` (path to the active state file) and `state` (current values: `projectId`, `serverUrl`, etc.).

### 3b. Show global state file

```bash
agentcl context show --global
```

**Expected:** same output but `path` points to `~/.config/kore-platform/cli-state.json`.

### 3c. Set a default project

```bash
agentcl context set-project --project-id <your-project-id>
```

**Expected:** `Saved projectId="<id>" to .arch/state.json`

### 3d. Set a default session

```bash
agentcl context set-session --session-id <your-session-id>
```

**Expected:** `Saved sessionId="<id>" to .arch/state.json`

### 3e. Set a default workspace

```bash
agentcl context set-workspace --tenant-id <tenant-id> --workspace-name "My Workspace"
```

**Expected:** `Saved workspace "My Workspace" (<tenant-id>) to .arch/state.json`

### 3f. Write to global state

```bash
agentcl context set-project --project-id <id> --global
```

**Expected:** written to `~/.config/kore-platform/cli-state.json`.

### 3g. Clear context

```bash
agentcl context clear
```

**Expected:** `projectId`, `sessionId`, `tenantId`, `workspaceName` cleared from state file.

---

## 4. `platform workspaces` — Workspace Management

### 4a. List all workspaces

```bash
agentcl platform workspaces list
```

**Expected:** JSON array of workspaces the authenticated user has access to.

### 4b. Show current workspace

```bash
agentcl platform workspaces current
```

**Expected:** JSON with `tenantId`, `workspaceName`; context state updated with workspace info.

### 4c. Switch workspace

```bash
agentcl platform workspaces switch --tenant-id <other-tenant-id>
```

**Expected:** JSON confirming switch; `.arch/state.json` updated with new `tenantId`.

---

## 5. `platform projects` — Project Management

### 5a. List projects

```bash
agentcl platform projects list
```

**Expected:** JSON array of projects in the current workspace.

### 5b. Create a project

```bash
agentcl platform projects create --name "My Test Project" --description "Testing agentcl"
```

**Expected:** JSON with `project.id`; hint showing the `context set-project` command to save it.

### 5c. Create and auto-save context

```bash
agentcl platform projects create --name "My Test Project 2" --save-context
```

**Expected:** JSON with `contextSaved: true`; `.arch/state.json` updated with the new `projectId`.

### 5d. Get a project

```bash
agentcl platform projects get --project-id <id>
```

**Expected:** JSON with project details. Omitting `--project-id` reads from `.arch/state.json`.

### 5e. Update a project

```bash
agentcl platform projects update --project-id <id> --name "Updated Name" --description "New description"
```

**Expected:** JSON confirming update.

### 5f. Set entry agent

```bash
agentcl platform projects update --project-id <id> --entry-agent-name hotel_coordinator
```

**Expected:** JSON confirming update with `entryAgentName` set.

### 5g. Delete a project

```bash
agentcl platform projects delete --project-id <id> --confirm
```

**Expected:** JSON confirming deletion. Omitting `--confirm` should return an error or warning.

---

## 6. `platform agents` — Agent Management

### 6a. List agents

```bash
agentcl platform agents list --project-id <id>
```

**Expected:** JSON array of agents in the project.

### 6b. Get agent details

```bash
agentcl platform agents get --project-id <id> --agent-name hotel_search
```

**Expected:** JSON with agent definition details.

### 6c. Save agent DSL from file (recommended)

```bash
agentcl platform agents save-dsl --project-id <id> --file agents/hotel_search.agent.abl
```

**Expected:** JSON confirming save; agent name inferred from the `AGENT:` declaration in the file.

### 6d. Save agent DSL — name mismatch warning

```bash
agentcl platform agents save-dsl \
  --project-id <id> \
  --file agents/hotel_search.agent.abl \
  --agent-name wrong_name
```

**Expected:** warning printed `"--agent-name ... does not match DSL declaration ... Using ..."` and the DSL name is used.

### 6e. Save agent DSL from raw string

```bash
agentcl platform agents save-dsl \
  --project-id <id> \
  --agent-name my_agent \
  --dsl-content $'AGENT: my_agent\nVERSION: "1.0.0"\nGOAL: Test agent\n'
```

**Expected:** JSON confirming save.

---

## 7. `platform versions` — Version Management

### 7a. List versions

```bash
agentcl platform versions list --project-id <id> --agent-name hotel_search
```

**Expected:** JSON array of versions for the agent.

### 7b. Create a version

```bash
agentcl platform versions create \
  --project-id <id> \
  --agent-name hotel_search \
  --changelog "feat: initial version"
```

**Expected:** JSON with the new version number.

### 7c. Get a specific version

```bash
agentcl platform versions get \
  --project-id <id> \
  --agent-name hotel_search \
  --version 1
```

**Expected:** JSON with version details including DSL snapshot.

### 7d. Promote a version

```bash
agentcl platform versions promote \
  --project-id <id> \
  --agent-name hotel_search \
  --version 1 \
  --status published
```

**Expected:** JSON confirming the status change.

### 7e. Diff two versions

```bash
agentcl platform versions diff \
  --project-id <id> \
  --agent-name hotel_search \
  --version 1 \
  --other-version 2
```

**Expected:** JSON with a diff between the two versions.

---

## 8. `platform deployments` — Deployment Management

### 8a. List deployments

```bash
agentcl platform deployments list --project-id <id>
```

**Expected:** JSON array of deployments.

### 8b. Create a deployment

```bash
agentcl platform deployments create \
  --project-id <id> \
  --label "staging-v1" \
  --environment staging \
  --entry-agent-name hotel_coordinator \
  --agent-version-manifest '{"hotel_coordinator":"1.0.0","hotel_search":"1.0.0","hotel_booking":"1.0.0"}'
```

**Expected:** JSON with `deploymentId` and deployment status.

### 8c. Get a deployment

```bash
agentcl platform deployments get \
  --project-id <id> \
  --deployment-id <deployment-id>
```

**Expected:** JSON with full deployment details.

### 8d. Rollback a deployment

```bash
agentcl platform deployments rollback \
  --project-id <id> \
  --deployment-id <deployment-id> \
  --confirm
```

**Expected:** JSON confirming rollback initiated.

### 8e. Retire a deployment

```bash
agentcl platform deployments retire \
  --project-id <id> \
  --deployment-id <deployment-id> \
  --confirm
```

**Expected:** JSON confirming the deployment is retired.

---

## 9. `platform tools` — Tool Library Management

### 9a. List tools

```bash
agentcl platform tools list --project-id <id>
```

**Expected:** JSON array of tools in the project's Tool Library.

### 9b. Create a tool

```bash
agentcl platform tools create \
  --project-id <id> \
  --name search_hotels \
  --type http \
  --definition '{"toolType":"http","description":"Search hotels","endpoint":"https://api.example.com/search","method":"POST"}'
```

**Expected:** JSON with the new `toolId`.

### 9c. Get a tool

```bash
agentcl platform tools get --project-id <id> --tool-id <tool-id>
```

**Expected:** JSON with full tool definition.

### 9d. Update a tool

```bash
agentcl platform tools update \
  --project-id <id> \
  --tool-id <tool-id> \
  --name search_hotels_v2 \
  --definition '{"toolType":"http","description":"Search hotels v2","endpoint":"https://api.example.com/v2/search","method":"POST"}'
```

**Expected:** JSON confirming update.

### 9e. Test a tool

```bash
agentcl platform tools test --project-id <id> --tool-id <tool-id>
```

**Expected:** JSON with test invocation result.

### 9f. Import tools from a .tools.abl file

```bash
agentcl platform tools import-abl \
  --project-id <id> \
  --file tools/hotels-api.tools.abl
```

**Expected:** JSON with `tools` array showing each tool's name and `created` or `updated` action.

### 9g. Dry-run import

```bash
agentcl platform tools import-abl \
  --project-id <id> \
  --file tools/hotels-api.tools.abl \
  --dry-run
```

**Expected:** JSON with `dryRun: true` and `wouldCreate` listing tool names — no actual API calls made.

### 9h. Delete a tool

```bash
agentcl platform tools delete \
  --project-id <id> \
  --tool-id <tool-id> \
  --confirm
```

**Expected:** JSON confirming deletion.

---

## 10. `platform config` — Project Configuration

### 10a. Get project settings

```bash
agentcl platform config get-settings --project-id <id>
```

**Expected:** JSON with current project settings.

### 10b. Update project settings

```bash
agentcl platform config update-settings \
  --project-id <id> \
  --settings '{"timeoutMs":30000}'
```

**Expected:** JSON confirming update.

### 10c. Get LLM configuration

```bash
agentcl platform config get-llm-config --project-id <id>
```

**Expected:** JSON with current LLM configuration (model, temperature, etc.).

### 10d. Update LLM configuration

```bash
agentcl platform config update-llm-config \
  --project-id <id> \
  --settings '{"model":"gpt-4o","temperature":0.7}'
```

**Expected:** JSON confirming update.

---

## 11. `platform import-export` — Project Portability

### 11a. Preview export

```bash
agentcl platform import-export export-preview --project-id <id>
```

**Expected:** JSON describing what would be included in the export (agents, tools, versions).

### 11b. Export to stdout

```bash
agentcl platform import-export export --project-id <id>
```

**Expected:** JSON export envelope with `data.files` map.

### 11c. Export to a directory

```bash
agentcl platform import-export export --project-id <id> --path /tmp/export-test
```

**Expected:** files written to `/tmp/export-test/`; JSON response shows `writtenTo` and `fileCount` instead of file contents.

### 11d. Preview import

```bash
agentcl platform import-export import-preview \
  --project-id <id> \
  --path /tmp/export-test
```

**Expected:** JSON dry-run summary of what would be imported.

### 11e. Import

```bash
agentcl platform import-export import \
  --project-id <id> \
  --path /tmp/export-test \
  --confirm
```

**Expected:** JSON confirming import.

---

## 12. `platform validate-package` — Package Validation

```bash
agentcl platform validate-package --path . --project-id <id>
```

**Expected:** JSON with validation results — errors/warnings about the ABL files in the current directory.

### Validate a zip archive

```bash
zip -r /tmp/my-project.zip agents/ tools/
agentcl platform validate-package --path /tmp/my-project.zip --project-id <id>
```

**Expected:** same validation results from the zip.

---

## 13. `platform package-model` — Compiler Model

```bash
agentcl platform package-model --path .
```

**Expected:** JSON with the compiler's internal model for the local package (useful for debugging ABL parsing).

---

## 14. `platform evals` — Evaluations

### 14a. Personas

```bash
# List
agentcl platform evals personas list --project-id <id>

# List templates
agentcl platform evals personas templates --project-id <id>

# Generate from a template
agentcl platform evals personas generate \
  --project-id <id> \
  --body '{"templateId":"<template-id>","count":3}'

# Create manually
agentcl platform evals personas create \
  --project-id <id> \
  --body '{"name":"Impatient Traveler","description":"User who wants quick answers"}'

# Get by ID
agentcl platform evals personas get --project-id <id> --persona-id <id>

# Update
agentcl platform evals personas update \
  --project-id <id> \
  --persona-id <id> \
  --body '{"name":"Updated Persona"}'

# Delete
agentcl platform evals personas delete --project-id <id> --persona-id <id> --confirm
```

### 14b. Scenarios

```bash
# List
agentcl platform evals scenarios list --project-id <id>

# Generate
agentcl platform evals scenarios generate \
  --project-id <id> \
  --body '{"agentName":"hotel_search","count":5}'

# Create manually
agentcl platform evals scenarios create \
  --project-id <id> \
  --body '{"name":"Search by city","utterances":["Find a hotel in Paris"]}'

# Get / Update / Delete (same pattern as personas)
agentcl platform evals scenarios get --project-id <id> --scenario-id <id>
agentcl platform evals scenarios update --project-id <id> --scenario-id <id> --body '{...}'
agentcl platform evals scenarios delete --project-id <id> --scenario-id <id> --confirm
```

### 14c. Evaluators

```bash
# List evaluators and templates
agentcl platform evals evaluators list --project-id <id>
agentcl platform evals evaluators templates --project-id <id>

# Create / Get / Update / Delete (same pattern)
agentcl platform evals evaluators create \
  --project-id <id> \
  --body '{"name":"Helpfulness","criteria":"Was the response helpful?"}'
```

### 14d. Eval Sets

```bash
agentcl platform evals sets list --project-id <id>

agentcl platform evals sets create \
  --project-id <id> \
  --body '{"name":"Smoke Test","scenarioIds":["<s1>","<s2>"],"personaIds":["<p1>"]}'

agentcl platform evals sets get --project-id <id> --set-id <id>
agentcl platform evals sets delete --project-id <id> --set-id <id> --confirm
```

### 14e. Eval Runs

```bash
# List
agentcl platform evals runs list --project-id <id>

# Create a run
agentcl platform evals runs create \
  --project-id <id> \
  --body '{"setId":"<set-id>","deploymentId":"<deployment-id>"}'

# Start
agentcl platform evals runs start --project-id <id> --run-id <id>

# Status
agentcl platform evals runs status --project-id <id> --run-id <id>

# Heatmap
agentcl platform evals runs heatmap --project-id <id> --run-id <id>

# Cases (individual conversation results)
agentcl platform evals runs cases --project-id <id> --run-id <id>

# Compare two runs
agentcl platform evals runs compare \
  --project-id <id> \
  --run-ids <run-id-1>,<run-id-2>

# Cancel
agentcl platform evals runs cancel --project-id <id> --run-id <id>

# Preflight check
agentcl platform evals runs preflight --project-id <id>

# Quick run (combined create + start)
agentcl platform evals runs quick \
  --project-id <id> \
  --body '{"setId":"<set-id>","deploymentId":"<deployment-id>"}'
```

---

## 15. `debug` — Session Debugging

### 15a. List available agents

```bash
agentcl debug list-agents
agentcl debug list-agents --domain hotel
```

**Expected:** JSON array of available agents; filtered by domain when `--domain` is provided.

### 15b. Load an agent (start a debug session)

```bash
agentcl debug load-agent --agent-path hotel/hotel_coordinator --project-id <id>
```

**Expected:** JSON with `sessionId`; save it for subsequent debug commands:

```bash
agentcl context set-session --session-id <session-id>
```

### 15c. Send a message

```bash
agentcl debug send-message --text "Find me a hotel in Paris"
```

**Expected:** JSON with the agent's response. Uses `sessionId` from context.

### Explicit session and options

```bash
agentcl debug send-message \
  --text "Find me a hotel in Paris" \
  --session-id <session-id> \
  --timeout 30000
```

### Fire-and-forget (no wait)

```bash
agentcl debug send-message --text "Hello" --no-wait
```

**Expected:** returns immediately without waiting for the agent's response.

### 15d. Get traces

```bash
agentcl debug traces --session-id <id>
```

```bash
# Filter by event type
agentcl debug traces --types DECISION,TOOL_CALL --limit 20

# Filter by agent name
agentcl debug traces --agent-name hotel_search

# Filter to errors only
agentcl debug traces --has-error

# Text search
agentcl debug traces --text "book_hotel"
```

**Expected:** JSON array of trace events matching the filters.

### 15e. Get current agent state

```bash
agentcl debug get-current-state --session-id <id>
```

**Expected:** JSON snapshot of the agent's current memory and state variables.

### 15f. Get span tree

```bash
agentcl debug get-span-tree --session-id <id>
```

```bash
# Flat format with depth info
agentcl debug get-span-tree --session-id <id> --flat
```

**Expected:** hierarchical (or flat) JSON view of execution spans.

### 15g. Get errors

```bash
agentcl debug get-errors --session-id <id>
```

```bash
# Include warnings
agentcl debug get-errors --session-id <id> --include-warnings
```

**Expected:** JSON list of errors (and warnings) from the session.

### 15h. Explain a decision

```bash
# Last N decisions
agentcl debug explain-decision --last-n 3

# Specific event
agentcl debug explain-decision --event-id <event-id>

# By turn number
agentcl debug explain-decision --turn 1
```

**Expected:** JSON with a human-readable explanation of the decision event.

### 15i. Get flow graph

```bash
# JSON format (default)
agentcl debug get-flow-graph --session-id <id>

# Mermaid diagram format
agentcl debug get-flow-graph --session-id <id> --format mermaid

# Include application graph
agentcl debug get-flow-graph --session-id <id> --include-app-graph
```

**Expected:** JSON graph or Mermaid diagram string of the session execution flow.

### 15j. List active sessions

```bash
agentcl debug list-active-sessions
```

**Expected:** JSON array of currently active sessions on the server.

### 15k. Session subscription

```bash
agentcl debug session subscribe --session-id <id>
agentcl debug session unsubscribe --session-id <id>
```

**Expected:** JSON confirming subscription or unsubscription.

### 15l. ABL documentation

```bash
# Get a specific topic
agentcl debug docs --topic MEMORY

# Search docs
agentcl debug docs --query "how does handoff work"
```

**Expected:** JSON with documentation content.

### 15m. Analyze session

```bash
agentcl debug analyze-session --session-id <id>
```

**Expected:** JSON with automated analysis summary (intent detected, routing decisions, errors).

### 15n. Diagnostic layer

```bash
agentcl debug diagnostic-layer --session-id <id>
agentcl debug diagnostic-layer --session-id <id> --trace-limit 50
```

**Expected:** JSON with a layered causal diagnostic view (config, routing, tool, model layers).

### 15o. Get and explain a trace event

```bash
# Fetch raw event
agentcl debug get-trace-event --event-id <event-id> --session-id <id>
agentcl debug get-trace-event --event-id <event-id> --include-data --include-nearby

# Explain with context
agentcl debug explain-trace-event --event-id <event-id> --session-id <id>
```

**Expected:** JSON with event details; explanation adds human-readable context.

### 15p. Model interactions

```bash
agentcl debug model-interactions --session-id <id>
agentcl debug model-interactions --session-id <id> --include-timeline
```

**Expected:** JSON summarising LLM provider calls (prompt tokens, completion tokens, latency).

### 15q. Realtime interactions

```bash
agentcl debug realtime-interactions --session-id <id>
agentcl debug realtime-interactions --session-id <id> --include-timeline
```

**Expected:** JSON summarising voice/realtime model interactions.

### 15r. Diagnose

```bash
# Quick config-only check
agentcl debug diagnose --agent-name hotel_coordinator --config-only

# Standard depth (default)
agentcl debug diagnose --session-id <id>

# Deep analysis
agentcl debug diagnose --session-id <id> --depth deep
```

**Expected:** JSON diagnostic report at the requested depth.

### 15s. Lint ABL

```bash
agentcl debug lint-abl --path .
agentcl debug lint-abl --path /tmp/my-project.zip
```

**Expected:** JSON with lint errors and warnings from the ABL files.

### 15t. Why transcript failed

```bash
agentcl debug why-transcript-failed \
  --path . \
  --transcript-path /path/to/transcript.json
```

**Expected:** JSON correlating transcript failures with ABL diagnostics.

### 15u. Harness CI logs

```bash
agentcl debug harness-logs \
  --execution-id <exec-id> \
  --run-sequence 42 \
  --stage-id build \
  --step-id test \
  --pipeline-id ci_build \
  --filter "ERROR" \
  --tail 100
```

**Expected:** filtered log lines from Harness CI. Requires `HARNESS_API_KEY` environment variable.

---

## 16. Global Options

### Override server URL per-command

```bash
agentcl --server-url https://my-custom-instance.example.com platform workspaces current
```

**Expected:** command runs against the specified server URL, overriding `AGENTS_URL` env var and saved state.

### Environment variable override

```bash
AGENTS_URL=https://my-custom-instance.example.com agentcl platform workspaces current
```

**Expected:** same behaviour as `--server-url`.

---

## 17. Context Resolution Precedence

Verify that options resolve in the correct priority order: **explicit flag → `.arch/state.json` → `~/.config/kore-platform/cli-state.json`**

```bash
# 1. Set a global project ID
agentcl context set-project --project-id global-id --global

# 2. Verify global is used when no local state exists
cd /tmp && agentcl context show   # should show global-id

# 3. Set a local project ID
cd /tmp/test-hotel
agentcl context set-project --project-id local-id

# 4. Verify local overrides global
agentcl context show              # should show local-id

# 5. Verify explicit flag overrides local
agentcl platform projects get --project-id explicit-id   # uses explicit-id
```

---

## 18. Error Handling

### Missing required flags

```bash
agentcl platform agents save-dsl
```

**Expected:** error message noting `--file` or `--dsl-content` is required.

### File not found

```bash
agentcl platform agents save-dsl --file /nonexistent/path.abl
```

**Expected:** `[agentcl] Error: file not found: /nonexistent/path.abl` and exit code 1.

### No project ID

```bash
agentcl context clear
agentcl platform tools import-abl --file tools/hotels-api.tools.abl
```

**Expected:** JSON error with a hint to run `agentcl platform projects create` or `agentcl context set-project`.

### Invalid JSON option

```bash
agentcl platform config update-settings --settings 'not-json'
```

**Expected:** `Invalid JSON: not-json` error and exit code 1.

### Destructive operations without `--confirm`

```bash
agentcl platform projects delete --project-id <id>
agentcl platform deployments retire --project-id <id> --deployment-id <id>
```

**Expected:** error or warning requiring the `--confirm` flag.

---

## Quick Smoke Test Sequence

Run these in order to exercise the most common workflow end-to-end:

```bash
# 1. Connect
agentcl platform connect --server-url https://agents.kore.ai

# 2. Create project and save context
agentcl platform projects create --name "Smoke Test" --save-context

# 3. Confirm context saved
agentcl context show

# 4. Upload an agent DSL
agentcl platform agents save-dsl --file agents/hotel_search.agent.abl

# 5. Validate the package
agentcl platform validate-package --path .

# 6. Create a version
agentcl platform versions create --agent-name hotel_search --changelog "smoke test"

# 7. List versions to confirm
agentcl platform versions list --agent-name hotel_search

# 8. Load the agent and start a debug session
agentcl debug load-agent --agent-path hotel/hotel_search

# 9. Save session to context
agentcl context set-session --session-id <session-id-from-step-8>

# 10. Send a message
agentcl debug send-message --text "Find hotels in Paris for next weekend"

# 11. Check traces
agentcl debug traces --limit 10

# 12. Analyze session
agentcl debug analyze-session

# 13. Clean up — delete test project
agentcl platform projects delete --project-id <id> --confirm
```
