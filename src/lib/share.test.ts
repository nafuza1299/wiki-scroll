import { afterEach, describe, expect, it, vi } from "vitest";
import { shareArticle } from "./share";

const input = { title: "Marie Curie", url: "https://wiki.example/?article=Marie+Curie" };

function stubShare(implementation: (data: ShareData) => Promise<void>): void {
  Object.defineProperty(navigator, "share", {
    value: implementation,
    configurable: true,
    writable: true,
  });
}

function stubClipboard(implementation: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, "clipboard", {
    value: implementation ? { writeText: implementation } : undefined,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "share");
  Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
});

describe("shareArticle", () => {
  it("uses the native share sheet with the app's link", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubShare(share);

    await expect(shareArticle(input)).resolves.toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: input.title, url: input.url });
  });

  /*
    An AbortError from navigator.share is the user dismissing the sheet.
    Reporting that as a failure tells them something broke when they simply
    changed their mind.
  */
  it("treats a dismissed share sheet as cancelled, not failed", async () => {
    stubShare(() => Promise.reject(new DOMException("dismissed", "AbortError")));

    await expect(shareArticle(input)).resolves.toBe("cancelled");
  });

  it("falls back to the clipboard when sharing is unavailable", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    await expect(shareArticle(input)).resolves.toBe("copied");
    expect(writeText).toHaveBeenCalledWith(input.url);
  });

  it("falls back to the clipboard when share is advertised but refuses", async () => {
    stubShare(() => Promise.reject(new Error("NotAllowedError")));
    stubClipboard(vi.fn().mockResolvedValue(undefined));

    await expect(shareArticle(input)).resolves.toBe("copied");
  });

  /*
    navigator.clipboard is undefined outside a secure context — which is exactly
    how a phone reaches a dev server over plain http on a LAN.
  */
  it("reports failure when neither route is available", async () => {
    stubClipboard(undefined);

    await expect(shareArticle(input)).resolves.toBe("failed");
  });

  it("reports failure when the clipboard write is refused", async () => {
    stubClipboard(() => Promise.reject(new Error("denied")));

    await expect(shareArticle(input)).resolves.toBe("failed");
  });
});
