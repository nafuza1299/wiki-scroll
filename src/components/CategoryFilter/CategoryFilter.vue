<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "../Button/Button.vue";
import { parseYear } from "../../lib/routes";

export interface CategoryFilterProps {
  /** The category currently driving the feed, bare name with no "Category:"
   *  prefix. Empty when category mode isn't active. */
  category: string;
  /** Creation-year bounds, inclusive, either end optional. Meaningless (and
   *  disabled) while `category` is empty. */
  yearFrom: number | null;
  yearTo: number | null;
}

const props = defineProps<CategoryFilterProps>();
const emit = defineEmits<{
  submit: [{ category: string; yearFrom: number | null; yearTo: number | null }];
  clear: [];
}>();

// Strings, not numbers: an input mid-edit ("19", about to become "1975") is
// not a valid year yet, and coercing it early would fight the user's typing.
// Parsed back to a number only on submit — same tolerance routes.ts already
// applies to `?yf=`/`?yt=`, via the same parseYear.
const draftCategory = ref(props.category);
const draftYearFrom = ref(props.yearFrom === null ? "" : String(props.yearFrom));
const draftYearTo = ref(props.yearTo === null ? "" : String(props.yearTo));

// Keeps the fields in step when the seed changes from elsewhere — a shared
// link, Back, or the "Category:" prefix typed into the search box instead.
watch(
  () => [props.category, props.yearFrom, props.yearTo] as const,
  ([category, yearFrom, yearTo]) => {
    if (category !== draftCategory.value) draftCategory.value = category;
    const from = yearFrom === null ? "" : String(yearFrom);
    if (from !== draftYearFrom.value) draftYearFrom.value = from;
    const to = yearTo === null ? "" : String(yearTo);
    if (to !== draftYearTo.value) draftYearTo.value = to;
  },
);

function submit(): void {
  const category = draftCategory.value.trim();
  // A year range with no category to apply it to has nothing to do.
  if (!category) return;
  emit("submit", {
    category,
    yearFrom: parseYear(draftYearFrom.value),
    yearTo: parseYear(draftYearTo.value),
  });
}

function clear(): void {
  draftCategory.value = "";
  draftYearFrom.value = "";
  draftYearTo.value = "";
  emit("clear");
}
</script>

<template>
  <form class="flex flex-wrap items-center gap-2" @submit.prevent="submit">
    <label class="min-w-0 flex-1 basis-40">
      <span class="sr-only">Category</span>
      <input
        v-model="draftCategory"
        type="text"
        placeholder="Category, e.g. Physics"
        autocomplete="off"
        class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      />
    </label>
    <label class="w-24">
      <span class="sr-only">From year</span>
      <input
        v-model="draftYearFrom"
        type="text"
        inputmode="numeric"
        placeholder="From year"
        :disabled="!draftCategory.trim()"
        class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      />
    </label>
    <label class="w-24">
      <span class="sr-only">To year</span>
      <input
        v-model="draftYearTo"
        type="text"
        inputmode="numeric"
        placeholder="To year"
        :disabled="!draftCategory.trim()"
        class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"
      />
    </label>
    <Button type="submit" size="sm" variant="secondary">Browse category</Button>
    <Button v-if="category" size="sm" variant="ghost" @click="clear">Clear category</Button>
  </form>
</template>
