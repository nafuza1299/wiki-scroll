<script setup lang="ts">
import { onScopeDispose, ref, useId, watch } from "vue";
import Button from "../Button/Button.vue";
import { suggestTitles } from "../../lib/wikipedia/feedSource";

export interface SearchBarProps {
  /** The query currently driving the feed, so the field survives a reload. */
  modelValue: string;
}

const props = defineProps<SearchBarProps>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const draft = ref(props.modelValue);
const suggestions = ref<string[]>([]);
const listId = useId();

let debounce: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | null = null;

// Keeps the field in step when the query changes from elsewhere — a shared link,
// or "More like this" clearing the search.
watch(
  () => props.modelValue,
  (next) => {
    if (next !== draft.value) draft.value = next;
  },
);

/*
  Suggestions are debounced and the in-flight request is aborted on each
  keystroke: without that, results arrive out of order and the list flickers back
  to a stale prefix. suggestTitles never throws — a missing suggestion list is
  not worth interrupting typing for.
*/
watch(draft, (query) => {
  clearTimeout(debounce);
  controller?.abort();

  if (query.trim().length < 2) {
    suggestions.value = [];
    return;
  }

  debounce = setTimeout(() => {
    controller = new AbortController();
    const { signal } = controller;
    void suggestTitles(query, signal).then((titles) => {
      if (!signal.aborted) suggestions.value = titles;
    });
  }, 250);
});

onScopeDispose(() => {
  clearTimeout(debounce);
  controller?.abort();
});

function submit(): void {
  emit("update:modelValue", draft.value.trim());
}

function clear(): void {
  draft.value = "";
  suggestions.value = [];
  emit("update:modelValue", "");
}

const input = ref<HTMLInputElement | null>(null);

// Exposed for the "/" shortcut.
defineExpose({
  focus: () => {
    input.value?.focus();
    input.value?.select();
  },
});
</script>

<template>
  <form class="flex items-center gap-2" role="search" @submit.prevent="submit">
    <!-- The control is nested rather than paired by id: the association holds
         without a generated id, and it is statically checkable. -->
    <label class="min-w-0 flex-1">
      <span class="sr-only">Search Wikipedia</span>
      <input
        ref="input"
        v-model="draft"
        type="search"
        :list="listId"
        placeholder="Search Wikipedia…"
        autocomplete="off"
        class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </label>
    <!-- A native datalist: keyboard behaviour and screen-reader support for free. -->
    <datalist :id="listId">
      <option v-for="title in suggestions" :key="title" :value="title" />
    </datalist>
    <Button type="submit" size="sm" variant="secondary">Search</Button>
    <Button v-if="modelValue" size="sm" variant="ghost" @click="clear">Clear</Button>
  </form>
</template>
