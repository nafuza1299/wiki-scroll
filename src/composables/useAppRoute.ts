import { onScopeDispose, shallowRef, type Ref } from "vue";
import { parseRoute, routesEqual, serializeRoute, type AppRoute } from "../lib/routes";

const ROUTE_EVENT = "wikiscroll:route";

export interface AppRouting {
  route: Ref<AppRoute>;
  navigate: (next: AppRoute, options?: { replace?: boolean }) => void;
  /** True when the current entry was pushed by this app, so Back will undo it. */
  canGoBack: () => boolean;
  back: () => void;
}

/*
  Three rules keep this from fighting Vue's reactivity, and all three matter:

  1. The URL is the single source of truth for view/seed/article. Feed *content*
     is component state and never touches the URL.
  2. Navigation happens only in event handlers — never from a watcher driven by
     state. That one rule is what prevents render → navigate → render loops.
  3. Reads flow URL → state; writes only ever go state → URL. Nothing round-trips.

  history.pushState does not fire popstate, so navigate dispatches its own event;
  the listener below is the only place the route is read back.
*/
export function useAppRoute(): AppRouting {
  const route = shallowRef<AppRoute>(parseRoute(location.search));
  let pushDepth = 0;

  function sync(): void {
    const next = parseRoute(location.search);
    if (!routesEqual(next, route.value)) route.value = next;
  }

  function onPopState(): void {
    pushDepth = Math.max(0, pushDepth - 1);
    sync();
  }

  window.addEventListener("popstate", onPopState);
  window.addEventListener(ROUTE_EVENT, sync);

  onScopeDispose(() => {
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener(ROUTE_EVENT, sync);
  });

  function navigate(next: AppRoute, options: { replace?: boolean } = {}): void {
    if (routesEqual(next, route.value)) return;

    const url = `${location.pathname}${serializeRoute(next)}`;
    if (options.replace) {
      history.replaceState(null, "", url);
    } else {
      history.pushState(null, "", url);
      pushDepth += 1;
    }

    route.value = next;
    window.dispatchEvent(new Event(ROUTE_EVENT));
  }

  return {
    route,
    navigate,
    canGoBack: () => pushDepth > 0,
    back: () => history.back(),
  };
}
