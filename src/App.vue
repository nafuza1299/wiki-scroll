<script setup lang="ts">
import { onErrorCaptured, ref } from "vue";
import ArticleCard from "./components/ArticleCard/ArticleCard.vue";
import Button from "./components/Button/Button.vue";
import { Modal } from "./components/Modal/Modal";
import Notice from "./components/Notice/Notice.vue";
import Skeleton from "./components/Skeleton/Skeleton.vue";
import ThemeToggle from "./components/ThemeToggle/ThemeToggle.vue";
import type { FeedMode } from "./composables/feedReducer";
import { useArticleFeed } from "./composables/useArticleFeed";
import { useSavedArticles } from "./composables/useSavedArticles";
import { useSeenArticles } from "./composables/useSeenArticles";
import type { Article } from "./lib/wikipedia/article";

const mode = ref<FeedMode>({ kind: "random" });
const { articles, status, more, error, retry, registerCard } = useArticleFeed(mode);
const { saved, count: savedCount, isSaved, toggle, clear: clearSaved } = useSavedArticles();
const { count: seenCount, clear: clearSeen } = useSeenArticles();

const view = ref<"feed" | "saved">("feed");

const selectedArticle = ref<Article | null>(null);
const iframeLoaded = ref(false);

// Vue's equivalent of an error boundary. Without it, a render error anywhere
// below unmounts the whole app and leaves a blank page with a console trace.
const fatal = ref<string | null>(null);
onErrorCaptured((caught) => {
  fatal.value = caught instanceof Error ? caught.message : String(caught);
  return false;
});

function openArticle(article: Article): void {
  iframeLoaded.value = false;
  selectedArticle.value = article;
}

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
          <Button
            variant="ghost"
            size="sm"
            :aria-pressed="view === 'saved'"
            @click="view = view === 'saved' ? 'feed' : 'saved'"
          >
            Saved{{ savedCount ? ` (${savedCount})` : "" }}
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

      <main v-else>
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
          title="Nothing to show"
          message="Wikipedia returned no articles we could display."
        >
          <Button variant="secondary" @click="retry">Try again</Button>
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

    <Modal :open="selectedArticle !== null" size="reader" @update:open="selectedArticle = null">
      <template v-if="selectedArticle">
        <Modal.Header>
          <Modal.Title>{{ selectedArticle.title }}</Modal.Title>
        </Modal.Header>
        <Modal.Body class="relative overflow-hidden p-0">
          <Skeleton v-if="!iframeLoaded" shape="rect" class="absolute inset-0 rounded-none" />
          <iframe
            :key="selectedArticle.id"
            :src="selectedArticle.pageUrl"
            :title="selectedArticle.title"
            class="absolute top-0 left-0 h-1/2 w-1/2 origin-top-left scale-[2]"
            @load="iframeLoaded = true"
          />
        </Modal.Body>
        <Modal.Footer>
          <a
            :href="selectedArticle.pageUrl"
            target="_blank"
            rel="noreferrer"
            class="text-sm text-primary hover:underline"
          >
            Open in Wikipedia ↗
          </a>
        </Modal.Footer>
      </template>
    </Modal>
  </div>
</template>
