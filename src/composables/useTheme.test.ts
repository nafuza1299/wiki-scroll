import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/vue";
import userEvent from "@testing-library/user-event";
import ThemeToggle from "../components/ThemeToggle/ThemeToggle.vue";
import { resolveInitialTheme, setTheme, useTheme } from "./useTheme";

const STORAGE_KEY = "wiki-scroll:theme";

function stubPrefersDark(matches: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("resolveInitialTheme", () => {
  /*
    The ordering below is the whole contract. The blocking script in index.html
    has already painted using [data-theme], so the app's first render has to
    agree with it — storage is where the choice is persisted, the attribute is
    what is currently true.
  */
  it("prefers [data-theme] over a conflicting stored value", () => {
    document.documentElement.dataset.theme = "light";
    localStorage.setItem(STORAGE_KEY, "dark");

    expect(resolveInitialTheme()).toBe("light");
  });

  it("falls back to storage when the attribute is absent", () => {
    localStorage.setItem(STORAGE_KEY, "dark");

    expect(resolveInitialTheme()).toBe("dark");
  });

  it("ignores an unrecognised stored value", () => {
    localStorage.setItem(STORAGE_KEY, "chartreuse");
    stubPrefersDark(false);

    expect(resolveInitialTheme()).toBe("light");
  });

  it("falls back to the OS preference when nothing else is set", () => {
    stubPrefersDark(true);

    expect(resolveInitialTheme()).toBe("dark");
  });

  it("survives storage that throws on read", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    stubPrefersDark(false);

    expect(resolveInitialTheme()).toBe("light");
    vi.restoreAllMocks();
  });
});

describe("setTheme", () => {
  it("writes the attribute and persists the choice", () => {
    setTheme("light");

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
    expect(useTheme().theme.value).toBe("light");
  });

  it("still applies the attribute when storage throws on write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    expect(() => setTheme("dark")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
    vi.restoreAllMocks();
  });
});

describe("ThemeToggle", () => {
  it("labels the destination rather than the current state, and toggles", async () => {
    setTheme("dark");
    render(ThemeToggle);

    const button = screen.getByRole("button", { name: "Switch to light mode" });
    await userEvent.click(button);

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument();
  });
});
