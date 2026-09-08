import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
  The theme script in index.html has to be inline: it writes [data-theme] before
  the first paint, and an external file would cost a round trip in front of it.
  Allowing it by hash is what lets script-src stay free of 'unsafe-inline', which
  is the part of the policy that actually blocks a missed inline handler or
  javascript: URL.

  A hash is brittle by nature — reformatting the script silently invalidates it,
  and the only symptom is the theme quietly failing to apply. This test
  recomputes it from the file, so that drift fails here instead of in production.
*/

const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");

function cspContent(): string {
  const meta = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([\s\S]*?)"\s*\/>/.exec(
    html,
  );
  if (!meta) throw new Error("No Content-Security-Policy meta tag in index.html");
  return meta[1];
}

function inlineScripts(): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

describe("Content-Security-Policy", () => {
  it("is present", () => {
    expect(cspContent()).toContain("default-src 'self'");
  });

  it("allows every inline script by hash", () => {
    const csp = cspContent();
    const scripts = inlineScripts();

    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      const hash = createHash("sha256").update(script, "utf8").digest("base64");
      expect(csp).toContain(`'sha256-${hash}'`);
    }
  });

  it("does not weaken script-src with unsafe-inline or unsafe-eval", () => {
    const scriptSrc = /script-src([^;]*);/.exec(cspContent())?.[1] ?? "";

    expect(scriptSrc).not.toContain("unsafe-inline");
    expect(scriptSrc).not.toContain("unsafe-eval");
  });

  it("blocks framing, plugins and base-tag hijacking", () => {
    const csp = cspContent();

    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
  });

  it("restricts where the app may connect and load images from", () => {
    const csp = cspContent();

    expect(csp).toContain("connect-src 'self' https://en.wikipedia.org");
    expect(csp).toContain("img-src 'self' data:");
  });
});
