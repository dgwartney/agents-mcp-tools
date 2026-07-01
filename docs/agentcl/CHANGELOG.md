# agentcl Changelog

All notable changes to the `agentcl` CLI are documented here. Dates are approximate for groupings of related commits.

---

## [Unreleased]

---

## 2026-07-01

### Added

- **`agentcl chat`** — interactive REPL for live agent sessions
  - Loads an agent and enters a readline loop: type a message, get a response
  - Streaming responses print chunk-by-chunk as they arrive
  - "Agent is thinking…" indicator shown while waiting for first response chunk
  - Colored output: `You:` in cyan, `Agent:` in green, status messages in dim gray
  - REPL slash commands: `/session`, `/help`, `/exit`, `/quit`
  - Session ID written to `.arch/state.json` on load; `agentcl chat` (no `--agent-path`) resumes the last session
  - Options: `--agent-path <domain/name>`, `--project-id <id>`

### Fixed

- **Debug auto-connect** — `debug load-agent`, `debug send-message`, `debug list-active-sessions`, `debug session subscribe/unsubscribe` now reconnect automatically from stored credentials instead of failing with "Not connected to server"
- **Session persistence** — `debug load-agent` writes the returned `sessionId` to `.arch/state.json`; subsequent `debug send-message` and `agentcl chat` pick it up without `--session-id`

---

## 2026-06-30

### Fixed

- `platform import-export export` — files now written to `--path` directory; file contents no longer printed to stdout
- `context show` — now includes `workspaceName` in output

---

## 2026-06-28

### Fixed

- `platform agents save-dsl` (supervisor ABL template) — removed ESCALATE/COMPLETE conditions that reference platform-injected runtime vars not available at compile time
- `platform agents save-dsl` (supervisor ABL template) — fixed `AGENTS` block to use correct `alias: path [CAPS]` format; removed invalid `ROUTING` section that the platform rejects

---

## 2026-06-24

### Added

- **`agentcl init --bare`** — scaffolds the project directory structure and Makefile without `.abl` template files; use when writing agents from scratch
- **`agentcl platform tools import-abl`** — bulk-creates or updates HTTP Tool Library entries from a `.tools.abl` specification file; idempotent (upsert behavior)
- **`agentcl platform agents save-dsl --file`** — resolves `file:` tool imports inside the ABL before uploading, eliminating unresolvable references; agent name inferred from `AGENT:`/`SUPERVISOR:` declaration

### Fixed

- `http-client` — 4xx/5xx error responses now include the full response body in the error message (previously only status code was shown)
- `platform tools import-abl` — parser now handles multi-line parameter lists in `.tools.abl` files; single-line regex previously missed `endpoint`/`method` for most tools
- `platform tools import-abl` — upserts existing tools (updates via PUT) instead of failing with 409 Conflict
- `platform agents save-dsl` — infers agent name from `AGENT:`/`SUPERVISOR:` declaration to prevent 409 name-mismatch errors

---

## 2026-06-20 (approx.)

### Added

- **`agentcl init`** — scaffolds a hotel booking multi-agent project template with `agents/`, `tools/`, `Makefile`, `README.md`, `.gitignore`, and git init
- **`agentcl init --platform`** — combines scaffold with authentication, platform project creation, and tool import in a single interactive command

### Added (earlier)

- **`agentcl platform workspaces`** — `list`, `current`, `switch` subcommands; workspace saved to state automatically
- **`agentcl platform evals`** — full eval management: personas, scenarios, evaluators, sets, runs (list/create/start/status/compare/heatmap/cases/preflight/quick)
- **`agentcl platform import-export`** — `export-preview`, `export`, `import-preview`, `import` subcommands
- **`agentcl platform validate-package`** / **`platform package-model`** — local package validation and compiler model inspection
- **`agentcl debug lint-abl`** — ABL design and repair lint checks
- **`agentcl debug why-transcript-failed`** — correlates transcript failure symptoms with ABL file/line causes
- **`agentcl debug diagnose`** — full session diagnostic with `--depth quick|standard|deep`
- **`agentcl debug analyze-session`** / **`debug diagnostic-layer`** — automated session and causal analysis
- **`agentcl context`** — `show`, `set-project`, `set-session`, `set-workspace`, `clear`
- Global `--server-url` flag on `agentcl` — overrides `AGENTS_URL` env var and saved state for a single invocation

---

## Initial Release

- `agentcl platform connect` — authenticate with device auth cascade
- `agentcl platform projects` — list, get, create, update, delete
- `agentcl platform agents` — list, get, save-dsl
- `agentcl platform versions` — list, create, get, promote, diff
- `agentcl platform deployments` — list, create, get, retire, rollback
- `agentcl platform tools` — list, get, create, update, delete, test
- `agentcl platform config` — get/update workspace settings and LLM config
- `agentcl debug load-agent` / `debug send-message` — load and interact with agents
- `agentcl debug traces` / `debug get-span-tree` / `debug get-errors` / `debug get-flow-graph` — session inspection
- `agentcl debug list-active-sessions` / `debug session subscribe/unsubscribe` — session subscription
- `agentcl debug docs` — ABL documentation lookup and search
