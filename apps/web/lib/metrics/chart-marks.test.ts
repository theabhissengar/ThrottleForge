import { describe, expect, it } from "vitest";
import { outcomeMark } from "./chart-marks";

describe("outcome bar marks", () => {
  it("draws no bar for a missing series", () => {
    expect(outcomeMark(null)).toBe("gap");
  });

  it("draws a baseline mark for a reported zero", () => {
    expect(outcomeMark(0)).toBe("zero");
  });

  it("draws a bar for a reported count", () => {
    expect(outcomeMark(4)).toBe("bar");
  });
});
