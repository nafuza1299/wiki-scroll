import { describe, expect, it } from "vitest";
import { formatDate, formatViews } from "./format";

describe("formatDate", () => {
  it("formats a valid ISO timestamp", () => {
    expect(formatDate("2024-01-01T00:00:00Z")).toBe("Jan 1, 2024");
  });

  it("returns null for a missing date", () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
    expect(formatDate("")).toBeNull();
  });

  /*
    The regression. `new Date("not a date")` is an Invalid Date, and formatting
    it renders the literal string "Invalid Date" into the card — which is what
    the app did before this existed.
  */
  it("returns null for an unparseable date instead of 'Invalid Date'", () => {
    expect(formatDate("not a date")).toBeNull();
    expect(formatDate("2024-13-45")).toBeNull();
  });
});

describe("formatViews", () => {
  it("formats large counts compactly", () => {
    expect(formatViews(128_400)).toBe("128K views / 30d");
    expect(formatViews(1_500_000)).toBe("1.5M views / 30d");
  });

  it("formats zero as zero rather than as unavailable", () => {
    expect(formatViews(0)).toBe("0 views / 30d");
  });

  it("says so when the count is unavailable", () => {
    expect(formatViews(null)).toBe("views unavailable");
  });
});
