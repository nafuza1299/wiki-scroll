import { onMounted, onScopeDispose, ref, shallowRef, watch } from "vue";
import { fetchBatch, type Article } from "../lib/wikipedia";

const BATCH_SIZE = 10;

/*
  A faithful port of the React hook, bugs included — the missing .catch() on both
  load paths, and the observer that is never unobserved. Keeping the port free of
  behaviour changes is what makes this commit reviewable as a port; both are
  fixed in the commit that introduces the feed state machine.
*/
export function useArticleFeed(): {
  articles: typeof articles;
  isFetchingMore: typeof isFetchingMore;
  observeCard: (element: Element | null) => void;
} {
  // shallowRef: the list grows without bound, and nothing mutates an Article in
  // place, so deep reactivity would be pure overhead.
  const articles = shallowRef<Article[]>([]);
  const currentIndex = ref(0);
  const isFetchingMore = ref(false);

  let batchInFlight = false;
  let observer: IntersectionObserver | null = null;

  onMounted(() => {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          currentIndex.value = index;
        }
      },
      { threshold: 0.5 },
    );

    batchInFlight = true;
    void fetchBatch(BATCH_SIZE).then((batch) => {
      articles.value = batch;
      batchInFlight = false;
    });
  });

  watch([currentIndex, () => articles.value.length], ([index, length]) => {
    if (length === 0 || batchInFlight) return;
    if (index !== length - 1) return;

    batchInFlight = true;
    isFetchingMore.value = true;
    void fetchBatch(BATCH_SIZE).then((batch) => {
      articles.value = [...articles.value, ...batch];
      batchInFlight = false;
      isFetchingMore.value = false;
    });
  });

  onScopeDispose(() => observer?.disconnect());

  function observeCard(element: Element | null): void {
    if (element) observer?.observe(element);
  }

  return { articles, isFetchingMore, observeCard };
}
