<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from "vue";
import Button from "../Button/Button.vue";
import Notice from "../Notice/Notice.vue";
import Skeleton from "../Skeleton/Skeleton.vue";
import { sanitizeArticleHtml } from "../../lib/sanitizeArticleHtml";
import { fetchArticleHtml } from "../../lib/wikipedia/html";
import "./reader.css";

export interface ArticleReaderProps {
  title: string;
  pageUrl: string;
  /** Shown immediately, so the panel is never blank while the article loads. */
  preview?: string;
}

const props = withDefaults(defineProps<ArticleReaderProps>(), { preview: "" });
const emit = defineEmits<{ navigate: [title: string] }>();

const html = ref<string | null>(null);
const failed = ref(false);
const loading = ref(true);
const container = ref<HTMLElement | null>(null);

let controller: AbortController | null = null;

async function load(): Promise<void> {
  controller?.abort();
  controller = new AbortController();
  const { signal } = controller;

  html.value = null;
  failed.value = false;
  loading.value = true;

  try {
    const raw = await fetchArticleHtml(props.title, signal);
    if (signal.aborted) return;
    html.value = sanitizeArticleHtml(raw, { baseUrl: props.pageUrl });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") return;
    failed.value = true;
  } finally {
    if (!signal.aborted) loading.value = false;
  }
}

// Fetch only when a reader is actually open, and never ahead of time: these
// documents run from 100 KB to about a megabyte.
watch(() => props.title, load, { immediate: true });

onScopeDispose(() => controller?.abort());

const historyUrl = computed(() => `${props.pageUrl}?action=history`);

/*
  One delegated handler rather than a listener per link — an article can contain
  hundreds.

  Internal wiki links stay in the app; same-document anchors scroll the panel
  rather than navigating, which would otherwise fight the app's own URL; anything
  else is left to the browser.
*/
function onClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest("a");
  if (!anchor) return;

  const wikiTitle = anchor.getAttribute("data-wiki-title");
  if (wikiTitle) {
    event.preventDefault();
    emit("navigate", wikiTitle);
    return;
  }

  const href = anchor.getAttribute("href");
  if (href?.startsWith("#")) {
    event.preventDefault();
    const id = decodeURIComponent(href.slice(1));
    const destination = container.value?.querySelector(`[id="${CSS.escape(id)}"]`);
    destination?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
</script>

<template>
  <!--
    The click handler is delegation over the article's own anchors, not an
    interaction on this container. Anchors are keyboard-operable natively —
    Enter on a link dispatches a click that bubbles to here — so adding a keydown
    listener would double-fire rather than add access.
  -->
  <!-- eslint-disable-next-line vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/no-static-element-interactions -->
  <div ref="container" @click="onClick">
    <div v-if="loading" class="flex flex-col gap-3">
      <p v-if="preview" class="text-sm text-text-muted">{{ preview }}</p>
      <Skeleton class="w-11/12" label="Loading article" />
      <Skeleton class="w-full" />
      <Skeleton class="w-4/5" />
      <Skeleton shape="rect" class="h-40 w-full" />
      <Skeleton class="w-full" />
      <Skeleton class="w-3/4" />
    </div>

    <Notice
      v-else-if="failed"
      tone="error"
      title="Couldn't load the article"
      message="It may have moved, or the connection dropped."
    >
      <Button size="sm" variant="secondary" @click="load">Try again</Button>
    </Notice>

    <!--
      Injecting third-party HTML is the point of this component, and the reason
      sanitizeArticleHtml exists: allowlist-based, parsed inert through
      DOMParser, covered by 31 tests, and backed by the CSP in index.html.
    -->
    <!-- eslint-disable-next-line vue/no-v-html -->
    <div v-else class="wiki-article" v-html="html ?? ''" />

    <p v-if="!loading && !failed" class="mt-6 border-t border-border pt-3 text-xs text-text-muted">
      From
      <a :href="pageUrl" target="_blank" rel="noreferrer" class="text-primary hover:underline">
        Wikipedia
      </a>
      —
      <a
        href="https://creativecommons.org/licenses/by-sa/4.0/"
        target="_blank"
        rel="noreferrer"
        class="text-primary hover:underline"
      >
        CC BY-SA 4.0
      </a>
      ·
      <a :href="historyUrl" target="_blank" rel="noreferrer" class="text-primary hover:underline">
        Authors
      </a>
    </p>
  </div>
</template>
