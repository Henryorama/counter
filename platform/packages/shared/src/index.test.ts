import { describe, expect, it } from "vitest";
import { JobStatus, mapSkyvernStatus, resolveActionSchema } from "./index.js";

describe("mapSkyvernStatus", () => {
  it("maps known statuses", () => {
    expect(mapSkyvernStatus("running")).toBe(JobStatus.RUNNING);
    expect(mapSkyvernStatus("COMPLETED")).toBe(JobStatus.COMPLETED);
    expect(mapSkyvernStatus("timed_out")).toBe(JobStatus.FAILED);
    expect(mapSkyvernStatus("action_required")).toBe(JobStatus.ACTION_REQUIRED);
  });

  it("returns null for unknown statuses", () => {
    expect(mapSkyvernStatus("banana")).toBeNull();
  });
});

describe("resolveActionSchema", () => {
  it("accepts a valid code", () => {
    expect(resolveActionSchema.parse({ verificationCode: "123456" })).toEqual({
      verificationCode: "123456",
    });
  });

  it("rejects an empty code", () => {
    expect(resolveActionSchema.safeParse({ verificationCode: "" }).success).toBe(false);
  });
});
