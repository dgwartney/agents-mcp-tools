// src/__tests__/cli/debug.test.ts
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import type { DebugContext } from '../../tools/index.js';

vi.mock('../../tools/agents.js', () => ({
  listAgents: vi.fn().mockResolvedValue('{"agents":[]}'),
  listAgentsSchema: { parse: vi.fn((x) => x) },
  loadAgent: vi.fn().mockResolvedValue('{"sessionId":"s1"}'),
  loadAgentSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/interaction.js', () => ({
  sendMessage: vi.fn().mockResolvedValue('{"response":"ok"}'),
  sendMessageSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/traces.js', () => ({
  traces: vi.fn().mockResolvedValue('{"events":[]}'),
  tracesSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/state.js', () => ({
  getCurrentState: vi.fn().mockResolvedValue('{"state":{}}'),
  getCurrentStateSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/spans.js', () => ({
  getSpanTree: vi.fn().mockResolvedValue('{"spans":[]}'),
  getSpanTreeSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/errors.js', () => ({
  getErrors: vi.fn().mockResolvedValue('{"errors":[]}'),
  getErrorsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/decisions.js', () => ({
  explainDecision: vi.fn().mockResolvedValue('{"decision":{}}'),
  explainDecisionSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/flow.js', () => ({
  getFlowGraph: vi.fn().mockResolvedValue('{"graph":{}}'),
  getFlowGraphSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/subscription.js', () => ({
  listActiveSessions: vi.fn().mockResolvedValue('{"sessions":[]}'),
  listActiveSessionsSchema: { parse: vi.fn((x) => x) },
  session: vi.fn().mockResolvedValue('{"status":"subscribed"}'),
  sessionSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/docs.js', () => ({
  docs: vi.fn().mockResolvedValue('{"docs":[]}'),
  docsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/analysis.js', () => ({
  analyzeSession: vi.fn().mockResolvedValue('{"analysis":{}}'),
  analyzeSessionSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/diagnostic-layer.js', () => ({
  diagnosticLayer: vi.fn().mockResolvedValue('{"incidents":[]}'),
  diagnosticLayerSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/trace-diagnostics.js', () => ({
  getTraceEvent: vi.fn().mockResolvedValue('{"event":{}}'),
  getTraceEventSchema: { parse: vi.fn((x) => x) },
  explainTraceEventTool: vi.fn().mockResolvedValue('{"explanation":{}}'),
  explainTraceEventSchema: { parse: vi.fn((x) => x) },
  modelInteractions: vi.fn().mockResolvedValue('{"interactions":[]}'),
  modelInteractionsSchema: { parse: vi.fn((x) => x) },
  realtimeInteractions: vi.fn().mockResolvedValue('{"interactions":[]}'),
  realtimeInteractionsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/harness-logs.js', () => ({
  harnessLogs: vi.fn().mockResolvedValue('{"logs":[]}'),
  harnessLogsSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/diagnose.js', () => ({
  diagnose: vi.fn().mockResolvedValue('{"findings":[]}'),
  diagnoseSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/debug-lint-abl.js', () => ({
  debugLintAbl: vi.fn().mockResolvedValue('{"issues":[]}'),
  debugLintAblSchema: { parse: vi.fn((x) => x) },
}));
vi.mock('../../tools/debug-why-transcript-failed.js', () => ({
  debugWhyTranscriptFailed: vi.fn().mockResolvedValue('{"diagnoses":[]}'),
  debugWhyTranscriptFailedSchema: { parse: vi.fn((x) => x) },
}));

import { registerDebugCommands } from '../../cli/commands/debug.js';
import { listAgents, loadAgent } from '../../tools/agents.js';
import { sendMessage } from '../../tools/interaction.js';
import { traces } from '../../tools/traces.js';
import { getSpanTree } from '../../tools/spans.js';
import { getErrors } from '../../tools/errors.js';
import { getFlowGraph } from '../../tools/flow.js';
import { session } from '../../tools/subscription.js';
import { diagnose } from '../../tools/diagnose.js';
import { debugLintAbl } from '../../tools/debug-lint-abl.js';
import { debugWhyTranscriptFailed } from '../../tools/debug-why-transcript-failed.js';
import { harnessLogs } from '../../tools/harness-logs.js';

function createMockCtx(): DebugContext {
  return {
    wsClient: {} as never,
    httpClient: {} as never,
    sessionStore: {} as never,
    traceStore: {} as never,
    authenticate: vi.fn().mockResolvedValue({ token: 'jwt', method: 'stored_credentials' }),
  };
}

async function runCli(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  const ctx = createMockCtx();
  registerDebugCommands(program, ctx);
  await program.parseAsync(['node', 'arch', ...args]);
}

describe('debug commands', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  test('debug list-agents passes domain filter', async () => {
    await runCli(['list-agents', '--domain', 'hotel-booking']);
    expect(listAgents).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'hotel-booking' }),
      expect.any(Object),
    );
  });

  test('debug load-agent passes agentPath and projectId', async () => {
    await runCli(['load-agent', '--agent-path', 'hotel/agent', '--project-id', 'p1']);
    expect(loadAgent).toHaveBeenCalledWith(
      expect.objectContaining({ agentPath: 'hotel/agent', projectId: 'p1' }),
      expect.any(Object),
    );
  });

  test('debug send-message passes text and sessionId with wait by default', async () => {
    await runCli(['send-message', '--text', 'hello', '--session-id', 's1']);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'hello', sessionId: 's1', waitForResponse: true }),
      expect.any(Object),
    );
  });

  test('debug send-message --no-wait sets waitForResponse=false', async () => {
    await runCli(['send-message', '--text', 'hi', '--no-wait']);
    expect(sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ waitForResponse: false }),
      expect.any(Object),
    );
  });

  test('debug traces passes text filter and limit', async () => {
    await runCli(['traces', '--text', 'error', '--limit', '20']);
    expect(traces).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'error', limit: 20 }),
      expect.any(Object),
    );
  });

  test('debug traces passes comma-separated types as array', async () => {
    await runCli(['traces', '--types', 'DECISION,ERROR']);
    expect(traces).toHaveBeenCalledWith(
      expect.objectContaining({ types: ['DECISION', 'ERROR'] }),
      expect.any(Object),
    );
  });

  test('debug get-span-tree passes flat flag', async () => {
    await runCli(['get-span-tree', '--flat', '--project-id', 'p1']);
    expect(getSpanTree).toHaveBeenCalledWith(
      expect.objectContaining({ flat: true, projectId: 'p1' }),
      expect.any(Object),
    );
  });

  test('debug get-errors passes include-warnings', async () => {
    await runCli(['get-errors', '--include-warnings']);
    expect(getErrors).toHaveBeenCalledWith(
      expect.objectContaining({ includeWarnings: true }),
      expect.any(Object),
    );
  });

  test('debug get-flow-graph passes mermaid format', async () => {
    await runCli(['get-flow-graph', '--format', 'mermaid']);
    expect(getFlowGraph).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'mermaid' }),
      expect.any(Object),
    );
  });

  test('debug session subscribe passes sessionId', async () => {
    await runCli(['session', 'subscribe', '--session-id', 'sess-abc']);
    expect(session).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'subscribe', sessionId: 'sess-abc' }),
      expect.any(Object),
    );
  });

  test('debug diagnose passes depth and config-only', async () => {
    await runCli(['diagnose', '--depth', 'deep', '--config-only']);
    expect(diagnose).toHaveBeenCalledWith(
      expect.objectContaining({ depth: 'deep', configOnly: true }),
      expect.any(Object),
    );
  });

  test('debug lint-abl passes path', async () => {
    await runCli(['lint-abl', '--path', '/tmp/project']);
    expect(debugLintAbl).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/tmp/project' }),
      expect.any(Object),
    );
  });

  test('debug why-transcript-failed passes path and transcript-path', async () => {
    await runCli(['why-transcript-failed', '--path', '/tmp/pkg', '--transcript-path', '/tmp/t.json']);
    expect(debugWhyTranscriptFailed).toHaveBeenCalledWith(
      expect.objectContaining({ path: '/tmp/pkg', transcriptPath: '/tmp/t.json' }),
      expect.any(Object),
    );
  });

  test('debug harness-logs passes required params as correct types', async () => {
    await runCli(['harness-logs', '--execution-id', 'exec1', '--run-sequence', '3', '--stage-id', 'build', '--step-id', 'test']);
    expect(harnessLogs).toHaveBeenCalledWith(
      expect.objectContaining({ execution_id: 'exec1', run_sequence: 3, stage_id: 'build', step_id: 'test' }),
    );
  });
});
