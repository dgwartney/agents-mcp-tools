export function printResult(json: string, raw = false): void {
  if (raw) {
    console.log(json);
    return;
  }
  try {
    const parsed = JSON.parse(json);
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(json);
  }
}

export function exitOnFailure(json: string): void {
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    if (parsed.success === false) {
      process.exit(1);
    }
  } catch {
    // non-JSON output — don't exit
  }
}
