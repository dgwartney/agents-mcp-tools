// src/cli/commands/chat.ts
import { createInterface } from 'node:readline';
import { Command } from 'commander';
import chalk from 'chalk';
import type { DebugContext } from '../../tools/index.js';
import { connect } from '../../tools/connect.js';
import { loadAgent } from '../../tools/agents.js';
import { resolveProjectId, resolveSessionId, writeCliState } from '../state.js';

const HELP_TEXT = `
  /session  — print the current session ID
  /help     — show this message
  /exit     — end the session
  /quit     — end the session
`;

const RESPONSE_TIMEOUT_MS = 60_000;

const YOU_LABEL     = chalk.cyan.bold('You: ');
const AGENT_LABEL   = chalk.green.bold('Agent: ');
const THINKING_LINE = chalk.dim('Agent is thinking…');

export function registerChatCommand(program: Command, ctx: DebugContext): void {
  program
    .option('--agent-path <path>', 'Agent path (format: domain/name) — starts a new session')
    .option('--project-id <id>', 'Project ID (resolved from state if omitted)')
    .action(async (opts: { agentPath?: string; projectId?: string }) => {
      // ── 1. Connect ──────────────────────────────────────────────────────────
      const connectResult = JSON.parse(await connect({}, ctx)) as { success: boolean; error?: string };
      if (!connectResult.success) {
        console.error(chalk.red(connectResult.error ?? 'Failed to connect. Run: agentcl platform connect --server-url <url>'));
        process.exit(1);
      }

      // ── 2. Load or resume session ───────────────────────────────────────────
      let sessionId: string;

      if (opts.agentPath) {
        const projectId = resolveProjectId(opts.projectId) ?? '';
        console.error(chalk.dim(`Loading agent "${opts.agentPath}"…`));
        const loadResult = JSON.parse(
          await loadAgent({ agentPath: opts.agentPath, projectId }, ctx),
        ) as { success: boolean; sessionId?: string; agent?: { name: string }; error?: string };

        if (!loadResult.success || !loadResult.sessionId) {
          console.error(chalk.red(loadResult.error ?? 'Failed to load agent.'));
          process.exit(1);
        }

        sessionId = loadResult.sessionId;
        writeCliState({ sessionId });
        console.error(chalk.dim(`Agent "${loadResult.agent?.name ?? opts.agentPath}" ready. Session: ${sessionId}`));
      } else {
        const persisted = resolveSessionId();
        if (!persisted) {
          console.error(chalk.red('No active session. Start one with: agentcl chat --agent-path <domain/name>'));
          process.exit(1);
        }
        sessionId = persisted;
        console.error(chalk.dim(`Resuming session: ${sessionId}`));
      }

      // ── 3. Start REPL ───────────────────────────────────────────────────────
      const rl = createInterface({ input: process.stdin, output: process.stderr, terminal: true });

      let sendTimeout: ReturnType<typeof setTimeout> | null = null;
      let waitingForResponse = false;

      const prompt = () => {
        if (!waitingForResponse) rl.question(YOU_LABEL, onLine);
      };

      const clearSendTimeout = () => {
        if (sendTimeout) {
          clearTimeout(sendTimeout);
          sendTimeout = null;
        }
      };

      // ── 4. Wire streaming handlers ──────────────────────────────────────────
      ctx.wsClient.onResponseStart = (_sid, _mid) => {
        process.stdout.write('\n' + AGENT_LABEL);
      };

      ctx.wsClient.onResponseChunk = (sid, _mid, chunk) => {
        if (sid === sessionId) process.stdout.write(chunk);
      };

      ctx.wsClient.onResponseEnd = (sid) => {
        if (sid !== sessionId) return;
        clearSendTimeout();
        waitingForResponse = false;
        process.stdout.write('\n');
        prompt();
      };

      ctx.wsClient.onError = (message) => {
        clearSendTimeout();
        waitingForResponse = false;
        console.error('\n' + chalk.red(`Error: ${message}`));
        prompt();
      };

      // ── 5. Handle each input line ───────────────────────────────────────────
      const onLine = (line: string) => {
        const text = line.trim();

        if (!text) {
          prompt();
          return;
        }

        if (text === '/exit' || text === '/quit') {
          rl.close();
          return;
        }

        if (text === '/session') {
          console.error(chalk.dim(`Session ID: ${sessionId}`));
          prompt();
          return;
        }

        if (text === '/help') {
          console.error(HELP_TEXT);
          prompt();
          return;
        }

        // Send message — show thinking indicator while waiting for response_start
        waitingForResponse = true;
        console.error(THINKING_LINE);

        sendTimeout = setTimeout(() => {
          waitingForResponse = false;
          console.error('\n' + chalk.yellow('Timed out waiting for agent response.'));
          prompt();
        }, RESPONSE_TIMEOUT_MS);

        ctx.wsClient.sendMessage(sessionId, text);
      };

      // ── 6. Clean exit ───────────────────────────────────────────────────────
      rl.on('close', () => {
        clearSendTimeout();
        ctx.wsClient.disconnect();
        process.exit(0);
      });

      prompt();
    });
}
