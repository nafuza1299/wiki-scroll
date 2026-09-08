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

<!--
  The whole card opens the article, but the card itself is not the control.

  Making the container role="button" would nest the Wikipedia link inside a
  button role, which is invalid. Instead the title is a real <button> whose
  ::after is stretched over the card: one focusable primary control, Enter and
  Space for free, a real focus ring, and no @click.stop hack on the link — which
  only existed to stop the link from also triggering the container's handler.

  Anything else interactive in the card has to sit above that stretched
  pseudo-element, hence `relative z-10` on the link.
-->
<template>
  <article
    :data-index="index"
    class="relative overflow-hidden rounded-2xl border border-border bg-bg text-text hover:bg-surface-hover focus-within:ring-2 focus-within:ring-primary"
  >
    <div class="flex h-44 w-full items-center justify-center bg-surface">
      <img
        v-if="article.thumbnailUrl"
        :src="article.thumbnailUrl"
        :alt="article.title"
        class="h-full w-full object-cover"
      />
      <span v-else class="text-4xl font-bold text-text-muted">W</span>
    </div>
    <div class="flex flex-col gap-1 p-3">
      <h2 class="text-base font-bold">
        <button
          type="button"
          class="text-left after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none"
          @click="$emit('open')"
        >
          {{ article.title }}
        </button>
      </h2>
      <p class="line-clamp-2 text-sm text-text-muted">{{ article.extract }}</p>
      <div class="flex flex-wrap gap-3 text-xs text-text-muted">
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
        <a
          :href="article.pageUrl"
          target="_blank"
          rel="noreferrer"
          class="relative z-10 text-primary hover:underline"
        >
          Wikipedia ↗
        </a>
      </div>
    </div>
  </article>
</template>
