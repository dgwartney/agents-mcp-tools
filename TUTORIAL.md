# Tutorial: Build a Multi-Agent Project from Scratch

This tutorial walks you through creating a multi-agent hotel booking application on the Arch Agent Platform — from installing the CLI to deploying versioned agents with HTTP tools.

**What you will build:**

```
hotel-booking-agent/
├── agents/
│   ├── coordinator.supervisor.abl   # Routes to specialist agents
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

## Part 5: Define the HTTP Tools

Create a shared tools file that all agents import. This defines the hotel REST API calls.

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
    hints:
      cacheable: true
      latency: medium

  get_hotel(hotel_id: string) -> {id: string, name: string, description: string, amenities: string[], rating: number, price_per_night: number}
    description: "Get full details for a specific hotel"
    type: http
    endpoint: "/hotels/{hotel_id}"
    method: GET
    hints:
      cacheable: true
      latency: fast

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
    hints:
      side_effects: true
      requires_auth: true
```

> **Note:** Replace `https://api.example-hotels.com/v1` with your actual Hotels API base URL. Store your API key using the platform's credential store — never commit it to git.

Commit this file:

```bash
git add tools/hotels-api.tools.abl
git commit -m "feat: add hotels API tool definitions"
```

> **How tools are compiled:** The `.tools.abl` file is not uploaded separately. It is compiled automatically by the platform when you upload each agent's DSL in Part 9 — agents import it via the `file:` directive. You do not need to register it independently.

---

## Part 6: Write the Hotel Search Agent

This agent searches hotels, filters results, and presents options to the user.

**`agents/hotel_search.agent.abl`**

```yaml
AGENT: Hotel_Search
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
  file: "../tools/hotels-api.tools.abl" [search_hotels, get_hotel, check_availability]

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
  - TO: Hotel_Booking
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
AGENT: Hotel_Booking
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
  file: "../tools/hotels-api.tools.abl" [book_hotel, check_availability]

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
  - TO: Hotel_Search
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

**`agents/coordinator.supervisor.abl`**

```yaml
SUPERVISOR: Hotel_Coordinator
VERSION: "1.0.0"
DESCRIPTION: "Routes hotel queries to the appropriate specialist agent"

GOAL: |
  Detect user intent and route to the right specialist:
  - Hotel_Search for browsing, comparing, and researching hotels
  - Hotel_Booking for completing reservations

PERSONA: |
  Professional travel coordinator. Friendly, efficient, and transparent.
  Routes quickly without making the user repeat themselves.

AGENTS:
  - REF: ./hotel_search.agent.abl
    ALIAS: Hotel_Search
    CAPABILITIES: [hotel_search, compare_hotels, check_availability]

  - REF: ./hotel_booking.agent.abl
    ALIAS: Hotel_Booking
    CAPABILITIES: [book_hotel, process_reservation, confirm_booking]

BEHAVIOR:
  canRespondDirectly: true
  allowedDirectActions: [greet, clarify_intent, answer_faq]
  forbiddenActions: [search_hotels, book_hotel]

ROUTING:
  - NAME: search_route
    PRIORITY: 10
    WHEN: intent.category == "hotel_search" OR intent.category == "browse"
    THEN: ROUTE_TO Hotel_Search

  - NAME: booking_route
    PRIORITY: 10
    WHEN: intent.category == "book_hotel" OR intent.category == "reservation"
    THEN: ROUTE_TO Hotel_Booking

  - NAME: default_route
    PRIORITY: 100
    WHEN: true
    THEN:
      INTENT_MATCH:
        - INTENTS: [find_hotel, search, browse, compare, recommend]
          ACTION: ROUTE_TO Hotel_Search
        - INTENTS: [book, reserve, confirm, pay, checkout]
          ACTION: ROUTE_TO Hotel_Booking
        FALLBACK: ROUTE_TO Hotel_Search

HANDOFF:
  - TO: Hotel_Search
    WHEN: intent.category IN ["hotel_search", "browse", "compare"]
    CONTEXT:
      pass: []
      summary: "User wants to search or browse hotels"
    RETURN: false

  - TO: Hotel_Booking
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
git add agents/coordinator.supervisor.abl
git commit -m "feat: add coordinator supervisor agent"
```

---

## Part 9: Register Agents on the Platform

Save each agent's DSL to the platform. The agent name is inferred from the `AGENT:` / `SUPERVISOR:` declaration — no `--agent-name` flag needed. If an agent record doesn't exist yet the CLI creates it automatically (upsert).

> **Upload order matters:** agents that reference other agents (via `HANDOFF` or `DELEGATE`) must be uploaded after those agents exist. Upload in this order: `Hotel_Booking` → `Hotel_Search` → `Hotel_Coordinator`.

```bash
# 1. Register the hotel booking agent first (no outbound handoffs to unknown agents)
agentcl platform agents save-dsl \
  --dsl-content "$(cat agents/hotel_booking.agent.abl)"

# 2. Register the hotel search agent (handoff to Hotel_Booking — now exists)
agentcl platform agents save-dsl \
  --dsl-content "$(cat agents/hotel_search.agent.abl)"

# 3. Register the coordinator supervisor last (references both)
agentcl platform agents save-dsl \
  --dsl-content "$(cat agents/coordinator.supervisor.abl)"
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

### Create versions for all three agents

Each agent needs its own version snapshot before you can bundle them into a deployment:

```bash
agentcl platform versions create \
  --agent-name Hotel_Search \
  --changelog "Initial release: hotel search with REST API tools"

agentcl platform versions create \
  --agent-name Hotel_Booking \
  --changelog "Initial release: hotel booking with confirmation gate"

agentcl platform versions create \
  --agent-name Hotel_Coordinator \
  --changelog "Initial release: supervisor routing search and booking agents"
```

Verify all versions were created:

```bash
agentcl platform versions list --agent-name Hotel_Search
agentcl platform versions list --agent-name Hotel_Booking
agentcl platform versions list --agent-name Hotel_Coordinator
```

All three should show version `1`. Note the numbers — you will reference them in the deployment manifest.

### Deploy to staging

```bash
agentcl platform deployments create \
  --label "v1.0 — staging" \
  --environment staging \
  --entry-agent-name Hotel_Coordinator \
  --agent-version-manifest '{"Hotel_Coordinator": 1, "Hotel_Search": 1, "Hotel_Booking": 1}'
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
agentcl platform agents save-dsl \
  --dsl-content "$(cat agents/hotel_search.agent.abl)"
# Agent name (Hotel_Search) is inferred automatically from the AGENT: declaration
```

### Step 4 — Validate

```bash
agentcl platform validate-package --path .
```

### Step 5 — Create version 2

```bash
agentcl platform versions create \
  --agent-name Hotel_Search \
  --changelog "Show top 5 results with side-by-side comparison table"
```

Confirm version 2 exists before building the deployment manifest:

```bash
agentcl platform versions list --agent-name Hotel_Search
# Should show version 1 (original) and version 2 (new)
```

### Step 6 — Deploy the updated version

```bash
agentcl platform deployments create \
  --label "v1.1 — staging" \
  --environment staging \
  --entry-agent-name Hotel_Coordinator \
  --agent-version-manifest '{"Hotel_Coordinator": 1, "Hotel_Search": 2, "Hotel_Booking": 1}'
```

Notice that only `Hotel_Search` incremented to version 2 — the coordinator and booking agents stay at version 1. The platform tracks which agent versions are bundled in each deployment.

### Step 7 — Promote to production

Once staging is verified:

```bash
agentcl platform deployments create \
  --label "v1.1 — production" \
  --environment production \
  --entry-agent-name Hotel_Coordinator \
  --agent-version-manifest '{"Hotel_Coordinator": 1, "Hotel_Search": 2, "Hotel_Booking": 1}'
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
│   ├── coordinator.supervisor.abl   # Supervisor — routes to specialists
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
| Upload agent DSL | `agentcl platform agents save-dsl --dsl-content "$(cat file.abl)"` (name inferred from `AGENT:` declaration) |
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
