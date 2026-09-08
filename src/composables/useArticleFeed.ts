import { onMounted, onScopeDispose, ref, shallowRef, watch } from "vue";
import { forEachLimit } from "../lib/concurrency";
import type { Article } from "../lib/wikipedia/article";
import { enrichArticle, loadRandomPage } from "../lib/wikipedia/feedSource";

const BATCH_SIZE = 10;
const ENRICH_CONCURRENCY = 4;

/*
  Wired to the new data layer, but the state machine is unchanged: there is still
  no .catch() on either load path, so a total failure still hangs on the
  skeleton. That is fixed in the next commit, which replaces this whole
  composable; keeping the two apart is what makes either diff readable.
*/
export function useArticleFeed(): {
  articles: typeof articles;
  isFetchingMore: typeof isFetchingMore;
  observeCard: (element: Element | null) => void;
} {
  const articles = shallowRef<Article[]>([]);
  const currentIndex = ref(0);
  const isFetchingMore = ref(false);

  let batchInFlight = false;
  let observer: IntersectionObserver | null = null;
  const controller = new AbortController();

  /**
   * Patches view counts and creation dates onto cards that are already on
   * screen. Enrichment never fails the page — a card without a view count is
   * still a card.
   */
  function enrich(page: readonly Article[]): void {
    void forEachLimit(page, ENRICH_CONCURRENCY, async (article) => {
      const extra = await enrichArticle(article.title, controller.signal);
      articles.value = articles.value.map((current) =>
        current.id === article.id ? { ...current, ...extra } : current,
      );
    }).catch(() => {
      // Cancelled, or the network is gone. The cards stand as they are.
    });
  }

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          currentIndex.value = Number((entry.target as HTMLElement).dataset.index);
        }
      },
      { threshold: 0.5 },
    );

    batchInFlight = true;
    void loadRandomPage({ size: BATCH_SIZE, signal: controller.signal }).then((page) => {
      articles.value = page.articles;
      batchInFlight = false;
      enrich(page.articles);
    });
  });

  watch([currentIndex, () => articles.value.length], ([index, length]) => {
    if (length === 0 || batchInFlight) return;
    if (index !== length - 1) return;

    batchInFlight = true;
    isFetchingMore.value = true;
    void loadRandomPage({
      size: BATCH_SIZE,
      signal: controller.signal,
      exclude: new Set(articles.value.map((article) => article.id)),
    }).then((page) => {
      articles.value = [...articles.value, ...page.articles];
      batchInFlight = false;
      isFetchingMore.value = false;
      enrich(page.articles);
    });
  });

  onScopeDispose(() => {
    controller.abort();
    observer?.disconnect();
  });

  function observeCard(element: Element | null): void {
    if (element) observer?.observe(element);
  }

  return { articles, isFetchingMore, observeCard };
}
