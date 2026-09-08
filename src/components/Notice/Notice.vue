<script lang="ts">
export type NoticeTone = "error" | "neutral";

export interface NoticeProps {
  title: string;
  message?: string;
  /** "error" announces assertively; "neutral" is a quiet, expected outcome. */
  tone?: NoticeTone;
  /** Renders inline rather than as a full-height panel. */
  compact?: boolean;
}
</script>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<NoticeProps>(), {
  message: undefined,
  tone: "neutral",
  compact: false,
});

const isError = computed(() => props.tone === "error");
</script>

<template>
  <div
    :role="isError ? 'alert' : 'status'"
    :aria-live="isError ? 'assertive' : 'polite'"
    :class="[
      'flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface text-center',
      compact ? 'px-4 py-4' : 'px-6 py-12',
    ]"
  >
    <p :class="['font-semibold', isError ? 'text-danger' : 'text-text']">{{ title }}</p>
    <p v-if="message" class="max-w-sm text-sm text-text-muted">{{ message }}</p>
    <slot />
  </div>
</template>
