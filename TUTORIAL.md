# Tutorial: Build a Multi-Agent Project from Scratch

This tutorial walks you through creating a multi-agent hotel booking application on the Arch Agent Platform — from installing the CLI to deploying versioned agents with HTTP tools.

**What you will build:**

```
hotel-booking-agent/
├── agents/
│   ├── hotel.supervisor.abl   # Routes to specialist agents
│   ├── hotel_search.agent.abl       # Searches & compares hotels
│   └── hotel_booking.agent.abl      # Handles reservations
└── tools/
    └── hotels-api.tools.abl         # Shared HTTP tool definitions
```

Three agents work together:
- **Coordinator** (supervisor) — detects intent and routes to the right specialist
- **Hotel Search** — calls a hotels REST API to search, filter, and compare options
- **Hotel Booking** — gathers guest details and confirms reservations

---

## Prerequisites

- Node.js 18+ and npm
- Git and a GitHub account
- An Arch Agent Platform account at [agents.kore.ai](https://agents.kore.ai)

---

## Part 1: Install the CLI

The `agentcl` CLI is installed globally by building from source and using `npm link`:

```bash
git clone git@github.com:dgwartney/agents-mcp-tools.git
cd agents-mcp-tools
npm install
npm run build
npm link
cd ..           # return to your project directory
```

`npm link` creates a global symlink from your system's bin directory to the compiled binary, making `agentcl` available in any shell without a path prefix.

Verify it works:

```bash
agentcl --help
```

You should see:

```
Usage: agentcl [options] [command]

agentcl — direct access to Arch Agent Platform tools

Commands:
  platform   Manage Arch platform resources
  debug      Debug agent sessions and traces
  context    Manage saved CLI context (project ID, session ID)
  init       Initialise a new Arch Agent Platform project (hotel booking template)
```

**To update the CLI** after pulling new changes:

```bash
cd agents-mcp-tools
git pull
npm run build   # npm link only needs to run once
```

---

## Part 2: Authenticate

Connect to the Arch platform and authenticate. Pass the server URL once with `--server-url` — it is saved to `.arch/state.json` so you never need to pass it again:

```bash
agentcl platform connect --server-url https://agents.kore.ai
```

On the first run, your browser opens automatically. Log in and approve the device request. Two files are written to `.arch/` in your project directory:

- `.arch/credentials.json` — your auth token (never committed — `.arch/` is gitignored)
- `.arch/state.json` — the server URL and your workspace (tenant), decoded from the JWT automatically

All subsequent commands in this directory work with no flags and no environment variables:

```bash
agentcl platform workspaces current
```

> **Different environments per project:** For a staging project, run `agentcl platform connect --server-url https://agents-staging.kore.ai` from that project's directory. Each project keeps its own credentials and URL in its `.arch/` folder.

---

## Quick Start Alternative: `agentcl init`

Instead of following Parts 3–8 manually, you can scaffold the entire project structure in one step:

```bash
mkdir hotel-booking-agent && cd hotel-booking-agent
agentcl init                    # prompts for name + description, scaffolds all files + git init
agentcl init --platform         # same, plus authenticate + create platform project + import tools
```

`agentcl init` creates the same files as Parts 3–8: the three ABL agents, tools specification, generic Makefile, README, and .gitignore. **Continue from Part 9** (Register Agents) after running it.

---

## Part 3: Create a GitHub Repository

Create a local project directory and push to GitHub:

```bash
# Create the project
mkdir hotel-booking-agent
cd hotel-booking-agent
git init
git branch -M main

# Create the directory structure
mkdir -p agents tools

# Add a .gitignore
cat > .gitignore << 'EOF'
.arch/
node_modules/
*.env
.env.*
EOF

git add .gitignore
git commit -m "chore: init hotel booking agent project"

# Create GitHub repo and push
gh repo create hotel-booking-agent --public --source=. --remote=origin --push
```

> **Tip:** Replace `--public` with `--private` if this is internal work.

---

## Part 4: Create the Platform Project

Create a project and save the project ID to context in one step using `--save-context`:

```bash
agentcl platform projects create \
  --name "Hotel Booking Agent" \
  --description "Multi-agent hotel search and booking system" \
  --save-context
```

`--save-context` writes the new project ID to `.arch/state.json` automatically. Without the flag the output includes a hint with the command to save it manually.

Verify the full context — you should see server URL, workspace, and project ID:

```bash
agentcl context show
```

```json
{
  "path": "/path/to/hotel-booking-agent/.arch/state.json",
  "state": {
    "serverUrl": "https://agents.kore.ai",
    "tenantId": "019e6686-...",
    "workspaceName": "my-workspace",
    "projectId": "proj-abc123"
  }
}
```

---

## Part 5: Define and Register the HTTP Tools

The Arch platform enforces a separation between **tool interface** (used in agent DSL) and **tool implementation** (HTTP endpoint, method, auth). The implementation lives in the **Project Tool Library**; the agent DSL only declares the function signature and description.

### Step 5a — Document the tool specifications

Keep a `tools/hotels-api.tools.abl` file in your project as a source-of-truth reference for the full tool specification (including HTTP details). This file is used for local validation with `validate-package` but is **not** uploaded to the platform.

**`tools/hotels-api.tools.abl`**

```yaml
TOOLS:
  base_url: "https://api.example-hotels.com/v1"
  auth: api_key
  timeout: 8000
  retry: 2

  search_hotels(
    destination: string,
    checkin: date,
    checkout: date,
    guests: number = 1,
    max_results: number = 10
  ) -> {hotels: Hotel[], total: number}
    description: "Search available hotels by destination and dates"
    type: http
    endpoint: "/hotels/search"
    method: POST
    headers:
      X-Api-Key: "{{config.HOTELS_API_KEY}}"

  get_hotel(hotel_id: string) -> {id: string, name: string, description: string, amenities: string[], rating: number, price_per_night: number}
    description: "Get full details for a specific hotel"
    type: http
    endpoint: "/hotels/{hotel_id}"
    method: GET

  check_availability(
    hotel_id: string,
    checkin: date,
    checkout: date,
    room_type: string = "standard"
  ) -> {available: boolean, price: number, currency: string, rooms_left: number}
    description: "Check room availability and current pricing for a hotel"
    type: http
    endpoint: "/hotels/{hotel_id}/availability"
    method: POST

  book_hotel(
    hotel_id: string,
    checkin: date,
    checkout: date,
    room_type: string,
    guest_name: string,
    guest_email: string,
    guests: number
  ) -> {confirmation_number: string, total_price: number, currency: string, status: string}
    description: "Create a hotel reservation. Requires explicit user confirmation before calling."
    type: http
    endpoint: "/hotels/bookings"
    method: POST
    confirmation:
      require: always
      immutable_params: [hotel_id, checkin, checkout]
```

```bash
git add tools/hotels-api.tools.abl
git commit -m "feat: add hotels API tool specifications"
```

### Step 5b — Register tools in the Project Tool Library

The HTTP implementation (`endpoint`, `method`, `auth`) must be in the **Project Tool Library**. The `import-abl` command reads the `.tools.abl` specification file and creates all tools automatically:

```bash
# Preview what will be created (no changes made)
agentcl platform tools import-abl --file tools/hotels-api.tools.abl --dry-run

# Create all tools in the Tool Library
agentcl platform tools import-abl --file tools/hotels-api.tools.abl
```

Verify all four tools were registered:

```bash
agentcl platform tools list
```

You should see `search_hotels`, `get_hotel`, `check_availability`, and `book_hotel` each with `toolType: "http"`.

> **Why this separation?** Agent DSL files are version-controlled and portable. Tool implementations contain environment-specific configuration (URLs, auth) that differs between staging and production. Keeping them in the Tool Library lets you point the same agent at different backends per environment without changing the DSL.

---

## Part 6: Write the Hotel Search Agent

This agent searches hotels, filters results, and presents options to the user.

**`agents/hotel_search.agent.abl`**

```yaml
AGENT: hotel_search
VERSION: "1.0.0"
DESCRIPTION: "Searches hotels, compares options, and presents the best matches"

GOAL: |
  Help users find the perfect hotel by searching available options,
  filtering by their preferences, and presenting clear comparisons.
  Search hotels using the search_hotels tool, present the top 3-5 results
  with name, rating, price per night, and key amenities. When the user
  selects a hotel, fetch full details with get_hotel and check current
  pricing and availability with check_availability. Always confirm
  search criteria before searching.

PERSONA: |
  Knowledgeable travel assistant with expertise in hotel recommendations.
  Concise, helpful, and proactive in clarifying vague preferences.

TOOLS:
  search_hotels(
    destination: string,
    checkin: date,
    checkout: date,
    guests: number = 1,
    max_results: number = 10
  ) -> {hotels: Hotel[], total: number}
    description: "Search available hotels by destination and dates"

  get_hotel(hotel_id: string) -> {id: string, name: string, description: string, amenities: string[], rating: number, price_per_night: number}
    description: "Get full details for a specific hotel"

  check_availability(
    hotel_id: string,
    checkin: date,
    checkout: date,
    room_type: string = "standard"
  ) -> {available: boolean, price: number, currency: string, rooms_left: number}
    description: "Check room availability and current pricing for a hotel"

MEMORY:
  session:
    hotel_id:
      type: string
      description: "Selected hotel ID, set when user chooses a hotel"
    user_ready_to_book:
      type: boolean
      description: "Set when user confirms they want to proceed with booking"
    user_wants_different_search:
      type: boolean
      description: "Set when user asks to start a new search"
    user_done_browsing:
      type: boolean
      description: "Set when user has finished browsing without booking"

GATHER:
  destination:
    prompt: "Which city or area are you looking for a hotel in?"
    type: string
    required: true

  checkin:
    prompt: "What is your check-in date?"
    type: date
    required: true

  checkout:
    prompt: "What is your check-out date?"
    type: date
    required: true

  guests:
    prompt: "How many guests?"
    type: number
    default: 1

  preferences:
    prompt: "Any preferences? (budget, amenities, location, star rating)"
    type: string
    required: false

HANDOFF:
  - TO: hotel_booking
    WHEN: user_ready_to_book IS SET AND hotel_id IS SET
    CONTEXT:
      pass: [hotel_id, checkin, checkout, guests]
      summary: "User selected {{hotel_id}} and is ready to book for {{checkin}} to {{checkout}}"
    RETURN: false

COMPLETE:
  - WHEN: user_wants_different_search IS SET
    RESPOND: "No problem! Let me know your new search criteria."

  - WHEN: user_done_browsing IS SET
    RESPOND: "Happy to help whenever you are ready to book. Just let me know!"

ON_ERROR:
  search_failed:
    RESPOND: "I had trouble searching for hotels right now. Shall I try again?"
    RETRY: 1
```

Commit:

```bash
git add agents/hotel_search.agent.abl
git commit -m "feat: add hotel search agent"
```

---

## Part 7: Write the Hotel Booking Agent

This agent collects guest details and completes the reservation.

**`agents/hotel_booking.agent.abl`**

```yaml
AGENT: hotel_booking
VERSION: "1.0.0"
DESCRIPTION: "Collects guest information and completes hotel reservations"

GOAL: |
  Complete hotel reservations accurately and securely.
  First verify availability using check_availability with the hotel_id,
  checkin, checkout, and room_type passed from the search agent.
  If the room is unavailable, tell the user and trigger the handoff back.
  Once availability is confirmed, present the full booking summary
  (hotel, dates, room type, guests, total price, guest name and email)
  and ask for explicit confirmation before calling book_hotel.
  Never proceed to booking without explicit user confirmation.

PERSONA: |
  Efficient and reassuring booking specialist.
  Double-checks all details to prevent errors and builds trust.

TOOLS:
  check_availability(
    hotel_id: string,
    checkin: date,
    checkout: date,
    room_type: string = "standard"
  ) -> {available: boolean, price: number, currency: string, rooms_left: number}
    description: "Check room availability and current pricing for a hotel"

  book_hotel(
    hotel_id: string,
    checkin: date,
    checkout: date,
    room_type: string,
    guest_name: string,
    guest_email: string,
    guests: number
  ) -> {confirmation_number: string, total_price: number, currency: string, status: string}
    description: "Create a hotel reservation. Requires explicit user confirmation before calling."
    confirmation:
      require: always
      immutable_params: [hotel_id, checkin, checkout]

MEMORY:
  session:
    hotel_id:
      type: string
      description: "Hotel ID passed from hotel_search via handoff"
    hotel_name:
      type: string
      description: "Hotel display name resolved from context or tool"
    checkin:
      type: date
      description: "Check-in date passed from hotel_search via handoff"
    checkout:
      type: date
      description: "Check-out date passed from hotel_search via handoff"
    guests:
      type: number
      description: "Number of guests passed from hotel_search via handoff"
    room_unavailable:
      type: boolean
      description: "Set to true when check_availability returns available=false"
    confirmation_number:
      type: string
      description: "Booking confirmation number returned by book_hotel"
    total_charged:
      type: number
      description: "Total price charged, returned by book_hotel"
    currency:
      type: string
      description: "Currency code returned by book_hotel"

GATHER:
  guest_name:
    prompt: "What is the full name for the reservation?"
    type: string
    required: true

  guest_email:
    prompt: "What email should we send the confirmation to?"
    type: string
    required: true
    validation: email

  room_type:
    prompt: "Which room type? (standard, deluxe, suite)"
    type: string
    required: true
    options: [standard, deluxe, suite]

HANDOFF:
  - TO: hotel_search
    WHEN: room_unavailable IS SET
    CONTEXT:
      pass: [destination, checkin, checkout, guests]
      summary: "Selected room is no longer available. Returning to search."
    RETURN: false

COMPLETE:
  - WHEN: confirmation_number IS SET
    RESPOND: |
      Your reservation is confirmed!

      **Confirmation:** {{confirmation_number}}
      **Hotel:** {{hotel_name}}
      **Dates:** {{checkin}} to {{checkout}}
      **Room:** {{room_type}} for {{guests}} guest(s)
      **Total:** {{total_charged}} {{currency}}
      **Confirmation sent to:** {{guest_email}}

      Is there anything else I can help you with?

ON_ERROR:
  booking_failed:
    RESPOND: "I wasn't able to complete the booking. Your card has not been charged. Shall I try again?"
    RETRY: 1
```

Commit:

```bash
git add agents/hotel_booking.agent.abl
git commit -m "feat: add hotel booking agent"
```

---

## Part 8: Write the Coordinator (Supervisor)

The supervisor routes conversations to the correct specialist and handles top-level intent detection.

**`agents/hotel.supervisor.abl`**

```yaml
SUPERVISOR: hotel_coordinator
VERSION: "1.0.0"
DESCRIPTION: "Routes hotel queries to the appropriate specialist agent"

GOAL: |
  Detect user intent and route to the right specialist:
  - hotel_search for browsing, comparing, and researching hotels
  - hotel_booking for completing reservations

PERSONA: |
  Professional travel coordinator. Friendly, efficient, and transparent.
  Routes quickly without making the user repeat themselves.

AGENTS:
  hotel_search: "./hotel_search.agent.abl" [hotel_search, compare_hotels, check_availability]
  hotel_booking: "./hotel_booking.agent.abl" [book_hotel, process_reservation, confirm_booking]

BEHAVIOR:
  canRespondDirectly: true
  allowedDirectActions: [greet, clarify_intent, answer_faq]
  forbiddenActions: [search_hotels, book_hotel]

HANDOFF:
  - TO: hotel_search
    WHEN: intent.category IN ["hotel_search", "browse", "compare"]
    CONTEXT:
      pass: []
      summary: "User wants to search or browse hotels"
    RETURN: false

  - TO: hotel_booking
    WHEN: intent.category IN ["book_hotel", "reservation"]
    CONTEXT:
      pass: []
      summary: "User wants to make a reservation"
    RETURN: false

ESCALATE:
  triggers:
    - WHEN: routing_failures >= 3
      REASON: "Unable to determine user intent after multiple attempts"
      PRIORITY: medium

  context_for_human:
    - conversation_history

ON_ERROR:
  routing_failure:
    RESPOND: "I want to make sure I connect you with the right specialist. Are you looking to search for hotels, or do you already know which hotel you'd like to book?"
    RETRY: 1

COMPLETE:
  - WHEN: handoff_successful == true
    RESPOND: "I've connected you with the right specialist. They have your full context."
```

Commit:

```bash
git add agents/hotel.supervisor.abl
git commit -m "feat: add coordinator supervisor agent"
```

---

## Part 9: Register Agents on the Platform

Save each agent's DSL to the platform using `--file`. The CLI reads the `.abl` file, **automatically resolves and inlines any `file:` tool imports** from the `tools/` directory, then sends the fully self-contained DSL to the platform. The agent name is inferred from the `AGENT:` / `SUPERVISOR:` declaration — no `--agent-name` flag needed. If an agent record doesn't exist yet the CLI creates it automatically (upsert).

> **Upload order matters:** agents that reference other agents (via `HANDOFF` or `DELEGATE`) must be uploaded after those agents exist. Upload in this order: `hotel_booking` → `hotel_search` → `hotel_coordinator`.

```bash
# 1. Register the hotel booking agent first (no outbound handoffs to unknown agents)
agentcl platform agents save-dsl --file agents/hotel_booking.agent.abl

# 2. Register the hotel search agent (handoff to hotel_booking — now exists)
agentcl platform agents save-dsl --file agents/hotel_search.agent.abl

# 3. Register the coordinator supervisor last (references both)
agentcl platform agents save-dsl --file agents/hotel.supervisor.abl
```

Validate the package compiles correctly — all three agents are now registered so cross-agent references resolve:

```bash
agentcl platform validate-package --path .
```

Review the compiler's view of your agents:

```bash
agentcl platform package-model --path .
```

---

## Part 10: Create Version 1.0 and Deploy

Bundle your agents into a versioned release and deploy to the staging environment.

### Confirm your registered agent names

The `--agent-name` flag in all version and deployment commands must match the name the agent is **actually registered under** on the platform. This comes from the `AGENT:` or `SUPERVISOR:` declaration in the ABL file — `save-dsl` uses that declaration as the record name.

Check your registered names before proceeding:

```bash
agentcl platform agents list
```

The `name` field in the response is the exact string to use in all subsequent commands. In this tutorial the ABL files declare `hotel_search`, `hotel_booking`, and `hotel_coordinator`, so those are the names used below. Substitute with whatever your `agents list` output shows if different.

### Create versions for all three agents

Each agent needs its own version snapshot before you can bundle them into a deployment:

```bash
agentcl platform versions create \
  --agent-name hotel_search \
  --changelog "Initial release: hotel search with REST API tools"

agentcl platform versions create \
  --agent-name hotel_booking \
  --changelog "Initial release: hotel booking with confirmation gate"

agentcl platform versions create \
  --agent-name hotel_coordinator \
  --changelog "Initial release: supervisor routing search and booking agents"
```

Verify all versions were created:

```bash
agentcl platform versions list --agent-name hotel_search
agentcl platform versions list --agent-name hotel_booking
agentcl platform versions list --agent-name hotel_coordinator
```

All three should show version `1`. Note the numbers — you will reference them in the deployment manifest.

### Deploy to staging

```bash
agentcl platform deployments create \
  --label "v1.0 — staging" \
  --environment staging \
  --entry-agent-name hotel_coordinator \
  --agent-version-manifest '{"hotel_coordinator": 1, "hotel_search": 1, "hotel_booking": 1}'
```

---

## Part 11: Iterate — Make a Change and Release v1.1

Git-based iteration is the normal development cycle. Here is a complete loop.

### Step 1 — Make a change

Edit `agents/hotel_search.agent.abl` to improve the search presentation. For example, update the `present_options` flow step to show top 5 results with a side-by-side comparison table.

### Step 2 — Commit to git

```bash
git add agents/hotel_search.agent.abl
git commit -m "feat(search): show top 5 results with comparison table"
```

### Step 3 — Push the update to the platform

```bash
agentcl platform agents save-dsl --file agents/hotel_search.agent.abl
# Agent name (hotel_search) is inferred automatically from the AGENT: declaration
```

### Step 4 — Validate

```bash
agentcl platform validate-package --path .
```

### Step 5 — Create version 2

```bash
agentcl platform versions create \
  --agent-name hotel_search \
  --changelog "Show top 5 results with side-by-side comparison table"
```

Confirm version 2 exists before building the deployment manifest:

```bash
agentcl platform versions list --agent-name hotel_search
# Should show version 1 (original) and version 2 (new)
```

### Step 6 — Deploy the updated version

```bash
agentcl platform deployments create \
  --label "v1.1 — staging" \
  --environment staging \
  --entry-agent-name hotel_coordinator \
  --agent-version-manifest '{"hotel_coordinator": 1, "hotel_search": 2, "hotel_booking": 1}'
```

Notice that only `hotel_search` incremented to version 2 — the coordinator and booking agents stay at version 1. The platform tracks which agent versions are bundled in each deployment.

### Step 7 — Promote to production

Once staging is verified:

```bash
agentcl platform deployments create \
  --label "v1.1 — production" \
  --environment production \
  --entry-agent-name hotel_coordinator \
  --agent-version-manifest '{"hotel_coordinator": 1, "hotel_search": 2, "hotel_booking": 1}'
```

### Rollback if needed

```bash
# List deployments to find the ID of the previous working version
agentcl platform deployments list

# Rollback
agentcl platform deployments rollback \
  --deployment-id dep-prev-id \
  --confirm
```

---

## Part 12: Debug a Session

When something isn't working, use the `agentcl debug` commands to inspect what happened.

```bash
# Save a session ID to context so you don't repeat it
agentcl context set-session --session-id sess-xyz789

# Check the current agent state
agentcl debug get-current-state

# See what the agent did (execution trace)
agentcl debug get-span-tree --flat

# Find errors
agentcl debug get-errors --include-warnings

# Search for a specific event
agentcl debug traces --text "book_hotel" --limit 20

# Run a full diagnostic
agentcl debug diagnose --depth deep

# View the execution flow graph
agentcl debug get-flow-graph --format mermaid
```

---

## Part 13: Import and Export for Backup / Migration

Export the entire project as a portable archive:

```bash
# Preview what will be exported
agentcl platform import-export export-preview

# Export to a local directory
agentcl platform import-export export --path ./backup/v1.1

# Commit the export to git
git add backup/
git commit -m "chore: export project snapshot v1.1"
git push origin main
```

Import on a different workspace or platform instance:

```bash
agentcl context set-project --project-id proj-new-workspace

# Preview the import
agentcl platform import-export import-preview --path ./backup/v1.1

# Apply
agentcl platform import-export import \
  --path ./backup/v1.1 \
  --confirm
```

---

## Complete Project Structure

After following this tutorial, your repository looks like this:

```
hotel-booking-agent/
├── .gitignore
├── .arch/                           # gitignored — local CLI state, not committed
│   ├── credentials.json             # auth token for this project's server
│   └── state.json                   # serverUrl, tenantId, workspaceName, projectId
├── agents/
│   ├── hotel.supervisor.abl   # Supervisor — routes to specialists
│   ├── hotel_search.agent.abl       # Search agent with HTTP tools
│   └── hotel_booking.agent.abl      # Booking agent with confirmation gate
├── backup/
│   └── v1.1/                        # Platform export snapshot
└── tools/
    └── hotels-api.tools.abl         # Shared HTTP tool definitions
```

---

## Common `agentcl` Commands Cheatsheet

| Task | Command |
|---|---|
| Authenticate + save workspace | `agentcl platform connect --server-url <url>` |
| Show full context | `agentcl context show` |
| Save default project (at creation) | `agentcl platform projects create --name <name> --save-context` |
| Save default project (existing) | `agentcl context set-project --project-id <id>` |
| Save workspace manually | `agentcl context set-workspace --tenant-id <id> --workspace-name <name>` |
| Clear all saved context | `agentcl context clear` |
| Upload agent DSL | `agentcl platform agents save-dsl --file agents/my_agent.agent.abl` (resolves tool imports; name inferred from `AGENT:` declaration) |
| Validate package | `agentcl platform validate-package --path .` |
| Create version | `agentcl platform versions create --agent-name <name> --changelog "..."` |
| List versions | `agentcl platform versions list --agent-name <name>` |
| Deploy | `agentcl platform deployments create --environment staging --entry-agent-name <name> --agent-version-manifest '{...}'` |
| List deployments | `agentcl platform deployments list` |
| Rollback | `agentcl platform deployments rollback --deployment-id <id> --confirm` |
| Export project | `agentcl platform import-export export --path ./backup` |
| Debug session | `agentcl debug diagnose --depth deep` |
| View trace | `agentcl debug get-span-tree --flat` |

---

## Next Steps

- **Evaluations** — Run automated evals against your agents: `agentcl platform evals runs quick`
- **LLM Config** — Tune model settings per agent: `agentcl platform config get-llm-config`
- **Harness CI** — Integrate with Harness CI for automated deployments
- **ABL Reference** — Full language reference at [docs.kore.ai/agent-platform/abl-reference](https://docs.kore.ai/agent-platform/abl-reference/language-overview)
- **Orchestration Patterns** — Supervisor and adaptive network docs at [docs.kore.ai/agent-platform/ai-agents/supervisor](https://docs.kore.ai/agent-platform/ai-agents/supervisor/)

---

*Sources: [ABL Language Reference](https://docs.kore.ai/agent-platform/abl-reference/language-overview) · [Supervisor Pattern](https://docs.kore.ai/agent-platform/ai-agents/supervisor/) · [Adaptive Network](https://docs.kore.ai/agent-platform/ai-agents/adaptive-network/) · [App Deployment](https://docs.kore.ai/agent-platform/ai-agents/agentic-apps/deployment/app-deployment/)*
