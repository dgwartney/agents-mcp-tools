# Quick Start — From Zero to Deployed in 5 Minutes

Get a working multi-agent application running on the Arch platform using `agentcl init`.

---

## Prerequisites

- Node.js 18+ and npm
- An Arch Agent Platform account at [agents.kore.ai](https://agents.kore.ai)

---

## Step 1: Install the CLI

```bash
git clone git@github.com:dgwartney/agents-mcp-tools.git
cd agents-mcp-tools
npm install && npm run build && npm link
cd ..
```

Verify:

```bash
agentcl --help
```

---

## Step 2: Create a New Project

```bash
mkdir my-hotel-agent && cd my-hotel-agent
agentcl init --platform
```

> **Starting from scratch with your own agents?** Use `agentcl init --bare` instead — it creates the directory structure and Makefile but no `.abl` template files, so you write your own agents from the start.

You will be prompted for three things:

```
  Project name    [my-hotel-agent]:  My Hotel Agent
  Description     [Hotel booking multi-agent application]:  ↵
  Platform URL    [https://agents.kore.ai]:  ↵
```

Your browser opens automatically for login. After approving, `agentcl init` creates:

```
my-hotel-agent/
├── agents/
│   ├── hotel.supervisor.abl       ← routes user intent
│   ├── hotel_search.agent.abl     ← searches and compares hotels
│   └── hotel_booking.agent.abl    ← collects details and confirms bookings
├── tools/
│   └── hotels-api.tools.abl       ← HTTP tool specifications
├── Makefile
├── README.md
└── .gitignore
```

And on the platform:
- ✓ Project created and saved to `.arch/state.json`
- ✓ 4 HTTP tools registered in the Tool Library (`search_hotels`, `get_hotel`, `check_availability`, `book_hotel`)

---

## Step 3: Upload Agents

```bash
make all
```

This uploads all three agents to the platform and validates them:

```
▶  Importing tools from tools/hotels-api.tools.abl
▶  Uploading hotel_booking.agent.abl
▶  Uploading hotel_search.agent.abl
▶  Uploading supervisor hotel.supervisor.abl
▶  Validating package
```

---

## Step 4: Create a Version

```bash
make versions CHANGELOG="Initial release"
```

This snapshots all three agents as version `1.0.0`.

---

## Step 5: Deploy to Staging

```bash
make deploy-staging
```

Output:

```
▶  Deploying to staging
    entry:    hotel_coordinator
    manifest: {"hotel_coordinator":"1.0.0","hotel_search":"1.0.0","hotel_booking":"1.0.0"}
```

Done — your multi-agent application is live on staging.

---

## What's Next

**Update your Hotels API connection:**

Edit `tools/hotels-api.tools.abl` and replace the placeholder URL:

```yaml
TOOLS:
  base_url: "https://your-actual-api.com/v1"   ← change this
  auth: api_key
```

Then re-import and re-deploy:

```bash
make tools          # re-registers tools with the new URL
make versions CHANGELOG="Point to real API"
make deploy-staging
```

**Promote to production:**

```bash
make deploy-production
```

**Check deployment status:**

```bash
make status
agentcl context show
```

**Adapt to your own domain:**

Open the `.agent.abl` files and update the `GOAL:` section to describe your use case. The hotel booking logic is a starting point — not a constraint.

---

## All Make Targets

```
make all                              sync tools and agents, then validate
make tools                            re-import tools from .tools.abl
make agents                           upload only changed agents
make versions CHANGELOG='...'         snapshot current versions
make deploy-staging                   deploy to staging
make deploy-production                deploy to production
make status                           show deployments and versions
make clean && make all                force full re-upload
```
