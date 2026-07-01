# agentcl — Arch Agent Platform CLI

`agentcl` is a direct CLI for the Arch Agent Platform. It follows AWS CLI conventions (`agentcl <group> <command> [flags]`) and gives you shell access to every platform operation without requiring an LLM or the MCP server.

---

## Install

Build from source and link globally — the package is not published to the npm registry.

```bash
git clone git@github.com:dgwartney/agents-mcp-tools.git
cd agents-mcp-tools
npm install
npm run build
npm link
```

`npm link` registers the binary as a global command. Verify:

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

## Authentication

Authentication is automatic. The cascade runs in order:

1. **Explicit token** — pass `--auth-token <jwt>` to `platform connect`
2. **Stored credentials** — reads `.arch/credentials.json` silently (no browser)
3. **Device auth** — opens the browser and polls until approval, writes credentials

After the first `platform connect`, all subsequent commands — including `debug` and `chat` — auto-connect from stored credentials without requiring an explicit `platform connect`.

```bash
agentcl platform connect --server-url https://agents.kore.ai
```

To force fresh authentication (clears stored credentials):

```bash
agentcl platform connect --force
```

---

## Environment URLs

| Environment | URL                              |
|-------------|----------------------------------|
| Production  | `https://agents.kore.ai`         |
| Dev         | `https://agents-dev.kore.ai`     |
| Staging     | `https://agents-staging.kore.ai` |
| QA          | `https://agents-qa.kore.ai`      |
| Local       | `http://localhost:3112`          |

Pass `--server-url <url>` once — it is saved to `.arch/state.json` and reused by all subsequent commands in that directory. Override with the `AGENTS_URL` environment variable for CI pipelines.

---

## Command Groups

| Group | Description |
|-------|-------------|
| `platform` | Projects, agents, versions, deployments, tools, config, workspaces, evals, import/export |
| `debug` | Live agent sessions, traces, state inspection, diagnostics, ABL lint |
| `context` | Read and write the saved state file (`.arch/state.json`) |
| `init` | Scaffold a new agent project from template |
| `chat` | Interactive REPL session with a running agent |

---

## Documentation

| Document | Contents |
|----------|----------|
| [QUICK-START.md](QUICK-START.md) | Zero to deployed in 5 minutes |
| [USER-GUIDE.md](USER-GUIDE.md) | Full command reference by task |
| [TUTORIAL.md](TUTORIAL.md) | Multi-part walkthrough: hotel booking project |
| [COMMANDS.md](COMMANDS.md) | Complete flat command/option reference |
| [TESTING.md](TESTING.md) | Manual testing guide for all commands |
| [CHANGELOG.md](CHANGELOG.md) | Release history |
