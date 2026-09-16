import { expect, test } from "@playwright/test";
import { installRoutes } from "./routes";

/*
  Is the Content-Security-Policy actually enforced?

  src/test/csp.test.ts recomputes the SHA-256 of the inline theme script and
  compares it to the meta tag, which proves the policy *text* is self-consistent.
  It cannot prove a browser honours it: jsdom has no CSP implementation at all.
  That gap matters because the CSP is the second line of defence behind
  sanitizeArticleHtml, and a second line nobody has tested is a guess.

  These tests deliberately bypass the sanitiser and attack the live page
  directly. That is the point: if the sanitiser is doing its job the CSP is never
  exercised through the reader, so it has to be probed on its own or it is only
  ever tested by the bug that gets past the sanitiser.

  Two traps, both of which produce a test that passes on a page with no policy
  at all:

  1. Every payload is appended through the DOM, never assigned via innerHTML.
     An innerHTML-inserted <script> never executes, CSP or not.
  2. Nothing here measures script execution *inside* page.evaluate. Playwright
     evaluates in an isolated world, and isolated worlds are exempt from the
     page's CSP in Chromium — so `eval()` called from here succeeds even though
     script-src carries no 'unsafe-eval'. The probes below all work by putting a
     node in the page's own document, where the document's policy governs. That
     eval is forbidden is covered by asserting on the policy text instead.
*/

interface ProbeResult {
  inlineScriptRan: boolean;
  externalScriptRan: boolean;
  baseUriChanged: boolean;
  themeApplied: boolean;
  violations: string[];
}

test("the CSP is enforced, and the hashed theme script is still exempt", async ({ page }) => {
  const routes = await installRoutes(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Fixture Alpha" })).toBeVisible();

  const result = await page.evaluate<ProbeResult>(async () => {
    const violations: string[] = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      violations.push(event.violatedDirective);
    });

    const marks = window as unknown as Record<string, boolean | undefined>;

    // 1. Inline script, appended as a real node so it would run under a policy
    //    carrying 'unsafe-inline'.
    const inline = document.createElement("script");
    inline.textContent = "window.__cspInline = true;";
    document.head.appendChild(inline);

    /*
      2. Script from an origin script-src does not list.

      Served by the interception layer from en.wikipedia.org — a host the policy
      allows to be *connected* to but not to be executed from. Pointing this at
      an unreachable host instead would make the assertion worthless, since a
      blocked load and a failed DNS lookup are indistinguishable from here.
    */
    const external = document.createElement("script");
    external.src = "https://en.wikipedia.org/e2e-probe.js";
    document.head.appendChild(external);

    // 3. frame-src 'none'. Same reasoning as the script: a target that would
    //    otherwise load, so only the policy can explain it not loading.
    const frame = document.createElement("iframe");
    frame.src = "https://en.wikipedia.org/e2e-probe-frame.html";
    document.body.appendChild(frame);

    // 4. base-uri 'none'. A hijacked <base> silently repoints every relative
    //    URL on the page, which is why it is in the policy.
    const originalBase = document.baseURI;
    const base = document.createElement("base");
    base.href = "https://evil.example/";
    document.head.appendChild(base);

    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      inlineScriptRan: marks.__cspInline === true,
      externalScriptRan: marks.__cspExternal === true,
      baseUriChanged: document.baseURI !== originalBase,
      // The control. Without it this test also passes on a page where scripts
      // are broken for some entirely different reason.
      themeApplied: ["light", "dark"].includes(document.documentElement.dataset.theme ?? ""),
      violations,
    };
  });

  expect(result.inlineScriptRan).toBe(false);
  expect(result.externalScriptRan).toBe(false);
  expect(result.baseUriChanged).toBe(false);
  expect(result.themeApplied).toBe(true);

  /*
    The unambiguous half. A subresource the policy refuses is never fetched at
    all, so the interception log — which sees every request the page makes —
    proves the block happened before the network rather than after.

    Reading it from inside the page does not work: a blocked frame and a frame
    that loaded cross-origin both leave contentDocument null.
  */
  const probed = routes.requested.filter((url) => url.includes("e2e-probe"));
  expect(probed).toEqual([]);

  /*
    And the policy is why, rather than some unrelated failure.

    Chromium reports the most specific directive that applied, so a script
    blocked by `script-src` surfaces as "script-src-elem" — the fallback
    directive it resolves to for a <script> element. Matching on the prefix keeps
    this honest without pinning it to one engine's reporting granularity.
  */
  expect(result.violations.filter((d) => d.startsWith("script-src"))).toHaveLength(2);
  expect(result.violations).toContain("frame-src");
  expect(result.violations).toContain("base-uri");
});

test("the built page ships the policy without 'unsafe-inline' in script-src", async ({ page }) => {
  await installRoutes(page);
  await page.goto("/");

  const policy = await page.evaluate(
    () =>
      document
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content") ?? "",
  );

  // The meta tag survives the production build — it is authored in index.html,
  // and nothing in the pipeline is expected to touch it, so this fails loudly if
  // that ever changes.
  const scriptSrc = /script-src([^;]*)/.exec(policy)?.[1] ?? "";
  expect(scriptSrc).not.toContain("unsafe-inline");
  expect(scriptSrc).not.toContain("unsafe-eval");
  expect(scriptSrc).toContain("sha256-");
  expect(policy).toContain("frame-src 'none'");
  expect(policy).toContain("object-src 'none'");
  expect(policy).toContain("base-uri 'none'");
});
