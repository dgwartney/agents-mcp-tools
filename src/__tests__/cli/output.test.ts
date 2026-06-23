import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

describe('output module', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let processExitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
  });

  afterEach(() => { vi.restoreAllMocks(); });

  // Import after mocking
  let printResult: (json: string, raw?: boolean) => void;
  let exitOnFailure: (json: string) => void;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import('../../cli/output.js');
    printResult = mod.printResult;
    exitOnFailure = mod.exitOnFailure;
  });

  describe('printResult', () => {
    test('pretty-prints valid JSON to stdout', () => {
      printResult('{"key":"value"}');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key": "value"'),
      );
    });

    test('prints raw JSON when raw=true', () => {
      printResult('{"key":"value"}', true);
      expect(consoleLogSpy).toHaveBeenCalledWith('{"key":"value"}');
    });

    test('prints non-JSON strings as-is', () => {
      printResult('plain text output');
      expect(consoleLogSpy).toHaveBeenCalledWith('plain text output');
    });

    test('handles JSON parse errors gracefully', () => {
      printResult('{invalid json}');
      expect(consoleLogSpy).toHaveBeenCalledWith('{invalid json}');
    });
  });

  describe('exitOnFailure', () => {
    test('exits with code 1 when success is false', () => {
      exitOnFailure('{"success":false,"error":"something went wrong"}');
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    test('does not exit when success is true', () => {
      exitOnFailure('{"success":true,"data":{}}');
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    test('does not exit for non-JSON output', () => {
      exitOnFailure('plain text');
      expect(processExitSpy).not.toHaveBeenCalled();
    });

    test('does not exit when success field is absent', () => {
      exitOnFailure('{"data":"ok"}');
      expect(processExitSpy).not.toHaveBeenCalled();
    });
  });
});
