import { describe, expect, it } from "vitest";
import { generateSignature, isFreshTimestamp, verifySignature } from "./signature.js";

const KEY = "test-api-key";

describe("signature", () => {
  it("verifies a correct signature", () => {
    const body = JSON.stringify({ run_id: "tsk_1", status: "completed" });
    const sig = generateSignature(body, KEY);
    expect(verifySignature(body, sig, KEY)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const body = JSON.stringify({ run_id: "tsk_1", status: "completed" });
    const sig = generateSignature(body, KEY);
    expect(verifySignature(body + "x", sig, KEY)).toBe(false);
  });

  it("rejects a wrong key", () => {
    const body = "{}";
    const sig = generateSignature(body, KEY);
    expect(verifySignature(body, sig, "other-key")).toBe(false);
  });

  it("rejects a missing signature", () => {
    expect(verifySignature("{}", undefined, KEY)).toBe(false);
  });
});

describe("isFreshTimestamp", () => {
  const now = 1_700_000_000_000;
  it("accepts a recent timestamp", () => {
    expect(isFreshTimestamp(String(now / 1000), 300, now)).toBe(true);
  });
  it("rejects an old timestamp", () => {
    expect(isFreshTimestamp(String(now / 1000 - 600), 300, now)).toBe(false);
  });
  it("allows a missing timestamp (optional header)", () => {
    expect(isFreshTimestamp(undefined, 300, now)).toBe(true);
  });
});
