/**
 * Agent ABL Documentation
 *
 * Embedded documentation for Claude Code to understand agent ABL syntax,
 * trace events, and debugging techniques.
 */

// =============================================================================
// ABL OVERVIEW
// =============================================================================

export const ABL_OVERVIEW = `# Agent ABL Overview

The Agent Blueprint Language (ABL) is a declarative language for defining AI agents — conversational, system-driven, or hybrid.
It supports three agent types, each with different execution models.

## Agent Types

| Type | Description | Use Case |
|------|-------------|----------|
| **scripted** | Follows predefined flow with explicit steps | Forms, wizards, structured conversations |
| **reasoning** | Uses LLM judgment to decide actions | Open-ended tasks, problem-solving |
| **supervisor** | Delegates to specialized child agents | Complex systems, multi-domain support |

## Basic Structure

\`\`\`yaml
agent:
  name: my_agent
  type: scripted | reasoning | supervisor
  model: claude-3-5-sonnet

  # Type-specific configuration follows...
\`\`\`

## Key Concepts

- **Context**: Persistent state stored during conversation
- **Tools**: External functions the agent can call
- **Constraints**: Rules that limit agent behavior
- **Transitions**: Conditions for moving between states
`;

// =============================================================================
// SCRIPTED AGENTS
// =============================================================================

export const ABL_SCRIPTED = `# Scripted Agents

Scripted agents follow a predefined flow with explicit steps and transitions.
They are ideal for structured conversations like booking flows, forms, or wizards.

## Structure

\`\`\`yaml
agent:
  name: booking_agent
  type: scripted
  model: claude-3-5-sonnet

  system_prompt: |
    You are a helpful booking assistant.

  flow:
    greeting:
      prompt: "Welcome! How can I help you today?"
      transitions:
        - to: collect_info
          when: user_wants_booking

    collect_info:
      collect:
        - name: { type: string, required: true }
        - email: { type: string, format: email, required: true }
        - date: { type: date, required: true }
      on_complete: process_booking
      on_error: handle_error

    process_booking:
      call: create_booking
      with:
        name: "{{context.name}}"
        email: "{{context.email}}"
        date: "{{context.date}}"
      transitions:
        - to: confirmation
          when: booking_success
        - to: handle_error
          when: booking_failed

    confirmation:
      respond: |
        Your booking is confirmed!
        Reference: {{context.booking_id}}
      terminal: true
\`\`\`

## Flow Steps

### prompt
Displays a message and waits for user input.
\`\`\`yaml
step_name:
  prompt: "What would you like to do?"
\`\`\`

### collect
Gathers multiple fields from the user.
\`\`\`yaml
collect_info:
  collect:
    - field_name: { type: string, required: true, description: "Help text" }
    - another_field: { type: number, min: 1, max: 100 }
\`\`\`

### call
Invokes a tool/function.
\`\`\`yaml
process:
  call: tool_name
  with:
    param: "{{context.value}}"
\`\`\`

### respond
Sends a response to the user.
\`\`\`yaml
finish:
  respond: "Thank you for your request!"
  terminal: true  # Marks conversation end
\`\`\`

### delegate
Hands off to another agent.
\`\`\`yaml
escalate:
  delegate: support_agent
  context:
    reason: "{{context.escalation_reason}}"
\`\`\`

## Transitions

Transitions define how to move between steps:

\`\`\`yaml
transitions:
  - to: next_step
    when: condition_name
  - to: fallback_step  # No condition = default
\`\`\`

### Built-in Conditions
- \`user_wants_*\`: Intent detection
- \`context.field\`: Check if field is set
- \`context.field == value\`: Equality check
- \`tool_success\`: Last tool call succeeded
- \`tool_failed\`: Last tool call failed

## Common Issues

### Infinite Loop in Collect Step
**Symptom**: Same step repeating indefinitely
**Cause**: Required fields never set in context
**Debug**: Check trace events for \`dsl_collect\` and verify fields are being stored
`;

// =============================================================================
// REASONING AGENTS
// =============================================================================

export const ABL_REASONING = `# Reasoning Agents

Reasoning agents use LLM judgment to decide which actions to take.
They are ideal for open-ended tasks and problem-solving.

## Structure

\`\`\`yaml
agent:
  name: research_agent
  type: reasoning
  model: claude-3-5-sonnet

  system_prompt: |
    You are a research assistant. Help users find information
    and answer questions accurately.

  tools:
    - name: search_web
      description: Search the web for information
      parameters:
        query: { type: string, required: true }

    - name: read_document
      description: Read and analyze a document
      parameters:
        url: { type: string, required: true }

  constraints:
    - name: cite_sources
      description: Always cite sources for claims
      enforcement: strict

    - name: no_harmful_content
      description: Never generate harmful content
      enforcement: block

  goals:
    - Provide accurate, well-researched answers
    - Cite sources for all factual claims
    - Ask clarifying questions when needed
\`\`\`

## Tools

Tools define actions the agent can take:

\`\`\`yaml
tools:
  - name: tool_name
    description: What the tool does (shown to LLM)
    parameters:
      param1: { type: string, required: true }
      param2: { type: number, default: 10 }
    returns: { type: object }
\`\`\`

### Parameter Types
- \`string\`: Text value
- \`number\`: Numeric value
- \`boolean\`: True/false
- \`array\`: List of values
- \`object\`: Structured data

## Constraints

Constraints limit what the agent can do:

\`\`\`yaml
constraints:
  - name: constraint_name
    description: Human-readable description
    condition: "context.value < 1000"  # Optional condition
    enforcement: strict | warn | block
\`\`\`

### Enforcement Levels
- **strict**: Fail if violated
- **warn**: Log warning but continue
- **block**: Prevent action entirely

## Goals

Goals guide the agent's reasoning:

\`\`\`yaml
goals:
  - Primary objective description
  - Secondary objective
  - Behavioral guidance
\`\`\`

## Debugging Tips

### Tool Not Being Called
- Check tool description - LLM must understand when to use it
- Verify parameters match what tool expects
- Look for \`decision\` trace events to see LLM reasoning

### Constraint Violations
- Check \`constraint_check\` trace events
- Review constraint conditions
- Verify context has expected values
`;

// =============================================================================
// SUPERVISOR AGENTS
// =============================================================================

export const ABL_SUPERVISOR = `# Supervisor Agents

Supervisor agents manage and delegate to specialized child agents.
They are ideal for complex systems with multiple domains.

## Structure

\`\`\`yaml
agent:
  name: customer_service_supervisor
  type: supervisor
  model: claude-3-5-sonnet

  system_prompt: |
    You are a customer service supervisor. Route customer
    requests to the appropriate specialist.

  agents:
    - name: billing_agent
      path: ./billing-agent.yaml
      description: Handles billing and payment issues

    - name: technical_agent
      path: ./technical-agent.yaml
      description: Handles technical support

    - name: sales_agent
      path: ./sales-agent.yaml
      description: Handles sales inquiries

  routing:
    strategy: llm | rules | hybrid

    rules:
      - pattern: "bill|payment|charge|invoice"
        delegate_to: billing_agent
      - pattern: "error|bug|crash|not working"
        delegate_to: technical_agent
      - pattern: "buy|purchase|pricing|plan"
        delegate_to: sales_agent

    default: technical_agent

  escalation:
    - condition: agent_stuck
      action: retry_with_context
    - condition: user_frustrated
      action: human_handoff
\`\`\`

## Child Agent Configuration

\`\`\`yaml
agents:
  - name: unique_name
    path: ./path/to/agent.yaml  # Or inline definition
    description: When to use this agent
    context_mapping:
      # Pass context to child
      customer_id: "{{context.user.id}}"
\`\`\`

## Routing Strategies

### llm (Default)
LLM decides which agent to use based on descriptions.
\`\`\`yaml
routing:
  strategy: llm
\`\`\`

### rules
Pattern matching routes to agents.
\`\`\`yaml
routing:
  strategy: rules
  rules:
    - pattern: "regex pattern"
      delegate_to: agent_name
\`\`\`

### hybrid
Rules first, LLM as fallback.
\`\`\`yaml
routing:
  strategy: hybrid
  rules:
    - pattern: "known pattern"
      delegate_to: agent_name
  fallback: llm
\`\`\`

## Escalation Handling

\`\`\`yaml
escalation:
  - condition: agent_stuck
    action: retry_with_context | escalate_up | human_handoff
  - condition: max_turns_exceeded
    action: summarize_and_handoff
\`\`\`

### Conditions
- \`agent_stuck\`: Child agent cannot progress
- \`user_frustrated\`: Detected user frustration
- \`max_turns_exceeded\`: Too many back-and-forth
- \`constraint_violated\`: Child violated constraint

## Debugging Tips

### Wrong Agent Selected
- Check \`delegate_start\` trace events
- Review routing rules and patterns
- Verify agent descriptions are clear

### Escalation Cascade
- Look for multiple \`escalation\` events
- Check if any agent can handle the request
- May need to add fallback handling
`;

// =============================================================================
// TRACE EVENTS
// =============================================================================

export const TRACE_EVENTS = `# Trace Event Reference

Trace events record everything that happens during agent execution.
Understanding these events is key to effective debugging.

## Event Types

### Agent Lifecycle

| Event | Description |
|-------|-------------|
| \`agent_enter\` | Agent started processing |
| \`agent_exit\` | Agent finished processing |

### Flow Events (Scripted Agents)

| Event | Description |
|-------|-------------|
| \`flow_step_enter\` | Entered a flow step |
| \`flow_step_exit\` | Exited a flow step |
| \`flow_transition\` | Transitioned between steps |

### DSL Operations

| Event | Description |
|-------|-------------|
| \`dsl_collect\` | Collecting field from user |
| \`dsl_prompt\` | Sending prompt to user |
| \`dsl_respond\` | Sending response to user |
| \`dsl_set\` | Setting context value |
| \`dsl_call\` | Calling a tool |
| \`dsl_on_input\` | Processing user input |

### LLM Interactions

| Event | Description |
|-------|-------------|
| \`llm_call\` | Called the language model |
| \`decision\` | LLM made a decision |

### Tool Operations

| Event | Description |
|-------|-------------|
| \`tool_call\` | Tool was invoked |

### Delegation (Supervisors)

| Event | Description |
|-------|-------------|
| \`delegate_start\` | Started delegating to child agent |
| \`delegate_complete\` | Child agent finished |
| \`handoff\` | Handed off to another agent |
| \`escalation\` | Escalated from child agent |

### Validation

| Event | Description |
|-------|-------------|
| \`constraint_check\` | Validated a constraint |
| \`error\` | An error occurred |

## Event Structure

\`\`\`json
{
  "type": "flow_step_enter",
  "timestamp": "2024-01-15T12:34:56.789Z",
  "sessionId": "session_abc123",
  "agentName": "booking_agent",
  "data": {
    "stepName": "collect_info",
    "previousStep": "greeting"
  },
  "spanId": "span_xyz",
  "parentSpanId": "span_parent"
}
\`\`\`

## Debugging Patterns

### Finding Why Agent Is Stuck

1. Filter for \`flow_step_enter\` events
2. Look for repeating step names
3. Check \`dsl_collect\` events - are fields being captured?
4. Check transitions - what condition is failing?

### Tracking Tool Failures

1. Filter for \`tool_call\` events
2. Check the \`success\` field
3. Look for following \`error\` events
4. Review tool input parameters

### Understanding LLM Decisions

1. Filter for \`decision\` events
2. Review \`reasoning\` field
3. Check what context was available
4. Compare with \`llm_call\` prompts
`;

// =============================================================================
// DEBUGGING GUIDE
// =============================================================================

export const DEBUGGING_GUIDE = `# Agent Debugging Guide

This guide covers common issues and how to diagnose them using trace analysis.

## Quick Diagnosis Checklist

1. **What type of agent?** (scripted/reasoning/supervisor)
2. **What's the current state?** (flow step, context values)
3. **What was the last action?** (trace events)
4. **Are there errors?** (error events, constraint failures)

## Common Issues by Agent Type

### Scripted Agents

#### Issue: Agent stuck in loop
**Symptoms:**
- Same \`flow_step_enter\` event repeating
- User keeps getting same prompt

**Diagnosis:**
1. Check which step is repeating
2. Look at \`dsl_collect\` events - are fields being captured?
3. Check transition conditions

**Solution:**
- Ensure all required fields are being set
- Verify transition conditions can be satisfied
- Add timeout/fallback transition

#### Issue: Skipping steps
**Symptoms:**
- Expected step never entered
- Context missing expected values

**Diagnosis:**
1. Check \`flow_transition\` events
2. Review transition conditions
3. Verify previous step completed

**Solution:**
- Add explicit transitions
- Check condition logic
- Verify on_complete handlers

### Reasoning Agents

#### Issue: Tool not being called
**Symptoms:**
- Agent responds without using tools
- Missing expected data in response

**Diagnosis:**
1. Check \`decision\` events for reasoning
2. Review tool descriptions
3. Verify tool parameters

**Solution:**
- Improve tool descriptions
- Add examples to system prompt
- Check if constraints are blocking

#### Issue: Wrong tool called
**Symptoms:**
- Unexpected tool in traces
- Incorrect results

**Diagnosis:**
1. Review \`tool_call\` events
2. Check \`decision\` reasoning
3. Compare tool descriptions

**Solution:**
- Make tool descriptions more distinct
- Add negative examples
- Improve system prompt guidance

### Supervisor Agents

#### Issue: Wrong agent selected
**Symptoms:**
- \`delegate_start\` shows unexpected agent
- User complaint about wrong handling

**Diagnosis:**
1. Check routing configuration
2. Review agent descriptions
3. Look at \`decision\` events

**Solution:**
- Improve agent descriptions
- Add routing rules for common patterns
- Consider hybrid routing

#### Issue: Escalation loop
**Symptoms:**
- Multiple \`escalation\` events
- No agent handling request

**Diagnosis:**
1. Track escalation chain
2. Check each agent's capabilities
3. Review escalation conditions

**Solution:**
- Add catch-all agent
- Improve individual agent handling
- Add human handoff fallback

## Using Trace Analysis

### Finding Patterns
\`\`\`
# Look for repeating events
traces.filter(t => t.type === 'flow_step_enter')
      .map(t => t.data.stepName)

# Expected: [greeting, collect_info, process, confirm]
# Problem:  [greeting, collect_info, collect_info, collect_info, ...]
\`\`\`

### Checking Context Evolution
\`\`\`
# Track dsl_set events to see how context changes
traces.filter(t => t.type === 'dsl_set')
      .map(t => ({ field: t.data.field, value: t.data.value }))
\`\`\`

### Measuring Performance
\`\`\`
# Check LLM call durations
traces.filter(t => t.type === 'llm_call')
      .map(t => ({ duration: t.data.duration, tokens: t.data.totalTokens }))
\`\`\`

## Best Practices

1. **Start with the error** - Look for \`error\` and \`constraint_check\` failures first
2. **Follow the flow** - Trace step-by-step from entry to issue
3. **Check context** - Many issues stem from missing/wrong context values
4. **Review decisions** - LLM reasoning often reveals the root cause
5. **Compare with expected** - Know what the happy path should look like
`;

// =============================================================================
// CONTEXT REFERENCE
// =============================================================================

export const CONTEXT_REFERENCE = `# Context Reference

Context is the persistent state that agents maintain during a conversation.
Understanding context is essential for debugging.

## Context Structure

\`\`\`json
{
  "user": {
    "input": "latest user message",
    "history": ["previous", "messages"]
  },
  "agent": {
    "name": "agent_name",
    "currentStep": "step_name"
  },
  "collected": {
    "field1": "value1",
    "field2": "value2"
  },
  "tools": {
    "lastResult": { ... },
    "lastError": null
  },
  "custom": {
    // Agent-defined values
  }
}
\`\`\`

## Accessing Context in DSL

### In Templates
\`\`\`yaml
respond: "Hello {{context.collected.name}}!"
\`\`\`

### In Conditions
\`\`\`yaml
transitions:
  - to: next
    when: context.collected.email
\`\`\`

### In Tool Calls
\`\`\`yaml
call: send_email
with:
  to: "{{context.collected.email}}"
  subject: "Confirmation"
\`\`\`

## Context Operations

### Setting Values
\`\`\`yaml
set:
  - key: custom.preference
    value: "{{user.input}}"
\`\`\`

### Checking Values
\`\`\`yaml
when: context.custom.preference == "premium"
\`\`\`

### Clearing Values
\`\`\`yaml
set:
  - key: collected.temp_data
    value: null
\`\`\`

## Common Context Issues

### Field Not Being Set
- Check \`dsl_collect\` events
- Verify field name matches exactly
- Check for validation failures

### Wrong Value Type
- Verify type in collect definition
- Check transformation logic
- Review tool return values

### Context Lost Between Steps
- Context persists across steps
- Check for explicit clearing
- Verify delegate context mapping
`;

// =============================================================================
// EXPORTS
// =============================================================================

export const ABL_DOCS: Record<string, string> = {
  overview: ABL_OVERVIEW,
  scripted: ABL_SCRIPTED,
  reasoning: ABL_REASONING,
  supervisor: ABL_SUPERVISOR,
  'trace-events': TRACE_EVENTS,
  debugging: DEBUGGING_GUIDE,
  context: CONTEXT_REFERENCE,
};

export const DOC_TOPICS = Object.keys(ABL_DOCS);

/**
 * Get documentation for a specific topic
 */
export function getDocumentation(topic: string): string | null {
  return ABL_DOCS[topic] || null;
}

/**
 * Search documentation for a term
 */
export function searchDocumentation(query: string): Array<{ topic: string; excerpt: string }> {
  const results: Array<{ topic: string; excerpt: string }> = [];
  const lowerQuery = query.toLowerCase();

  for (const [topic, content] of Object.entries(ABL_DOCS)) {
    const lowerContent = content.toLowerCase();
    const index = lowerContent.indexOf(lowerQuery);

    if (index !== -1) {
      // Extract surrounding context
      const start = Math.max(0, index - 100);
      const end = Math.min(content.length, index + query.length + 100);
      const excerpt =
        (start > 0 ? '...' : '') +
        content.slice(start, end).trim() +
        (end < content.length ? '...' : '');

      results.push({ topic, excerpt });
    }
  }

  return results;
}
