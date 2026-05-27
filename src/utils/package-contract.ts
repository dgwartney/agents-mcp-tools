export function extractPackageConstraintObservability(body: unknown): unknown {
  const root = isRecord(body) ? body : {};
  const model = isRecord(root.model) ? root.model : {};
  const diagnostics = isRecord(root.diagnostics) ? root.diagnostics : {};

  return (
    readRecord(root.constraintObservability) ??
    readRecord(model.constraintObservability) ??
    readRecord(diagnostics.constraintObservability)
  );
}

export function extractPackageStructuralSummary(body: unknown): unknown {
  const root = isRecord(body) ? body : {};
  const model = isRecord(root.model) ? root.model : {};
  const diagnostics = isRecord(root.diagnostics) ? root.diagnostics : {};

  return (
    readRecord(root.structuralSummary) ??
    readRecord(model.structuralSummary) ??
    readRecord(diagnostics.structuralSummary)
  );
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
