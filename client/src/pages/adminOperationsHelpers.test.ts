import { describe, expect, it } from "vitest";
import { getOperationsQueryError } from "./adminOperationsHelpers";

describe("owner operations query errors", () => {
  it("returns no error when all queries are healthy", () => {
    expect(getOperationsQueryError(undefined, null, "")).toBeUndefined();
  });

  it("preserves every failed query message for the retry notice", () => {
    expect(getOperationsQueryError("Sources unavailable", "Runs unavailable")).toBe("Sources unavailable · Runs unavailable");
  });

  it("ignores whitespace-only messages", () => {
    expect(getOperationsQueryError("  ", "Audit service unavailable")).toBe("Audit service unavailable");
  });
});
