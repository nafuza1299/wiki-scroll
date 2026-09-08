<script setup lang="ts">
import { ref } from "vue";
import ArticleCard from "./components/ArticleCard/ArticleCard.vue";
import { Modal } from "./components/Modal/Modal";
import Skeleton from "./components/Skeleton/Skeleton.vue";
import ThemeToggle from "./components/ThemeToggle/ThemeToggle.vue";
import { useArticleFeed } from "./composables/useArticleFeed";
import type { Article } from "./lib/wikipedia";

const { articles, isFetchingMore, observeCard } = useArticleFeed();

const selectedArticle = ref<Article | null>(null);
const iframeLoaded = ref(false);

function openArticle(article: Article): void {
  iframeLoaded.value = false;
  selectedArticle.value = article;
}

// A component ref hands back the instance; the feed observes elements. Vue calls
// this with null on unmount.
function registerCard(instance: unknown): void {
  const element = (instance as { $el?: unknown } | null)?.$el;
  observeCard(element instanceof Element ? element : null);
}
</script>

<template>
  <div v-if="articles.length === 0" class="max-w-xl mx-auto flex flex-col gap-3 p-4">
    <Skeleton shape="rect" class="h-44 w-full rounded-2xl" label="Loading articles" />
    <Skeleton class="w-3/4" />
    <Skeleton class="w-1/2" />
  </div>

  <div v-else class="h-screen w-screen overflow-y-auto">
    <div class="max-w-xl mx-auto flex flex-col gap-3 p-4">
      <div class="flex items-center justify-between">
        <h1 class="text-lg font-bold">Wiki Scroll</h1>
        <ThemeToggle />
      </div>

      <ArticleCard
        v-for="(article, index) in articles"
        :key="article.id"
        :ref="registerCard"
        :article="article"
        :index="index"
        @open="openArticle(article)"
      />

      <div v-if="isFetchingMore" class="flex justify-center py-4">
        <div class="h-6 w-6 rounded-full border-2 border-border border-t-primary animate-spin" />
      </div>
    </div>

    <Modal :open="selectedArticle !== null" size="reader" @update:open="selectedArticle = null">
      <template v-if="selectedArticle">
        <Modal.Header>
          <Modal.Title>{{ selectedArticle.title }}</Modal.Title>
        </Modal.Header>
        <Modal.Body class="p-0 relative overflow-hidden">
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
