import { isAbortError } from "./http";

export type ShareResult = "shared" | "copied" | "cancelled" | "failed";

export interface ShareInput {
  title: string;
  url: string;
}

/*
  Two details that are easy to get wrong and hard to notice afterwards:

  1. The availability check must be synchronous, before any await. navigator.share
     requires transient user activation, and a single await between the click and
     the call spends it — on Safari the call then rejects with no visible reason.
  2. An AbortError from share is the user dismissing the sheet. Reporting that as
     a failure tells them something went wrong when they simply changed their mind.
*/
export async function shareArticle(input: ShareInput): Promise<ShareResult> {
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  if (canShare) {
    try {
      await navigator.share({ title: input.title, url: input.url });
      return "shared";
    } catch (error) {
      if (isAbortError(error)) return "cancelled";
      // Fall through: some browsers advertise share and then refuse it.
    }
  }

  // Clipboard access needs a secure context, so this is undefined over plain
  // http on a LAN — which is exactly how a phone reaches a dev server.
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(input.url);
      return "copied";
    } catch {
      return "failed";
    }
  }

  return "failed";
}
