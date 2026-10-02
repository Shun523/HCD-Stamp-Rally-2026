import { describe, expect, it } from "vitest";
import { createStructuredLogger } from "../src/logger.js";

describe("structured logger", () => {
  it("writes one JSON line with severity, message and fields", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger((line) => lines.push(line));

    logger.info("stamp ACK received", { deviceId: "dev-01", ack_received: true, ack_wait_ms: 126 });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain("\n");
    expect(JSON.parse(lines[0]!)).toEqual({
      severity: "INFO",
      message: "stamp ACK received",
      deviceId: "dev-01",
      ack_received: true,
      ack_wait_ms: 126,
    });
  });

  it("maps warn to Cloud Logging WARNING severity", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger((line) => lines.push(line));

    logger.warn("stamp ACK timed out", { deviceId: "dev-02" });

    expect(JSON.parse(lines[0]!)).toMatchObject({ severity: "WARNING", message: "stamp ACK timed out", deviceId: "dev-02" });
  });

  it("does not let fields overwrite severity or message", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger((line) => lines.push(line));

    logger.info("heartbeat", { severity: "ERROR", message: "spoofed" });

    expect(JSON.parse(lines[0]!)).toEqual({ severity: "INFO", message: "heartbeat" });
  });
});
