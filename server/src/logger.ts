// 仕様6-4: ACKの結果とレイテンシーをCloud Loggingで機体ID等から検索できるよう、1行のJSONで出力する。
export type Logger = {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
};

export function createStructuredLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)): Logger {
  const log = (severity: "INFO" | "WARNING", message: string, fields?: Record<string, unknown>) => {
    write(JSON.stringify({ ...fields, severity, message }));
  };
  return {
    info: (message, fields) => log("INFO", message, fields),
    warn: (message, fields) => log("WARNING", message, fields),
  };
}
