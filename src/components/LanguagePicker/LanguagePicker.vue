<script setup lang="ts">
import { LANGUAGES } from "../../lib/wikipedia/languages";

export interface LanguagePickerProps {
  modelValue: string;
}

defineProps<LanguagePickerProps>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
</script>

<template>
  <!--
    A native <select>, not a custom dropdown. It needs no floating-ui or
    positioning library to place a popup — which matters in a repo with
    exactly one runtime dependency — and it gets full keyboard operation and a
    native mobile picker for free.
  -->
  <select
    :value="modelValue"
    aria-label="Wikipedia language"
    class="rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="language in LANGUAGES" :key="language.code" :value="language.code">
      {{ language.label }}
    </option>
  </select>
</template>
