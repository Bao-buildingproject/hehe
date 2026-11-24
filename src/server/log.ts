/**
 * Structured audit/event log written to stdout (visible in the hosting
 * provider's logs). Never log passwords, tokens or task contents.
 */
export function logEvent(level: "info" | "warn" | "error", event: string, data: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === "test" && level !== "error") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
