<script setup lang="ts">
import { computed } from "vue";
import Button from "../Button/Button.vue";
import { formatDate, formatViews } from "../../lib/format";
import type { Article } from "../../lib/wikipedia/article";

export interface ArticleCardProps {
  article: Article;
  index: number;
  saved?: boolean;
}

const props = withDefaults(defineProps<ArticleCardProps>(), { saved: false });
defineEmits<{ open: []; "toggle-save": []; share: [] }>();

// Both can be null: the API may omit a timestamp, and it may be unparseable.
// A field that cannot be formatted is omitted rather than shown as nonsense.
const editedOn = computed(() => formatDate(props.article.lastEdited));
const createdOn = computed(() => formatDate(props.article.createdAt));
const views = computed(() => formatViews(props.article.viewCount30d));
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
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover"
      />
      <span v-else class="text-4xl font-bold text-text-muted">W</span>
    </div>
    <div class="flex flex-col gap-1 p-3">
      <div class="flex items-start justify-between gap-2">
        <h2 class="text-base font-bold">
          <button
            type="button"
            class="text-left after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none"
            @click="$emit('open')"
          >
            {{ article.title }}
          </button>
        </h2>
        <!-- Above the stretched pseudo-element, or the card would swallow these. -->
        <div class="relative z-10 flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :aria-pressed="saved"
            :aria-label="saved ? `Remove ${article.title} from saved` : `Save ${article.title}`"
            @click="$emit('toggle-save')"
          >
            <svg
              viewBox="0 0 24 24"
              :fill="saved ? 'currentColor' : 'none'"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              :class="saved ? 'text-primary' : ''"
              aria-hidden="true"
            >
              <path
                d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"
                stroke-linejoin="round"
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon-only
            :aria-label="`Share ${article.title}`"
            @click="$emit('share')"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="h-4 w-4"
              aria-hidden="true"
            >
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" stroke-linecap="round" />
            </svg>
          </Button>
        </div>
      </div>
      <p class="line-clamp-2 text-sm text-text-muted">{{ article.extract }}</p>
      <div class="flex flex-wrap gap-3 text-xs text-text-muted">
        <span>{{ views }}</span>
        <span v-if="editedOn">Edited {{ editedOn }}</span>
        <span v-if="createdOn">Created {{ createdOn }}</span>
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
