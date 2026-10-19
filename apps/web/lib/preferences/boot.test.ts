import { describe, expect, it } from "vitest";
import {
  BOOT_SCRIPT,
  readStorage,
  resolveSidebar,
  resolveTheme,
  resolveThemeChoice,
  writeStorage,
} from "./boot";

describe("preference resolution", () => {
  it("falls back when the theme value is missing or invalid", () => {
    expect(resolveThemeChoice(null)).toBe("system");
    expect(resolveThemeChoice("")).toBe("system");
    expect(resolveThemeChoice("blue")).toBe("system");
    expect(resolveThemeChoice("light")).toBe("light");
    expect(resolveThemeChoice("dark")).toBe("dark");
    expect(resolveThemeChoice("system")).toBe("system");
  });

  it("resolves system from the OS preference and keeps an explicit choice", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back when the sidebar value is missing or invalid", () => {
    expect(resolveSidebar(null)).toBe("expanded");
    expect(resolveSidebar("wide")).toBe("expanded");
    expect(resolveSidebar("collapsed")).toBe("collapsed");
    expect(resolveSidebar("expanded")).toBe("expanded");
  });

  it("returns null when storage throws", () => {
    const storage = {
      getItem(): string | null {
        throw new Error("blocked");
      },
    };
    expect(readStorage(storage, "throttleforge-theme")).toBeNull();
    expect(readStorage(null, "throttleforge-theme")).toBeNull();
  });

  it("keeps the in-memory choice when a write throws", () => {
    const storage = {
      setItem(): void {
        throw new Error("blocked");
      },
    };
    expect(writeStorage(storage, "throttleforge-sidebar", "collapsed")).toBe(false);
    expect(writeStorage(null, "throttleforge-sidebar", "collapsed")).toBe(false);
  });

  it("boot script catches storage failures and still assigns both attributes", () => {
    expect(BOOT_SCRIPT).toContain("throttleforge-theme");
    expect(BOOT_SCRIPT).toContain("throttleforge-sidebar");
    expect(BOOT_SCRIPT).toContain("catch");
    expect(BOOT_SCRIPT).toContain("dataset.theme");
    expect(BOOT_SCRIPT).toContain("dataset.sidebar");
  });
});
