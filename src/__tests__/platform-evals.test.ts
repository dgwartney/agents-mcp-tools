import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  platformEvalPersonas,
  platformEvalRuns,
  platformEvalScenarios,
} from '../tools/platform-evals.js';
import type { DebugContext } from '../tools/index.js';
import { requestStudioJson } from '../utils/studio-api.js';

vi.mock('../utils/studio-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/studio-api.js')>();
  return {
    ...actual,
    requestStudioJson: vi.fn(),
    formatStudioFailure: (
      path: string,
      result: { status: number; statusText: string; body: unknown },
      method = 'POST',
    ) =>
      JSON.stringify({
        success: false,
        error: `${method} ${path} failed: ${result.status} ${result.statusText}`,
        body: result.body,
      }),
  };
});

const requestStudioJsonMock = vi.mocked(requestStudioJson);

const ctx = {
  httpClient: {
    getBaseUrl: () => 'http://localhost:3112',
    getAuthToken: () => 'token-123',
  },
} as unknown as DebugContext;

beforeEach(() => {
  requestStudioJsonMock.mockReset();
  requestStudioJsonMock.mockResolvedValue({ ok: true, body: { success: true } });
});

describe('platform eval tools', () => {
  it('builds eval run compare queries from structured runIds', async () => {
    const raw = await platformEvalRuns(
      {
        action: 'compare',
        projectId: 'proj_123',
        runIds: ['run-a', 'run-b'],
      },
      ctx,
    );

    expect(JSON.parse(raw)).toMatchObject({ success: true });
    expect(requestStudioJsonMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        method: 'GET',
        path: '/api/projects/proj_123/evals/runs/compare?runIds=run-a%2Crun-b',
      }),
    );
  });

  it('rejects eval run compare without exactly two run IDs before calling Studio', async () => {
    const raw = await platformEvalRuns(
      {
        action: 'compare',
        projectId: 'proj_123',
        runIds: ['run-a'],
      },
      ctx,
    );

    expect(JSON.parse(raw)).toMatchObject({
      success: false,
      error: 'runIds must contain exactly two run IDs for compare.',
    });
    expect(requestStudioJsonMock).not.toHaveBeenCalled();
  });

  it('rejects blank eval run compare IDs before calling Studio', async () => {
    const raw = await platformEvalRuns(
      {
        action: 'compare',
        projectId: 'proj_123',
        runIds: ['run-a', '   '],
      },
      ctx,
    );

    expect(JSON.parse(raw)).toMatchObject({
      success: false,
      error: 'runIds must contain exactly two run IDs for compare.',
    });
    expect(requestStudioJsonMock).not.toHaveBeenCalled();
  });

  it('exposes AI persona and scenario generation endpoints for repair loops', async () => {
    await platformEvalPersonas(
      {
        action: 'generate',
        projectId: 'proj_123',
        body: { count: 2, focusAreas: ['handoff'] },
      },
      ctx,
    );
    await platformEvalScenarios(
      {
        action: 'generate',
        projectId: 'proj_123',
        body: { count: 2, personaIds: ['persona-a'] },
      },
      ctx,
    );

    expect(requestStudioJsonMock).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({
        method: 'POST',
        path: '/api/projects/proj_123/evals/generate/personas',
        body: { count: 2, focusAreas: ['handoff'] },
      }),
    );
    expect(requestStudioJsonMock).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({
        method: 'POST',
        path: '/api/projects/proj_123/evals/generate/scenarios',
        body: { count: 2, personaIds: ['persona-a'] },
      }),
    );
  });

  it('exposes eval preflight and quick-run workflow endpoints', async () => {
    await platformEvalRuns({ action: 'preflight', projectId: 'proj_123' }, ctx);
    await platformEvalRuns(
      { action: 'quick', projectId: 'proj_123', body: { name: 'Smoke eval' } },
      ctx,
    );

    expect(requestStudioJsonMock).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({
        method: 'POST',
        path: '/api/projects/proj_123/evals/preflight',
        body: {},
      }),
    );
    expect(requestStudioJsonMock).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({
        method: 'POST',
        path: '/api/projects/proj_123/evals/quick',
        body: { name: 'Smoke eval' },
      }),
    );
  });

  it('exposes eval run case drill-down with diagnostic filters', async () => {
    await platformEvalRuns(
      {
        action: 'cases',
        projectId: 'proj_123',
        runId: 'run-1',
        query: {
          view: 'diagnostic',
          failedOnly: true,
          evaluatorId: 'eval-1',
        },
      },
      ctx,
    );

    expect(requestStudioJsonMock).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        method: 'GET',
        path: '/api/projects/proj_123/evals/runs/run-1/cases?view=diagnostic&failedOnly=true&evaluatorId=eval-1',
      }),
    );
  });
});
