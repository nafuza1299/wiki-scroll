<script setup lang="ts">
import { computed, onErrorCaptured, ref } from "vue";
import ArticleCard from "./components/ArticleCard/ArticleCard.vue";
import ArticleReader from "./components/ArticleReader/ArticleReader.vue";
import Button from "./components/Button/Button.vue";
import { Modal } from "./components/Modal/Modal";
import Notice from "./components/Notice/Notice.vue";
import SearchBar from "./components/SearchBar/SearchBar.vue";
import Skeleton from "./components/Skeleton/Skeleton.vue";
import ThemeToggle from "./components/ThemeToggle/ThemeToggle.vue";
import type { FeedMode } from "./composables/feedReducer";
import { useAppRoute } from "./composables/useAppRoute";
import { useArticleFeed } from "./composables/useArticleFeed";
import { useFeedKeyboard } from "./composables/useFeedKeyboard";
import { useSavedArticles } from "./composables/useSavedArticles";
import { useSeenArticles } from "./composables/useSeenArticles";
import { articleShareUrl, defaultRoute } from "./lib/routes";
import { shareArticle } from "./lib/share";
import type { Article } from "./lib/wikipedia/article";

/*
  The URL owns view, seed and open article. Everything below reads from `route`
  and writes only through `navigate`, so a shared link, the Back button and the
  in-app controls all go through one path.

  The feed is regenerated randomly, so a restored scroll offset would land on a
  different article than it did last time.
*/
history.scrollRestoration = "manual";

const { route, navigate, canGoBack, back } = useAppRoute();

const view = computed(() => route.value.view);
const query = computed(() => route.value.query);

const mode = computed<FeedMode>(() => {
  if (route.value.related) return { kind: "related", title: route.value.related };
  if (route.value.query) return { kind: "search", query: route.value.query };
  return { kind: "random" };
});

function search(next: string): void {
  navigate({ ...route.value, query: next, related: null, article: null }, { replace: true });
}

function showRelatedTo(title: string): void {
  navigate({ ...defaultRoute, related: title });
}

function backToRandom(): void {
  navigate({ ...route.value, query: "", related: null });
}

function toggleView(): void {
  navigate({ ...route.value, view: view.value === "saved" ? "feed" : "saved", article: null });
}

const { articles, status, more, error, retry, step, activeArticle, registerCard } =
  useArticleFeed(mode);
const { saved, count: savedCount, isSaved, toggle, clear: clearSaved } = useSavedArticles();
const { count: seenCount, clear: clearSeen } = useSeenArticles();

// Vue's equivalent of an error boundary. Without it, a render error anywhere
// below unmounts the whole app and leaves a blank page with a console trace.
const fatal = ref<string | null>(null);
onErrorCaptured((caught) => {
  fatal.value = caught instanceof Error ? caught.message : String(caught);
  return false;
});

const helpOpen = ref(false);
const shareNotice = ref("");
const searchBar = ref<InstanceType<typeof SearchBar> | null>(null);

/*
  A deep link can arrive with an empty feed, so the reader is addressed by title
  rather than by an Article. Everything it needs beyond the title it fetches
  itself; a matching card, when there is one, only supplies the preview text.
*/
const openTitle = computed(() => route.value.article);
const openArticleData = computed<Article | null>(() => {
  const title = openTitle.value;
  if (!title) return null;
  const known = [...articles.value, ...saved.value].find((candidate) => candidate.title === title);
  return (
    known ?? {
      id: -1,
      title,
      extract: "",
      thumbnailUrl: null,
      pageUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      createdAt: null,
      lastEdited: null,
      viewCount30d: null,
    }
  );
});

// Pushed, not replaced, so Back closes the reader — which is what the hardware
// Back button on Android is expected to do.
function openArticle(article: Article): void {
  navigate({ ...route.value, article: article.title });
}

function openByTitle(title: string): void {
  navigate({ ...route.value, article: title });
}

function closeReader(): void {
  if (canGoBack()) back();
  else navigate({ ...route.value, article: null }, { replace: true });
}

async function share(article: Article): Promise<void> {
  // The app's own link, not Wikipedia's — sharing the reader is the point.
  const result = await shareArticle({
    title: article.title,
    url: articleShareUrl(article.title),
  });
  if (result === "copied") shareNotice.value = "Link copied";
  else if (result === "failed") shareNotice.value = "Couldn't share that link";
  else shareNotice.value = "";

  if (shareNotice.value) setTimeout(() => (shareNotice.value = ""), 2500);
}

useFeedKeyboard({
  // Modal owns the keyboard while it is open; this stands down rather than
  // racing its listener.
  enabled: computed(() => !openTitle.value && !helpOpen.value && view.value === "feed"),
  step,
  open: () => {
    const article = activeArticle();
    if (article) openArticle(article);
  },
  toggleSave: () => {
    const article = activeArticle();
    if (article) toggle(article);
  },
  focusSearch: () => searchBar.value?.focus(),
  clearSeed: () => {
    if (mode.value.kind !== "random") backToRandom();
  },
  toggleHelp: () => (helpOpen.value = !helpOpen.value),
});

const shortcuts = [
  { keys: "j / k", description: "Move between articles" },
  { keys: "Enter / o", description: "Open the current article" },
  { keys: "s", description: "Save or unsave the current article" },
  { keys: "/", description: "Focus the search box" },
  { keys: "Esc", description: "Back to the random feed" },
  { keys: "?", description: "Show this list" },
];

function reload(): void {
  window.location.reload();
}
</script>

<template>
  <div class="h-screen w-screen overflow-y-auto">
    <div class="mx-auto flex max-w-xl flex-col gap-3 p-4">
      <header class="flex items-center justify-between gap-2">
        <h1 class="text-lg font-bold">Wiki Scroll</h1>
        <div class="flex items-center gap-1">
          <Button variant="ghost" size="sm" :aria-pressed="view === 'saved'" @click="toggleView">
            Saved{{ savedCount ? ` (${savedCount})` : "" }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            aria-label="Keyboard shortcuts"
            @click="helpOpen = true"
          >
            ?
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <Notice
        v-if="fatal"
        tone="error"
        title="Something broke"
        message="Reloading usually clears it."
      >
        <Button @click="reload">Reload</Button>
      </Notice>

      <main v-else-if="view === 'saved'" class="flex flex-col gap-3">
        <Notice
          v-if="saved.length === 0"
          title="Nothing saved yet"
          message="Tap the bookmark on a card to keep it here."
        />
        <ArticleCard
          v-for="(article, index) in saved"
          :key="article.id"
          :article="article"
          :index="index"
          saved
          @open="openArticle(article)"
          @toggle-save="toggle(article)"
          @share="share(article)"
        />
        <div v-if="saved.length" class="flex justify-end pt-2">
          <Button variant="ghost" size="sm" @click="clearSaved">Clear saved</Button>
        </div>
        <!--
          Reading history is a recency filter with a cap, not a permanent
          memory, so it is surfaced and clearable rather than silently promised.
        -->
        <div
          v-if="seenCount"
          class="flex items-center justify-between pt-2 text-xs text-text-muted"
        >
          <span>{{ seenCount }} recently read, hidden from the feed</span>
          <Button variant="ghost" size="sm" @click="clearSeen">Clear history</Button>
        </div>
      </main>

      <main v-else class="flex flex-col gap-3">
        <SearchBar ref="searchBar" :model-value="query" @update:model-value="search" />

        <!-- Says what the feed is currently showing, and how to leave it. -->
        <div
          v-if="mode.kind !== 'random'"
          class="flex items-center justify-between gap-2 rounded-md bg-tag-blue-bg px-3 py-2 text-sm text-tag-blue-text"
        >
          <span class="min-w-0 truncate">
            {{
              mode.kind === "search" ? `Results for “${mode.query}”` : `Similar to ${mode.title}`
            }}
          </span>
          <Button variant="ghost" size="sm" class="shrink-0" @click="backToRandom">
            Back to random
          </Button>
        </div>

        <!-- First load. One labelled skeleton per region, not per placeholder. -->
        <div v-if="status === 'loading'" class="flex flex-col gap-3">
          <Skeleton shape="rect" class="h-44 w-full rounded-2xl" label="Loading articles" />
          <Skeleton class="w-3/4" />
          <Skeleton class="w-1/2" />
        </div>

        <!--
          The state this rewrite exists for. A failed first load previously had
          no representation at all, so the skeleton above rendered forever.
        -->
        <Notice
          v-else-if="status === 'error'"
          tone="error"
          title="Couldn't load articles"
          :message="error ?? undefined"
        >
          <Button @click="retry">Try again</Button>
        </Notice>

        <Notice
          v-else-if="status === 'empty'"
          :title="mode.kind === 'search' ? 'No matches' : 'Nothing to show'"
          :message="
            mode.kind === 'search'
              ? 'Try a different search.'
              : 'Wikipedia returned no articles we could display.'
          "
        >
          <Button variant="secondary" @click="mode.kind === 'random' ? retry() : backToRandom()">
            {{ mode.kind === "random" ? "Try again" : "Back to random" }}
          </Button>
        </Notice>

        <div v-else class="flex flex-col gap-3">
          <ArticleCard
            v-for="(article, index) in articles"
            :key="article.id"
            :ref="registerCard(index)"
            :article="article"
            :index="index"
            :saved="isSaved(article.id)"
            @open="openArticle(article)"
            @toggle-save="toggle(article)"
            @share="share(article)"
          />

          <!-- Loading more was previously announced to nobody. -->
          <div
            v-if="more === 'loading'"
            role="status"
            aria-live="polite"
            aria-label="Loading more articles"
            class="flex justify-center py-4"
          >
            <div
              class="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary"
            />
          </div>

          <!-- A failed page keeps the pages that already loaded. -->
          <Notice
            v-else-if="more === 'error'"
            compact
            tone="error"
            title="Couldn't load more"
            :message="error ?? undefined"
          >
            <Button size="sm" variant="secondary" @click="retry">Try again</Button>
          </Notice>

          <Notice v-else-if="more === 'exhausted'" compact title="That's everything." />
        </div>
      </main>
    </div>

    <!-- Transient, polite: a share confirmation should not interrupt anything. -->
    <div
      v-if="shareNotice"
      role="status"
      aria-live="polite"
      class="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-md border border-border bg-surface px-4 py-2 text-sm text-text shadow-elevation"
    >
      {{ shareNotice }}
    </div>

    <Modal v-model:open="helpOpen" size="sm">
      <Modal.Header>
        <Modal.Title>Keyboard shortcuts</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <template v-for="shortcut in shortcuts" :key="shortcut.keys">
            <dt class="font-mono text-text-muted">{{ shortcut.keys }}</dt>
            <dd>{{ shortcut.description }}</dd>
          </template>
        </dl>
        <p class="mt-4 text-xs text-text-muted">
          Arrow keys are left alone on purpose — they are how you scroll the page.
        </p>
      </Modal.Body>
    </Modal>

    <Modal :open="openArticleData !== null" size="reader" @update:open="closeReader">
      <template v-if="openArticleData">
        <Modal.Header>
          <Modal.Title>{{ openArticleData.title }}</Modal.Title>
        </Modal.Header>
        <Modal.Body scrollable>
          <ArticleReader
            :key="openArticleData.title"
            :title="openArticleData.title"
            :page-url="openArticleData.pageUrl"
            :preview="openArticleData.extract"
            @navigate="openByTitle"
          />
        </Modal.Body>
        <Modal.Footer>
          <a
            :href="openArticleData.pageUrl"
            target="_blank"
            rel="noreferrer"
            class="mr-auto text-sm text-primary hover:underline"
          >
            Open in Wikipedia ↗
          </a>
          <Button variant="secondary" size="sm" @click="showRelatedTo(openArticleData.title)">
            More like this
          </Button>
        </Modal.Footer>
      </template>
    </Modal>
  </div>
</template>
