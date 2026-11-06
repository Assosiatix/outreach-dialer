/** Structured JSON-line logger (stdout → `pm2 logs outreach-dialer`). */
type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, data?: Record<string, unknown>) {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...data });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, data?: Record<string, unknown>) => write("info", msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => write("warn", msg, data),
  error: (msg: string, err?: unknown, data?: Record<string, unknown>) =>
    write("error", msg, {
      ...data,
      error: err instanceof Error ? { message: err.message, stack: err.stack } : err,
    }),
};
