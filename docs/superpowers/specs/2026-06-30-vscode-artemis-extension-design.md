# VS Code Extension for Artemis Agent Development

**Project:** Artemis for VS Code  
**Date:** 2026-06-30  
**Status:** Design / Pre-implementation  
**Scope:** VS Code extension wrapping `agentcl` to provide a first-class IDE experience for building, deploying, and debugging agents on the Arch (Artemis) Agent Platform using ABL.

---

## 1. Executive Summary

`agentcl` is a TypeScript CLI that wraps the Kore AI Agent Platform (Arch/Artemis) REST API. It lets developers scaffold, upload, version, deploy, and debug multi-agent applications defined in ABL (Agent Blueprint Language) — a YAML-like DSL stored in `.agent.abl`, `.supervisor.abl`, and `.tools.abl` files.

This document describes a VS Code extension — **Artemis for VS Code** — that surfaces `agentcl` capabilities directly in the editor: syntax highlighting and validation for ABL files, a project explorer, one-click deploy/version commands, an integrated debug panel, and a platform connection status bar. The extension treats `agentcl` as its backend engine and calls it as a child process, keeping the CLI as the single source of truth.

---

## 2. Current State and Problem

### What exists today

| Component | Location | What it does |
|-----------|----------|--------------|
| `agentcl` CLI | `agents-mcp-tools` repo | Full platform CRUD: projects, agents, versions, deployments, tools, evals, debug |
| ABL files | `.agent.abl`, `.supervisor.abl`, `.tools.abl` | Agent definitions in a YAML-like DSL |
| Makefile | scaffolded per project | `make all`, `make deploy-staging`, etc. |
| MCP server | `agents-mcp-tools` | Exposes same tools to Claude Code / LLM clients |

### What is missing

- **No ABL language support in VS Code**: no syntax highlighting, no hover docs, no validation, no completions.
- **No platform visibility**: developers must switch to a terminal to check deployment status, list versions, or inspect active sessions.
- **No one-click workflows**: uploading an agent, creating a version, and deploying requires chaining shell commands.
- **No debug integration**: trace inspection, error lookup, and session state require terminal commands or Claude.

---

## 3. Goals and Non-Goals

### Goals

1. ABL language support: syntax highlighting, diagnostics, hover docs, completions for all top-level ABL keywords.
2. Project Explorer tree view: agents, tools, versions, deployments visible in the sidebar without leaving VS Code.
3. Command palette integration: common `agentcl` commands exposed as VS Code commands.
4. Status bar: connected platform URL and active project name, always visible.
5. Integrated terminal tasks: `make all`, `make deploy-staging`, etc. wired to VS Code tasks.
6. Session debug panel (webview): inspect traces, errors, and flow graphs from live sessions.

### Non-Goals

- Replacing the `agentcl` CLI — the extension calls it, does not reimplement it.
- Replacing Claude Code / MCP server — AI-assisted authoring remains a separate workflow.
- Supporting non-Arch platforms.
- Publishing to the VS Code Marketplace in phase 1 (internal use first).

---

## 4. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        VS Code Window                           │
│                                                                 │
│  ┌──────────────────┐   ┌──────────────────────────────────┐   │
│  │  Sidebar         │   │  Editor                          │   │
│  │  ──────────────  │   │  ─────────────────────────────── │   │
│  │  Artemis         │   │  hotel_search.agent.abl          │   │
│  │  Explorer        │   │  (syntax highlight, diagnostics, │   │
│  │  ┌─ Projects     │   │   hover, completions)            │   │
│  │  │  ┌─ Agents    │   └──────────────────────────────────┘   │
│  │  │  ├─ Tools     │                                          │
│  │  │  ├─ Versions  │   ┌──────────────────────────────────┐   │
│  │  │  └─ Deploys   │   │  Panel (Debug Webview)            │   │
│  │  └─ Sessions     │   │  Traces / Errors / Flow graph    │   │
│  └──────────────────┘   └──────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Status Bar: ● agents.kore.ai | my-hotel-agent             │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                    spawn / child_process
                              │
                    ┌─────────▼──────────┐
                    │   agentcl binary   │
                    │  (npm link global) │
                    └─────────┬──────────┘
                              │  HTTPS REST
                    ┌─────────▼──────────┐
                    │  Arch Platform     │
                    │  agents.kore.ai    │
                    └────────────────────┘
```

The extension is the **thin UI layer**. `agentcl` handles all platform communication. The extension spawns `agentcl` as a child process, parses its JSON stdout, and surfaces results in tree views, webviews, and notifications. This means the extension inherits authentication (`.arch/credentials.json`) and project context (`.arch/state.json`) from `agentcl` — no separate auth flow.

---

## 5. VS Code Extension Components

### 5.1 Extension Host Entry Point (`src/extension.ts`)

The entry point registers all providers, commands, and views on activation. The extension activates when VS Code opens a workspace containing `.arch/state.json` or any `*.abl` file.

**`package.json` `activationEvents`:**
```json
"activationEvents": [
  "workspaceContains:.arch/state.json",
  "workspaceContains:**/*.abl",
  "onLanguage:abl"
]
```

### 5.2 ABL Language Support

This is the highest-value component for day-to-day authoring. It has two sub-layers:

#### 5.2.1 Syntax Highlighting (TextMate Grammar)

A TextMate grammar file (`syntaxes/abl.tmLanguage.json`) tokenizes `.abl` files. ABL is a YAML-like indented DSL — the grammar captures:

| Pattern | Scope | Example |
|---------|-------|---------|
| Top-level keywords | `keyword.control.abl` | `AGENT:`, `SUPERVISOR:`, `GOAL:`, `TOOLS:`, `MEMORY:`, `GATHER:`, `HANDOFF:` |
| Section values | `string.unquoted.abl` | agent name after `AGENT:` |
| Quoted strings | `string.quoted.double.abl` | `"hotel_search"` |
| Tool signatures | `entity.name.function.abl` | `search_hotels(...)` |
| Return types | `storage.type.abl` | `-> {hotels: Hotel[]}` |
| Properties | `variable.other.property.abl` | `description:`, `endpoint:`, `method:` |
| Comments | `comment.line.abl` | `# ...` |
| Pipe literals | `markup.raw.block.abl` | `\|` block content |

The grammar file is declared in `package.json` under `contributes.grammars` with `language: "abl"` and `scopeName: "source.abl"`.

#### 5.2.2 Language Server (LSP)

A Language Server running in a separate Node.js process (`server/ablServer.ts`) provides intelligence beyond tokenization:

| Feature | Implementation |
|---------|----------------|
| **Diagnostics** | Parse ABL structure, surface missing required sections (`GOAL:` on agents, `AGENTS:` on supervisors), type mismatches in `MEMORY:` |
| **Hover** | For each top-level keyword, return the ABL spec definition pulled from the embedded `ABL_DOCS` in `src/docs/index.ts` |
| **Completions** | Suggest top-level keywords at cursor position; suggest known tool names from parsed TOOLS sections |
| **Go to definition** | Navigate from a HANDOFF `TO: hotel_booking` to `hotel_booking.agent.abl` |
| **Document symbols** | Populate the outline view with all top-level ABL sections |

The Language Client (in the extension host) uses `vscode-languageclient` to launch and communicate with the server. The server uses `vscode-languageserver` — both are standard npm packages from Microsoft.

**ABL validation rules to implement initially:**
- `AGENT:` or `SUPERVISOR:` must be the first non-blank line
- `VERSION:` must be a quoted semver string
- `GOAL:` is required on agents
- `AGENTS:` is required on supervisors
- `HANDOFF.TO:` values must match a known agent name in the workspace
- `MEMORY` variable types must be `string | boolean | number | date | object | array`

### 5.3 Project Explorer Tree View

A sidebar tree view under the "Artemis" activity bar icon. The tree is driven by calls to `agentcl` subcommands (parsed JSON output):

```
Artemis
├── Projects
│   └── my-hotel-agent (active)
│       ├── Agents
│       │   ├── hotel_search  [v1.0.0]
│       │   ├── hotel_booking [v1.0.0]
│       │   └── hotel_coordinator [supervisor]
│       ├── Tools
│       │   ├── search_hotels
│       │   ├── get_hotel
│       │   ├── check_availability
│       │   └── book_hotel
│       ├── Versions
│       │   └── 1.0.0 (2026-06-28)
│       └── Deployments
│           ├── staging  ● live
│           └── production  ○ retired
└── Active Sessions
    └── (empty)
```

**Implementation:** `TreeDataProvider<ArtemisTreeItem>` interface. Each node type (`ProjectNode`, `AgentNode`, `DeploymentNode`, etc.) implements `getTreeItem()` and `getChildren()`. Data is fetched lazily: top-level nodes call `agentcl platform projects list`, agent children call `agentcl platform agents list --project-id X`, etc.

**Context menu actions** on each node type:

| Node | Actions |
|------|---------|
| Agent | Open file, Upload (save-dsl), Create version |
| Deployment | Get status, Retire, Rollback |
| Project | Set active, Export, Validate package |
| Tools group | Import ABL |

### 5.4 Command Palette Commands

All commands are registered in `contributes.commands` and callable via `Cmd+Shift+P`:

| Command ID | Title | `agentcl` equivalent |
|------------|-------|----------------------|
| `artemis.connect` | Artemis: Connect to Platform | `agentcl platform connect` |
| `artemis.init` | Artemis: Initialize Project | `agentcl init --platform` |
| `artemis.uploadCurrentFile` | Artemis: Upload Current Agent | `agentcl platform agents save-dsl --file <active-file>` |
| `artemis.uploadAll` | Artemis: Upload All Agents | `make agents` |
| `artemis.importTools` | Artemis: Import Tools | `agentcl platform tools import-abl --file <tools-file>` |
| `artemis.createVersion` | Artemis: Create Version | `agentcl platform versions create` |
| `artemis.deployStagingn` | Artemis: Deploy to Staging | `make deploy-staging` |
| `artemis.deployProduction` | Artemis: Deploy to Production | `make deploy-production` |
| `artemis.validatePackage` | Artemis: Validate Package | `agentcl platform validate-package` |
| `artemis.lintAbl` | Artemis: Lint ABL | `agentcl platform...debug_lint_abl` |
| `artemis.contextShow` | Artemis: Show Context | `agentcl context show` |
| `artemis.openSession` | Artemis: Open Debug Session | opens debug webview |
| `artemis.refreshExplorer` | Artemis: Refresh Explorer | re-queries all tree data |

### 5.5 Status Bar

A status bar item on the left that always shows the platform connection state and active project:

```
● agents.kore.ai | my-hotel-agent
```

- Green circle: authenticated and platform reachable
- Yellow circle: credentials found but platform not yet verified
- Red circle: not authenticated

Clicking opens the context panel. Updated whenever `agentcl context show` output changes (polled every 30 seconds when the window is focused, or triggered after any command execution).

### 5.6 Debug Session Webview

A webview panel (`vscode.window.createWebviewPanel`) for inspecting live agent sessions. It wraps the debug tools already in `agentcl`:

**Panels within the webview:**

| Tab | Data source | `agentcl` command |
|-----|-------------|-------------------|
| Active Sessions | Live session list | `agentcl debug list-sessions` |
| Traces | Trace event search | `agentcl debug traces` |
| Span Tree | Hierarchical execution | `agentcl debug get-span-tree` |
| Errors | Errors + warnings | `agentcl debug get-errors` |
| Flow Graph | State machine (Mermaid) | `agentcl debug get-flow-graph` |
| Transcript | Session transcript | `agentcl debug...` |

The webview communicates with the extension host via `postMessage` / `onDidReceiveMessage`. The extension host calls `agentcl` and sends results back to the webview for rendering. The flow graph tab renders Mermaid diagrams using the `mermaid.js` CDN script loaded in the webview HTML.

### 5.7 VS Code Task Integration

The extension contributes a `TaskProvider` so `make all`, `make deploy-staging`, etc. appear as VS Code tasks (runnable via `Tasks: Run Task`). This also lets them integrate with VS Code's problem matchers to surface compiler errors inline.

**Problem matcher** for ABL compiler output — maps error lines like `[agentcl] Warning: tools file not found: ...` to Problems panel entries.

---

## 6. Extension Project Structure

```
vscode-artemis/
├── package.json                 ← extension manifest
├── tsconfig.json
├── .vscodeignore
├── src/
│   ├── extension.ts             ← activation, register all providers/commands
│   ├── agentcl.ts               ← child_process wrapper: runAgentcl(args) → JSON
│   ├── statusBar.ts             ← status bar item manager
│   ├── explorer/
│   │   ├── ArtemisExplorer.ts   ← TreeDataProvider registration
│   │   └── nodes.ts             ← ProjectNode, AgentNode, DeploymentNode, etc.
│   ├── commands/
│   │   ├── connect.ts
│   │   ├── upload.ts
│   │   ├── deploy.ts
│   │   └── validate.ts
│   ├── debug/
│   │   └── DebugWebviewPanel.ts ← session debug webview
│   └── language/
│       ├── client.ts            ← LSP language client
│       └── server/
│           └── ablServer.ts     ← LSP language server
├── syntaxes/
│   └── abl.tmLanguage.json      ← TextMate grammar
├── icons/
│   └── artemis.svg              ← sidebar activity bar icon
└── webview/
    ├── debug.html               ← debug panel HTML shell
    └── debug.js                 ← webview-side JS (postMessage handler)
```

---

## 7. The `agentcl` Wrapper Layer

The extension never calls the Arch REST API directly. All platform access goes through `agentcl` via `child_process.spawn`. A shared utility (`src/agentcl.ts`) handles this:

```typescript
// Conceptual shape — not final code
async function runAgentcl(args: string[], cwd: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const proc = spawn('agentcl', args, { cwd });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code !== 0) reject(new Error(stderr));
      else resolve(JSON.parse(stdout));
    });
  });
}
```

**Key design decisions:**
- Always pass `--json` (or rely on existing JSON output) — `agentcl` already outputs JSON by default.
- Run commands in the workspace root (`cwd: workspaceRoot`) so `.arch/state.json` is found automatically.
- Surface stderr as VS Code error notifications, not silent failures.
- Cache read-only responses (project list, agent list) with a short TTL (30 seconds) to avoid hammering the API on tree refresh.

---

## 8. Authentication Flow

The extension inherits `agentcl`'s auth:

1. On activation, run `agentcl context show` to check if `.arch/state.json` exists and has a `serverUrl`.
2. If not found, show a notification: "No Artemis connection found. Run Artemis: Connect to Platform."
3. `artemis.connect` command runs `agentcl platform connect --server-url <url>` — this opens the browser for device auth automatically (existing behavior).
4. After connect succeeds, refresh the status bar and explorer.

No OAuth tokens or credentials are stored or managed by the extension itself.

---

## 9. Technology Stack

### Required packages (`package.json` dependencies)

| Package | Purpose |
|---------|---------|
| `vscode` (peer dep) | VS Code Extension API |
| `vscode-languageclient` | LSP language client (in extension host) |
| `vscode-languageserver` | LSP language server |
| `vscode-languageserver-textdocument` | Text document model for the server |
| `js-yaml` | Parse ABL files (for diagnostics — YAML superset) |
| `mermaid` | Flow graph rendering in the debug webview |

### Dev tools

| Package | Purpose |
|---------|---------|
| `@vscode/vsce` | Package extension as `.vsix` for local install |
| `@types/vscode` | TypeScript types for the extension API |
| `esbuild` or `webpack` | Bundle extension host + server to `dist/` |
| `vitest` | Unit tests for the `agentcl` wrapper and ABL parser |
| `yo` + `generator-code` | Scaffold initial extension skeleton (one-time) |

### VS Code API surface used

| API | Used for |
|-----|---------|
| `vscode.window.createTreeView` | Project explorer sidebar |
| `vscode.window.createWebviewPanel` | Debug session panel |
| `vscode.window.createStatusBarItem` | Platform connection status |
| `vscode.commands.registerCommand` | All command palette entries |
| `vscode.languages.registerHoverProvider` | ABL hover documentation |
| `vscode.tasks.registerTaskProvider` | `make` task integration |
| `vscode.workspace.createFileSystemWatcher` | Watch `.arch/state.json` for context changes |
| `LanguageClient` (vscode-languageclient) | ABL LSP client |

---

## 10. Implementation Phases

### Phase 1 — Language Support (Weeks 1–3)

**Deliverables:**
- TextMate grammar for ABL syntax highlighting (all keyword classes, tool signatures, quoted strings, comments, block literals)
- Extension scaffolded and installable via `code --install-extension artemis.vsix`
- Basic status bar item showing platform URL from `.arch/state.json`

**Value:** Every developer gets color-coded ABL immediately. Zero backend integration required.

### Phase 2 — Commands and Terminal Integration (Weeks 4–5)

**Deliverables:**
- `agentcl.ts` wrapper with JSON output parsing and error handling
- Core commands: `connect`, `upload current file`, `import tools`, `create version`, `deploy staging/production`, `validate package`
- Task provider wired to Makefile targets
- Status bar shows project name and updates after each command

**Value:** All common `agentcl` operations available from `Cmd+Shift+P` without switching to a terminal.

### Phase 3 — Project Explorer (Weeks 6–8)

**Deliverables:**
- Artemis sidebar panel with Projects / Agents / Tools / Versions / Deployments tree
- Lazy data loading with 30-second cache
- Context menu actions on each node type
- Refresh command

**Value:** Full platform visibility without leaving VS Code.

### Phase 4 — Language Server (Weeks 9–12)

**Deliverables:**
- LSP server with ABL document parsing
- Diagnostics: missing required sections, invalid type names, broken HANDOFF references
- Hover docs for all top-level keywords (sourced from embedded `ABL_DOCS`)
- Go to definition for HANDOFF.TO agent names
- Document symbols / outline

**Value:** Inline error feedback during authoring — catch ABL mistakes before uploading.

### Phase 5 — Debug Webview (Weeks 13–16)

**Deliverables:**
- Webview panel with tab navigation (Sessions, Traces, Errors, Flow Graph)
- Session list with click-to-load
- Trace search, span tree rendering, error list
- Mermaid flow graph rendering for `debug_get_flow_graph` output

**Value:** Replaces terminal-based debug workflow with a structured panel.

---

## 11. Skills Required

### Must have

| Skill | Level needed | Used for |
|-------|-------------|---------|
| TypeScript | Advanced | Extension host, language server, all core logic |
| Node.js (`child_process`) | Intermediate | `agentcl` subprocess wrapper |
| VS Code Extension API | Intermediate | Tree views, commands, status bar, task provider |
| JSON / JSON Schema | Intermediate | Parsing `agentcl` output, extension manifest |
| TextMate grammar (regex-based) | Intermediate | ABL syntax highlighting |
| Git | Basic | Version control, branch workflow |

### Should have

| Skill | Level needed | Used for |
|-------|-------------|---------|
| Language Server Protocol | Intermediate | ABL diagnostics, hover, completions |
| YAML parsing (`js-yaml`) | Basic | ABL document structure analysis |
| HTML/CSS/JavaScript (browser) | Intermediate | Debug webview UI |
| Webpack or esbuild | Basic | Bundling extension to `dist/` |
| ABL / Arch platform | Basic | Understanding the domain to write good diagnostics and UX |

### Nice to have

| Skill | Level | Used for |
|-------|-------|---------|
| React or Preact | Basic | Richer webview UI in phase 5 |
| Mermaid.js | Basic | Flow graph rendering in debug panel |
| VS Code Testing API | Basic | Extension integration tests |

### Team size estimate

| Phase | Developers | Notes |
|-------|-----------|-------|
| 1 (Grammar + scaffold) | 1 | Mostly YAML/regex; no platform knowledge required |
| 2 (Commands) | 1 | Needs `agentcl` familiarity |
| 3 (Explorer) | 1–2 | Tree view API is well-documented |
| 4 (LSP) | 1–2 | LSP implementation is non-trivial — adds 3–4 weeks |
| 5 (Debug webview) | 1–2 | Webview + Mermaid integration |

A single senior TypeScript developer with VS Code extension experience could deliver phases 1–3 in 8 weeks. Phases 4–5 add 8 more weeks, making the full feature set a 4-month project solo or 2 months with two engineers.

---

## 12. Key Design Decisions and Trade-offs

### Decision 1: Wrap `agentcl` vs. call the API directly

**Chosen:** Wrap `agentcl` as a child process.  
**Why:** The CLI encapsulates auth state, context resolution (`.arch/state.json`), and error handling that would otherwise need to be reimplemented. Any improvements to `agentcl` (new commands, bug fixes) are immediately available to the extension without changes.  
**Trade-off:** Startup latency per command (~50–200ms for Node.js spawn). Acceptable for user-triggered commands; mitigated with caching for tree data.

### Decision 2: LSP vs. simple diagnostic provider

**Chosen:** Full LSP implementation.  
**Why:** LSP runs in a separate process, keeping the extension host responsive. It also enables future features (rename symbol, format document, code actions) without architectural changes.  
**Trade-off:** Higher initial complexity. A `vscode.languages.registerDiagnosticsCollection` approach is simpler for phase 1 but limits future extension.

### Decision 3: Webview vs. native VS Code views for debug panel

**Chosen:** Webview for the debug panel.  
**Why:** The flow graph requires Mermaid rendering, trace trees need custom styling, and the tabbed layout isn't achievable with native tree views alone.  
**Trade-off:** Webviews are harder to theme correctly and require `postMessage` for all data transfer. Native panels would integrate more naturally but can't render diagrams.

---

## 13. Project Repository Structure

The extension lives in a new repository, separate from `agents-mcp-tools`:

```
vscode-artemis/        ← new repository
├── package.json
├── src/...
├── syntaxes/...
└── webview/...
```

It declares `agentcl` as a peer dependency (expects it to be on `PATH` via `npm link`). The `agents-mcp-tools` repo continues to own the CLI and MCP server without modification.

**Install path for developers:**
```bash
# 1. Install agentcl (already done)
cd agents-mcp-tools && npm install && npm run build && npm link

# 2. Install the extension
cd vscode-artemis && npm install && npm run build
npx vsce package          # produces artemis-0.1.0.vsix
code --install-extension artemis-0.1.0.vsix
```

---

## 14. Acceptance Criteria

| Feature | Acceptance criterion |
|---------|---------------------|
| Syntax highlighting | All ABL keywords color-coded; `.agent.abl`, `.supervisor.abl`, `.tools.abl` all recognized |
| Status bar | Shows platform URL and project name within 2 seconds of window open |
| Upload command | `Artemis: Upload Current Agent` uploads the active `.abl` file and shows success/failure notification |
| Explorer | Agents, tools, versions, and deployments visible without opening a terminal |
| Diagnostics | Missing `GOAL:` section shows as a red squiggle in the editor |
| Hover | Hovering over `HANDOFF:` shows the ABL spec for that section |
| Deploy | `Artemis: Deploy to Staging` runs, streams output to VS Code terminal, reports result |
| Debug panel | Opens and lists active sessions; selecting one loads traces |

---

## 15. References

- `agents-mcp-tools` repository: `src/cli/`, `src/tools/`, `USER-GUIDE.md`, `QUICK-START.md`
- VS Code Extension API: [https://code.visualstudio.com/api](https://code.visualstudio.com/api)
- Language Server Protocol: [https://code.visualstudio.com/api/language-extensions/language-server-extension-guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- TextMate Grammar Guide: [https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide](https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide)
- Tree View API: [https://code.visualstudio.com/api/extension-guides/tree-view](https://code.visualstudio.com/api/extension-guides/tree-view)
- Webview API: [https://code.visualstudio.com/api/extension-guides/webview](https://code.visualstudio.com/api/extension-guides/webview)
- `vscode-languageserver-node`: [https://github.com/microsoft/vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node)
- Mermaid.js: [https://mermaid.js.org](https://mermaid.js.org)
