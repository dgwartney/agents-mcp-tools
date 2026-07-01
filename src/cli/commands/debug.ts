// src/cli/commands/debug.ts
import { Command } from 'commander';
import type { DebugContext } from '../../tools/index.js';
import { printResult, exitOnFailure } from '../output.js';
import { resolveProjectId, resolveSessionId, writeCliState } from '../state.js';

import { listAgents } from '../../tools/agents.js';
import { loadAgent } from '../../tools/agents.js';
import { sendMessage } from '../../tools/interaction.js';
import { traces } from '../../tools/traces.js';
import { getCurrentState } from '../../tools/state.js';
import { getSpanTree } from '../../tools/spans.js';
import { getErrors } from '../../tools/errors.js';
import { explainDecision } from '../../tools/decisions.js';
import { getFlowGraph } from '../../tools/flow.js';
import { listActiveSessions, session } from '../../tools/subscription.js';
import { docs } from '../../tools/docs.js';
import { analyzeSession } from '../../tools/analysis.js';
import { diagnosticLayer } from '../../tools/diagnostic-layer.js';
import {
  getTraceEvent,
  explainTraceEventTool,
  modelInteractions,
  realtimeInteractions,
} from '../../tools/trace-diagnostics.js';
import { harnessLogs } from '../../tools/harness-logs.js';
import { diagnose } from '../../tools/diagnose.js';
import { debugLintAbl } from '../../tools/debug-lint-abl.js';
import { debugWhyTranscriptFailed } from '../../tools/debug-why-transcript-failed.js';

type Ctx = DebugContext;

function run(handler: () => Promise<string>): void {
  handler()
    .then((result) => {
      printResult(result);
      exitOnFailure(result);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}

export function registerDebugCommands(program: Command, ctx: Ctx): void {
  // ── list-agents ───────────────────────────────────────────────────────────
  program.command('list-agents')
    .description('List all available agents')
    .option('--domain <domain>', 'Filter by domain')
    .action((opts) => {
      run(() => listAgents({ domain: opts.domain }, ctx));
    });

  // ── load-agent ────────────────────────────────────────────────────────────
  program.command('load-agent')
    .description('Load an agent and create a debug session')
    .requiredOption('--agent-path <path>', 'Agent path (format: domain/name)')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const projectId = resolveProjectId(opts.projectId) ?? '';
      run(async () => {
        const result = await loadAgent({ agentPath: opts.agentPath, projectId }, ctx);
        const parsed = JSON.parse(result) as { success?: boolean; sessionId?: string };
        if (parsed.success && parsed.sessionId) {
          writeCliState({ sessionId: parsed.sessionId });
        }
        return result;
      });
    });

  // ── send-message ──────────────────────────────────────────────────────────
  program.command('send-message')
    .description('Send a message to the loaded agent')
    .requiredOption('--text <text>', 'Message text')
    .option('--session-id <id>', 'Session ID')
    .option('--no-wait', 'Do not wait for agent response (default: wait)')
    .option('--timeout <ms>', 'Timeout in milliseconds', parseInt)
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      run(() => sendMessage({
        text: opts.text,
        sessionId,
        waitForResponse: opts.wait !== false,
        timeout: opts.timeout,
      }, ctx));
    });

  // ── traces ────────────────────────────────────────────────────────────────
  program.command('traces')
    .description('Get and search trace events')
    .option('--text <text>', 'Text filter')
    .option('--types <types>', 'Comma-separated event types')
    .option('--agent-name <name>', 'Agent name filter')
    .option('--has-error', 'Filter to error events')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--limit <n>', 'Max events', parseInt)
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => traces({
        text: opts.text,
        types: opts.types ? opts.types.split(',') : undefined,
        agentName: opts.agentName,
        hasError: opts.hasError || undefined,
        sessionId,
        projectId,
        limit: opts.limit,
      }, ctx));
    });

  // ── get-current-state ─────────────────────────────────────────────────────
  program.command('get-current-state')
    .description('Get current agent state')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => getCurrentState({ sessionId, projectId }, ctx));
    });

  // ── get-span-tree ─────────────────────────────────────────────────────────
  program.command('get-span-tree')
    .description('Get hierarchical span tree')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--flat', 'Return flat list with depth info')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => getSpanTree({ sessionId, projectId, flat: opts.flat }, ctx));
    });

  // ── get-errors ────────────────────────────────────────────────────────────
  program.command('get-errors')
    .description('Get errors and warnings from the session')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--include-warnings', 'Include warnings')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => getErrors({ sessionId, projectId, includeWarnings: opts.includeWarnings }, ctx));
    });

  // ── explain-decision ──────────────────────────────────────────────────────
  program.command('explain-decision')
    .description('Explain a decision event')
    .option('--event-id <id>', 'Event ID')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--last-n <n>', 'Number of recent events', parseInt)
    .option('--turn <n>', 'Turn number', parseInt)
    .option('--type <type>', 'Event type')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => explainDecision({
        eventId: opts.eventId,
        sessionId,
        projectId,
        lastN: opts.lastN,
        turn: opts.turn,
        type: opts.type,
      }, ctx));
    });

  // ── get-flow-graph ────────────────────────────────────────────────────────
  program.command('get-flow-graph')
    .description('Get execution graph for an agent')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--format <format>', 'Output format: json or mermaid', 'json')
    .option('--include-app-graph', 'Include application graph')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => getFlowGraph({
        sessionId,
        projectId,
        format: opts.format,
        includeAppGraph: opts.includeAppGraph,
      }, ctx));
    });

  // ── list-active-sessions ──────────────────────────────────────────────────
  program.command('list-active-sessions')
    .description('List all active sessions on the server')
    .action(() => run(() => listActiveSessions({}, ctx)));

  // ── session ───────────────────────────────────────────────────────────────
  const sessionCmd = program.command('session').description('Subscribe/unsubscribe from session events');
  sessionCmd.command('subscribe')
    .option('--session-id <id>', 'Session ID')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId) ?? '';
      run(() => session({ action: 'subscribe', sessionId }, ctx));
    });
  sessionCmd.command('unsubscribe')
    .option('--session-id <id>', 'Session ID')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId) ?? '';
      run(() => session({ action: 'unsubscribe', sessionId }, ctx));
    });

  // ── docs ──────────────────────────────────────────────────────────────────
  program.command('docs')
    .description('Get or search ABL documentation')
    .option('--topic <topic>', 'Topic name')
    .option('--query <query>', 'Search query')
    .action((opts) => run(() => docs({ topic: opts.topic, query: opts.query }, ctx)));

  // ── analyze-session ───────────────────────────────────────────────────────
  program.command('analyze-session')
    .description('Get automated session analysis')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => analyzeSession({ sessionId, projectId }, ctx));
    });

  // ── diagnostic-layer ──────────────────────────────────────────────────────
  program.command('diagnostic-layer')
    .description('Build layered causal diagnostic view')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--trace-limit <n>', 'Max trace events', parseInt)
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => diagnosticLayer({ sessionId, projectId, traceLimit: opts.traceLimit }, ctx));
    });

  // ── get-trace-event ───────────────────────────────────────────────────────
  program.command('get-trace-event')
    .description('Fetch one trace event by ID')
    .requiredOption('--event-id <id>', 'Event ID')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--trace-limit <n>', 'Max trace events', parseInt)
    .option('--include-data', 'Include raw data')
    .option('--include-nearby', 'Include nearby events')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => getTraceEvent({
        eventId: opts.eventId,
        sessionId,
        projectId,
        traceLimit: opts.traceLimit,
        includeData: opts.includeData,
        includeNearby: opts.includeNearby,
      }, ctx));
    });

  // ── explain-trace-event ───────────────────────────────────────────────────
  program.command('explain-trace-event')
    .description('Explain one trace event')
    .requiredOption('--event-id <id>', 'Event ID')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--trace-limit <n>', 'Max trace events', parseInt)
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => explainTraceEventTool({
        eventId: opts.eventId,
        sessionId,
        projectId,
        traceLimit: opts.traceLimit,
      }, ctx));
    });

  // ── model-interactions ────────────────────────────────────────────────────
  program.command('model-interactions')
    .description('Summarize model-provider interactions')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--trace-limit <n>', 'Max trace events', parseInt)
    .option('--include-timeline', 'Include timeline')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => modelInteractions({ sessionId, projectId, traceLimit: opts.traceLimit, includeTimeline: opts.includeTimeline }, ctx));
    });

  // ── realtime-interactions ─────────────────────────────────────────────────
  program.command('realtime-interactions')
    .description('Summarize realtime voice/model interactions')
    .option('--session-id <id>', 'Session ID')
    .option('--project-id <id>', 'Project ID')
    .option('--trace-limit <n>', 'Max trace events', parseInt)
    .option('--include-timeline', 'Include timeline')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => realtimeInteractions({ sessionId, projectId, traceLimit: opts.traceLimit, includeTimeline: opts.includeTimeline }, ctx));
    });

  // ── harness-logs ──────────────────────────────────────────────────────────
  program.command('harness-logs')
    .description('Download Harness CI execution logs (requires HARNESS_API_KEY)')
    .requiredOption('--execution-id <id>', 'Harness execution ID')
    .requiredOption('--run-sequence <n>', 'Run sequence number', parseInt)
    .requiredOption('--stage-id <id>', 'Stage identifier')
    .requiredOption('--step-id <id>', 'Step identifier')
    .option('--pipeline-id <id>', 'Pipeline ID (default: ci_build)')
    .option('--filter <regex>', 'Regex filter for log lines')
    .option('--tail <n>', 'Last N lines', parseInt)
    .action((opts) => {
      run(() => harnessLogs({
        execution_id: opts.executionId,
        run_sequence: opts.runSequence,
        stage_id: opts.stageId,
        step_id: opts.stepId,
        pipeline_id: opts.pipelineId,
        filter: opts.filter,
        tail: opts.tail,
      }));
    });

  // ── diagnose ──────────────────────────────────────────────────────────────
  program.command('diagnose')
    .description('Run diagnostic analysis on an agent or session')
    .option('--session-id <id>', 'Session ID')
    .option('--agent-name <name>', 'Agent name')
    .option('--project-id <id>', 'Project ID')
    .option('--depth <depth>', 'Depth: quick | standard | deep', 'standard')
    .option('--config-only', 'Only inspect config')
    .action((opts) => {
      const sessionId = resolveSessionId(opts.sessionId);
      const projectId = resolveProjectId(opts.projectId);
      run(() => diagnose({
        sessionId,
        agentName: opts.agentName,
        projectId,
        depth: opts.depth,
        configOnly: opts.configOnly,
      }, ctx));
    });

  // ── lint-abl ──────────────────────────────────────────────────────────────
  program.command('lint-abl')
    .description('Run ABL lint checks')
    .option('--path <path>', 'Local folder or .zip path')
    .action((opts) => run(() => debugLintAbl({ path: opts.path }, ctx)));

  // ── why-transcript-failed ─────────────────────────────────────────────────
  program.command('why-transcript-failed')
    .description('Correlate transcript failures with ABL diagnoses')
    .option('--path <path>', 'Package folder or .zip path')
    .option('--transcript-path <path>', 'Transcript JSON file path')
    .action((opts) => run(() => debugWhyTranscriptFailed({
      path: opts.path,
      transcriptPath: opts.transcriptPath,
    }, ctx)));
}
