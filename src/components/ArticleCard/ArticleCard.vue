<script setup lang="ts">
import type { Article } from "../../lib/wikipedia";

const viewFormatter = new Intl.NumberFormat("en-US", { notation: "compact" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export interface ArticleCardProps {
  article: Article;
  index: number;
}

defineProps<ArticleCardProps>();
defineEmits<{ open: [] }>();
</script>

<template>
  <section
    :data-index="index"
    class="rounded-2xl border border-border overflow-hidden bg-bg text-text cursor-pointer hover:bg-surface-hover"
    @click="$emit('open')"
  >
    <div class="h-44 w-full flex items-center justify-center bg-surface">
      <img
        v-if="article.thumbnailUrl"
        :src="article.thumbnailUrl"
        :alt="article.title"
        class="h-full w-full object-cover"
      />
      <span v-else class="text-4xl font-bold text-text-muted">W</span>
    </div>
    <div class="p-3 flex flex-col gap-1">
      <h2 class="text-base font-bold">
        <a
          :href="article.pageUrl"
          target="_blank"
          rel="noreferrer"
          class="hover:underline"
          @click.stop
        >
          {{ article.title }}
        </a>
      </h2>
      <p class="text-sm text-text-muted line-clamp-2">{{ article.extract }}</p>
      <div class="flex gap-3 text-xs text-text-muted">
        <span>
          {{
            article.viewCount30d !== null
              ? `${viewFormatter.format(article.viewCount30d)} views / 30d`
              : "views unavailable"
          }}
        </span>
        <span>Edited {{ dateFormatter.format(new Date(article.lastEdited)) }}</span>
        <span v-if="article.createdAt">
          Created {{ dateFormatter.format(new Date(article.createdAt)) }}
        </span>
      </div>
    </div>
  </section>
</template>
