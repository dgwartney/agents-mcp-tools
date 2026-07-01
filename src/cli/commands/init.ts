// src/cli/commands/init.ts
// agentcl init — scaffolds a new Arch Agent Platform project using the
// hotel booking multi-agent example as a concrete, validated starting point.

import { Command } from 'commander';
import { createInterface } from 'node:readline';
import { mkdirSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { basename, dirname } from 'node:path';
import { buildCliContext } from '../context.js';
import { writeCliState } from '../state.js';
import { platformProjects } from '../../tools/platform-projects.js';
import { platformWorkspaces } from '../../tools/platform-workspaces.js';

// ── Template files ────────────────────────────────────────────────────────────
// Exact, validated content from the hotel booking reference project.
// Embedded as strings so the binary is fully self-contained after npm link.

export const TEMPLATE_FILES: Record<string, string> = {
  '.gitignore': `.arch/
node_modules/
*.env
.env.*
`,

  'agents/hotel_search.agent.abl': `AGENT: hotel_search
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
`,

  'agents/hotel_booking.agent.abl': `AGENT: hotel_booking
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
`,

  'agents/hotel.supervisor.abl': `SUPERVISOR: hotel_coordinator
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

ON_START:
  RESPOND: |
    Welcome! I'm your hotel booking assistant. I can help you:
    - 🔍 Search and compare hotels by destination and dates
    - 📅 Book a room and confirm your reservation

    What would you like to do today?

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

ON_ERROR:
  routing_failure:
    RESPOND: "I want to make sure I connect you with the right specialist. Are you looking to search for hotels, or do you already know which hotel you would like to book?"
    RETRY: 1
`,

  'tools/hotels-api.tools.abl': `TOOLS:
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
`,

  'Makefile': `# Generic Arch Agent Platform Makefile
#
# Auto-discovers all *.agent.abl, *.supervisor.abl, and *.tools.abl files.
# No project-specific names are hardcoded — works for any project layout.
# Versions are read from the VERSION: field in each .abl file.

SHELL       := /bin/bash
.SHELLFLAGS := -euo pipefail -c

AGENTCL := agentcl

ifneq ($(wildcard env.sh),)
  export AGENTS_URL ?= $(shell . ./env.sh 2>/dev/null && echo "$$AGENTS_URL")
endif

AGENT_FILES      := $(sort $(wildcard agents/*.agent.abl))
SUPERVISOR_FILES := $(sort $(wildcard agents/*.supervisor.abl))
TOOLS_FILES      := $(sort $(wildcard tools/*.tools.abl))
ALL_AGENT_FILES  := $(AGENT_FILES) $(SUPERVISOR_FILES)

ENTRY_AGENT := $(if $(SUPERVISOR_FILES),$(shell \\
  grep -hm1 '^SUPERVISOR:' $(SUPERVISOR_FILES) 2>/dev/null \\
  | awk '{print $$2}' | tr -d '"' | head -1))

MANIFEST_JSON := $(shell \\
  printf '{'; \\
  sep=''; \\
  for f in $(ALL_AGENT_FILES); do \\
    n=$$(grep -m1 '^AGENT:\\|^SUPERVISOR:' "$$f" 2>/dev/null \\
          | awk '{print $$2}' | tr -d '"'); \\
    v=$$(grep -m1 '^VERSION:' "$$f" 2>/dev/null \\
          | sed "s/VERSION:[[:space:]]*//" | tr -d '"'"'"' '); \\
    if [ -n "$$n" ] && [ -n "$$v" ]; then \\
      printf '%s"%s":"%s"' "$$sep" "$$n" "$$v"; \\
      sep=','; \\
    fi; \\
  done; \\
  printf '}')

STAMP_DIR          := .arch/stamps
STAMPS_TOOLS       := $(foreach f,$(TOOLS_FILES),$(STAMP_DIR)/$(notdir $(f)).stamp)
STAMPS_AGENTS      := $(foreach f,$(AGENT_FILES),$(STAMP_DIR)/$(notdir $(f)).stamp)
STAMPS_SUPERVISORS := $(foreach f,$(SUPERVISOR_FILES),$(STAMP_DIR)/$(notdir $(f)).stamp)

CHANGELOG ?=

.DEFAULT_GOAL := help

.PHONY: all
all: tools agents validate  ## Sync all changed tools and agents, then validate

$(STAMP_DIR):
\t@mkdir -p $@

.PHONY: tools
tools: $(STAMPS_TOOLS)  ## Import all *.tools.abl files into Tool Library if changed

define TOOLS_RULE
$(STAMP_DIR)/$(notdir $(1)).stamp: $(1) | $(STAMP_DIR)
\t@echo "▶  Importing tools from $(1)"
\t@$(AGENTCL) platform tools import-abl --file $(1)
\t@touch $$@
endef
$(foreach f,$(TOOLS_FILES),$(eval $(call TOOLS_RULE,$(f))))

.PHONY: agents
agents: $(STAMPS_AGENTS) $(STAMPS_SUPERVISORS)  ## Upload changed agents (agents before supervisors)

define AGENT_RULE
$(STAMP_DIR)/$(notdir $(1)).stamp: $(1) | $(STAMP_DIR)
\t@echo "▶  Uploading $(notdir $(1))"
\t@$(AGENTCL) platform agents save-dsl --file $(1)
\t@touch $$@
endef
$(foreach f,$(AGENT_FILES),$(eval $(call AGENT_RULE,$(f))))

define SUPERVISOR_RULE
$(STAMP_DIR)/$(notdir $(1)).stamp: $(1) $(STAMPS_AGENTS) | $(STAMP_DIR)
\t@echo "▶  Uploading supervisor $(notdir $(1))"
\t@$(AGENTCL) platform agents save-dsl --file $(1)
\t@touch $$@
endef
$(foreach f,$(SUPERVISOR_FILES),$(eval $(call SUPERVISOR_RULE,$(f))))

.PHONY: validate
validate:  ## Validate local package against platform compiler
\t@echo "▶  Validating package"
\t@$(AGENTCL) platform validate-package --path .

.PHONY: versions
versions: agents  ## Snapshot all agents as versions  (CHANGELOG='...' required)
\t@[ -n "$(CHANGELOG)" ] || { echo "❌  Usage: make versions CHANGELOG='message'"; exit 1; }
\t@echo "▶  Creating versions: $(CHANGELOG)"
\t@for f in $(ALL_AGENT_FILES); do \\
\t  name=$$(grep -m1 '^AGENT:\\|^SUPERVISOR:' "$$f" | awk '{print $$2}' | tr -d '"'); \\
\t  echo "  $$name"; \\
\t  $(AGENTCL) platform versions create --agent-name "$$name" --changelog "$(CHANGELOG)"; \\
\tdone

.PHONY: deploy-staging
deploy-staging: agents  ## Deploy current ABL versions to staging
\t@echo "▶  Deploying to staging"
\t@$(AGENTCL) platform deployments create \\
\t\t--label "staging" \\
\t\t--environment staging \\
\t\t--entry-agent-name "$(ENTRY_AGENT)" \\
\t\t--agent-version-manifest '$(MANIFEST_JSON)'

.PHONY: deploy-production
deploy-production:  ## Deploy current ABL versions to production
\t@echo "▶  Deploying to production"
\t@$(AGENTCL) platform deployments create \\
\t\t--label "production" \\
\t\t--environment production \\
\t\t--entry-agent-name "$(ENTRY_AGENT)" \\
\t\t--agent-version-manifest '$(MANIFEST_JSON)'

.PHONY: status
status:  ## Show local versions, platform deployments, and agent version lists
\t@echo "=== Local ABL versions ==="
\t@for f in $(ALL_AGENT_FILES); do \\
\t  name=$$(grep -m1 '^AGENT:\\|^SUPERVISOR:' "$$f" | awk '{print $$2}' | tr -d '"'); \\
\t  ver=$$(grep -m1 '^VERSION:' "$$f" | sed "s/VERSION:[[:space:]]*//" | tr -d '"'"'"' '); \\
\t  printf "  %-30s %s\\n" "$$name" "$$ver"; \\
\tdone
\t@echo ""
\t@echo "=== Platform deployments ==="
\t@$(AGENTCL) platform deployments list

.PHONY: context
context:  ## Show agentcl context (.arch/state.json)
\t@$(AGENTCL) context show

.PHONY: connect
connect:  ## Connect / re-authenticate to the platform
\t@$(AGENTCL) platform connect

.PHONY: clean
clean:  ## Remove stamps — forces full re-upload on next make all
\t@rm -rf $(STAMP_DIR)
\t@echo "✓  Stamps cleared"

.PHONY: help
help:  ## Show this help
\t@echo "Arch Agent Platform — $(notdir $(CURDIR))"
\t@echo ""
\t@echo "  Discovered:"
\t@printf "    Agents:      %s\\n" "$(or $(AGENT_FILES),(none))"
\t@printf "    Supervisors: %s\\n" "$(or $(SUPERVISOR_FILES),(none))"
\t@printf "    Tools:       %s\\n" "$(or $(TOOLS_FILES),(none))"
\t@printf "    Entry agent: %s\\n" "$(or $(ENTRY_AGENT),(no supervisor found))"
\t@echo ""
\t@echo "  Local versions:"
\t@for f in $(ALL_AGENT_FILES); do \\
\t  name=$$(grep -m1 '^AGENT:\\|^SUPERVISOR:' "$$f" | awk '{print $$2}' | tr -d '"'); \\
\t  ver=$$(grep -m1 '^VERSION:' "$$f" | sed "s/VERSION:[[:space:]]*//" | tr -d '"'"'"' '); \\
\t  printf "    %-30s %s\\n" "$$name" "$$ver"; \\
\tdone
\t@echo ""
\t@echo "Usage: make [target]"
\t@echo ""
\t@echo "Targets:"
\t@grep -E '^[a-zA-Z_-]+:.*##' $(MAKEFILE_LIST) \\
\t\t| awk 'BEGIN {FS = ":.*##"}; {printf "  \\033[36m%-22s\\033[0m %s\\n", $$1, $$2}'
\t@echo ""
\t@echo "Examples:"
\t@echo "  make all                              # sync everything changed"
\t@echo "  make versions CHANGELOG='feat: ...'  # snapshot current versions"
\t@echo "  make deploy-staging"
\t@echo "  make clean && make all               # force full re-upload"
`,
};

// ── README (generated with project name + description) ────────────────────────

function readmeTemplate(projectName: string, projectDescription: string): string {
  return `# ${projectName}

${projectDescription}

## What's inside

This project was scaffolded from the Arch Agent Platform hotel booking template.
It includes a working multi-agent system you can adapt to your own domain:

| File | Agent | Purpose |
|---|---|---|
| \`agents/hotel.supervisor.abl\` | \`hotel_coordinator\` | Routes user intent to the right specialist |
| \`agents/hotel_search.agent.abl\` | \`hotel_search\` | Searches and compares hotels |
| \`agents/hotel_booking.agent.abl\` | \`hotel_booking\` | Collects guest details and confirms bookings |
| \`tools/hotels-api.tools.abl\` | — | HTTP tool specifications (Tool Library source) |

## Customising for your domain

1. **Update GOALs** — edit the \`GOAL:\` section in each \`.agent.abl\` file to match your domain
2. **Replace HTTP tools** — edit \`tools/hotels-api.tools.abl\` with your API endpoints, then \`make tools\`
3. **Rename agents** — update \`AGENT:\` declarations and file names to match your use case
4. **Update the supervisor** — adjust routing rules in \`agents/hotel.supervisor.abl\`

## Getting started

\`\`\`bash
# Connect to the platform (first time)
agentcl platform connect --server-url https://agents.kore.ai

# Create a platform project and save the ID
agentcl platform projects create --name "${projectName}" --save-context

# Upload everything
make all

# Deploy to staging
make deploy-staging
\`\`\`

## Common commands

| Command | Action |
|---|---|
| \`make all\` | Upload changed tools and agents, then validate |
| \`make tools\` | Re-import tools into Tool Library |
| \`make agents\` | Upload only changed agents |
| \`make versions CHANGELOG='...'\` | Snapshot current versions |
| \`make deploy-staging\` | Deploy to staging |
| \`make deploy-production\` | Deploy to production |
| \`make status\` | Show platform deployments and local versions |
| \`agentcl context show\` | Show saved project context |

## Architecture

\`\`\`
User ──► hotel_coordinator (supervisor)
              │
              ├──► hotel_search  (searches, presents options)
              │         │
              │         └──handoff──► hotel_booking (collects details, confirms)
              │                            │
              └────────────────────────────┘  (handoff back if room unavailable)
\`\`\`
`;
}

// ── Interactive prompt helper ─────────────────────────────────────────────────

async function ask(
  rl: ReturnType<typeof createInterface>,
  question: string,
  defaultVal?: string,
): Promise<string> {
  return new Promise((resolve) => {
    const hint = defaultVal ? ` [${defaultVal}]` : '';
    rl.question(`  ${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultVal || '');
    });
  });
}

// ── Main init action ──────────────────────────────────────────────────────────

async function runInit(withPlatform: boolean, bare: boolean): Promise<void> {
  const cwd = process.cwd();
  const defaultName = basename(cwd)
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const existing = readdirSync(cwd).filter((f) => !f.startsWith('.'));
  if (existing.length > 0) {
    console.log(`\n⚠   Directory is not empty (${existing.slice(0, 3).join(', ')}${existing.length > 3 ? '...' : ''})`);
    console.log('    Files will be created/overwritten. Ctrl-C to cancel.\n');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  let projectName: string;
  let projectDescription: string;
  let serverUrl = '';

  try {
    console.log('\n🚀  Arch Agent Platform — Initialize Project');
    if (bare) {
      console.log('    Mode: bare (directories + Makefile only, no .abl files)\n');
    } else {
      console.log('    Template: Hotel Booking (supervisor + 2 agents + HTTP tools)\n');
    }

    projectName = await ask(rl, 'Project name', defaultName);
    projectDescription = await ask(rl, 'Description',
      bare ? 'Arch Agent Platform project' : 'Hotel booking multi-agent application');
    if (withPlatform) {
      serverUrl = await ask(rl, 'Platform URL', process.env.AGENTS_URL ?? 'https://agents.kore.ai');
    }
  } finally {
    rl.close();
  }

  // ── Write template files ─────────────────────────────────────────────────────
  console.log('\nCreating project files...');

  mkdirSync('agents', { recursive: true });
  mkdirSync('tools', { recursive: true });

  // In bare mode skip .abl files — only write infrastructure files (Makefile, .gitignore)
  const filesToWrite = bare
    ? Object.entries(TEMPLATE_FILES).filter(([p]) => !p.endsWith('.abl'))
    : Object.entries(TEMPLATE_FILES);

  for (const [filePath, content] of filesToWrite) {
    const dir = dirname(filePath);
    if (dir !== '.') mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  ✓  ${filePath}`);
  }

  if (bare) {
    console.log('  ℹ  agents/   (empty — add your .agent.abl and .supervisor.abl files here)');
    console.log('  ℹ  tools/    (empty — add your .tools.abl files here)');
  }

  writeFileSync('README.md', readmeTemplate(projectName, projectDescription), 'utf-8');
  console.log(`  ✓  README.md`);

  // ── Git init ─────────────────────────────────────────────────────────────────
  console.log('\nInitialising git...');
  if (!existsSync(`${cwd}/.git`)) {
    execSync('git init -q', { stdio: 'pipe' });
    console.log('  ✓  git init');
  } else {
    console.log('  ℹ  git already initialised');
  }
  execSync('git add .', { stdio: 'pipe' });
  // Use execFileSync with an argument array — projectName is user input and must not
  // be interpolated into a shell string (shell injection risk via special characters).
  execFileSync('git', ['commit', '-q', '-m', `chore: initialize ${projectName} agent project`], {
    stdio: 'pipe',
  });
  console.log(`  ✓  Initial commit`);

  // ── Platform setup (opt-in via --platform) ────────────────────────────────────
  if (withPlatform) {
    console.log('\nConnecting to platform...');
    // Build context from the server URL provided at the prompt — this ensures the
    // project is created in the same workspace the user is already authenticated to.
    const ctx = buildCliContext(serverUrl);
    let authTenantId: string | undefined;
    let authWorkspaceName: string | undefined;
    try {
      const authResult = await ctx.authenticate();
      console.log(`  ✓  Authenticated (${authResult.method})`);
      // Extract tenantId from the JWT so we can show which workspace the project goes into
      const token = ctx.httpClient.getAuthToken();
      if (token) {
        try {
          const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Record<string, unknown>;
          authTenantId = payload.tenantId as string | undefined;
        } catch { /* ignore */ }
      }
      // Fetch human-readable workspace name
      try {
        const wsResult = await platformWorkspaces({ action: 'current' }, ctx);
        const ws = JSON.parse(wsResult) as { success?: boolean; workspaceName?: string };
        if (ws.success && ws.workspaceName) authWorkspaceName = ws.workspaceName;
      } catch { /* best-effort */ }
      const wsLabel = authWorkspaceName ?? authTenantId;
      if (wsLabel) console.log(`  ℹ  Workspace: ${wsLabel}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗  Authentication failed: ${msg}`);
      console.error('\n  Run `agentcl platform connect` manually, then `make all`.');
      process.exit(1);
    }

    console.log('\nCreating platform project...');
    try {
      const result = await platformProjects(
        { action: 'create', name: projectName, description: projectDescription },
        ctx,
      );
      const parsed = JSON.parse(result) as { project?: { id?: string } };
      const projectId = parsed.project?.id;
      if (projectId) {
        writeCliState({ serverUrl, projectId, tenantId: authTenantId, workspaceName: authWorkspaceName });
        console.log(`  ✓  Project "${projectName}" created (${projectId})`);
        console.log(`  ✓  Saved to .arch/state.json`);
        execSync('git add .arch/ 2>/dev/null || true', { stdio: 'pipe' });
        execSync('git commit -q --allow-empty -m "chore: save platform project context" 2>/dev/null || true', { stdio: 'pipe' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ✗  Project creation failed: ${msg}`);
      console.error('  Run `agentcl platform projects create --name "..." --save-context` manually.');
    }

    // Only import tools when the hotel booking template was scaffolded
    if (!bare) {
      console.log('\nImporting tools into Tool Library...');
      try {
        execSync('agentcl platform tools import-abl --file tools/hotels-api.tools.abl', {
          stdio: 'pipe',
        });
        console.log('  ✓  4 tools registered: search_hotels, get_hotel, check_availability, book_hotel');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗  Tool import failed: ${msg}`);
        console.error('  Run `agentcl platform tools import-abl --file tools/hotels-api.tools.abl` manually.');
      }
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────────
  const nextSteps = bare
    ? withPlatform
      ? `  1. Add your .agent.abl files to agents/
  2. Add your .tools.abl files to tools/
  3. agentcl platform tools import-abl --file tools/<your-api>.tools.abl
  4. make all
  5. make deploy-staging`
      : `  1. Add your .agent.abl files to agents/
  2. Add your .tools.abl files to tools/
  3. agentcl platform connect --server-url https://agents.kore.ai
  4. agentcl platform projects create --name "${projectName}" --save-context
  5. agentcl platform tools import-abl --file tools/<your-api>.tools.abl
  6. make all
  7. make deploy-staging`
    : withPlatform
      ? `  1. Update tools/hotels-api.tools.abl — set base_url to your Hotels API
  2. make all           — upload agents to the platform
  3. make deploy-staging`
      : `  1. agentcl platform connect --server-url https://agents.kore.ai
  2. agentcl platform projects create --name "${projectName}" --save-context
  3. make all
  4. make deploy-staging`;

  console.log(`
✅  Done!

  Next steps:
${nextSteps}

  Adapt to your domain:
    • Edit GOAL: in each .agent.abl file
    • Replace hotel tools with your API endpoints in tools/hotels-api.tools.abl

  Useful commands:
    agentcl context show   — saved project, workspace, server URL
    make help              — all make targets
`);
}

// ── Register ──────────────────────────────────────────────────────────────────

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialise a new Arch Agent Platform project')
    .option('--platform', 'Also authenticate, create the platform project, and import tools', false)
    .option('--bare', 'Scaffold directories and Makefile only — no .abl template files', false)
    .action((opts) => {
      runInit(opts.platform as boolean, opts.bare as boolean).catch((err: unknown) => {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      });
    });
}
