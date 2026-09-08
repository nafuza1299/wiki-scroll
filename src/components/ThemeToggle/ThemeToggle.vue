<script setup lang="ts">
import { computed } from "vue";
import Button from "../Button/Button.vue";
import { useTheme } from "../../composables/useTheme";

const { theme, toggleTheme } = useTheme();

const isDark = computed(() => theme.value === "dark");
</script>

<template>
  <Button
    variant="ghost"
    size="md"
    icon-only
    :aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
    @click="toggleTheme"
  >
    <svg
      v-if="isDark"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      class="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
    <svg v-else viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </Button>
</template>
