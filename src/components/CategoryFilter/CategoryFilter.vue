<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "../Button/Button.vue";
import { parseYear } from "../../lib/routes";
import { CATEGORIES } from "../../lib/wikipedia/categories";

export interface CategoryFilterProps {
  /** The category currently driving the feed, bare name with no "Category:"
   *  prefix. Empty when category mode isn't active. */
  category: string;
  /** Creation-year bounds, inclusive, either end optional. Meaningless (and
   *  disabled) while `category` is empty. */
  yearFrom: number | null;
  yearTo: number | null;
  /** Which wiki language the field is for. Only `"en"` offers curated
   *  category suggestions — CATEGORIES is English-only text, and suggesting
   *  it for another language would mean a name that silently returns zero
   *  results there. Every other language is plain free text, same as before
   *  this dropdown existed. */
  lang: string;
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

// The dropdown is pure convenience: an empty list here just means nothing
// renders, indistinguishable from a plain text field — exactly how this
// input behaved before it existed.
const categoryOptions = computed(() => (props.lang === "en" ? CATEGORIES : []));

/*
  A real dropdown, not <input list> + <datalist>. That was tried first — it
  costs nothing and gets keyboard/screen-reader handling for free — but native
  datalist support is genuinely unreliable: Safari barely renders the popup at
  all, and even where a browser does show one, it's an OS-level layer outside
  the page, invisible to anyone (including a screenshot) until they've already
  clicked in and started typing. A visible, always-rendered-when-open list is
  the only way to guarantee "there is a dropdown" is actually true.
*/
const isOpen = ref(false);
const filteredCategories = computed(() => {
  const query = draftCategory.value.trim().toLowerCase();
  if (!query) return categoryOptions.value;
  return categoryOptions.value.filter((name) => name.toLowerCase().includes(query));
});

function selectCategory(name: string): void {
  draftCategory.value = name;
  isOpen.value = false;
}

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
    <div class="relative min-w-0 flex-1 basis-40">
      <label class="block">
        <span class="sr-only">Category</span>
        <input
          v-model="draftCategory"
          type="text"
          placeholder="Category, e.g. Physics"
          autocomplete="off"
          class="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          @focus="isOpen = true"
          @blur="isOpen = false"
          @keydown.escape="isOpen = false"
        />
      </label>
      <!--
        A real, always-rendered list — see the isOpen/filteredCategories
        comment above for why this replaced <input list> + <datalist>. A
        sibling of the label, not nested in it: a <label> forwards a plain
        click to its control, and nesting a <button> inside would make that
        forwarding behaviour someone else's problem to reason about later.
        @mousedown.prevent on each option stops the input's own blur from
        firing before the click does; without it, the list would close
        itself before the click ever registered.
      -->
      <ul
        v-if="isOpen && filteredCategories.length"
        class="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border border-border bg-surface py-1 shadow-elevation"
      >
        <li v-for="name in filteredCategories" :key="name">
          <button
            type="button"
            class="block w-full px-3 py-1.5 text-left text-sm text-text hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none"
            @mousedown.prevent="selectCategory(name)"
          >
            {{ name }}
          </button>
        </li>
      </ul>
    </div>
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
