<script setup lang="ts">
import Button from "../Button/Button.vue";
import { useModalContext } from "./context";

const { close } = useModalContext("Modal.Header");
</script>

<template>
  <header
    class="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-6 sm:py-5"
  >
    <div class="min-w-0"><slot /></div>
    <Button variant="ghost" size="sm" icon-only aria-label="Close" @click="close">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        class="h-4 w-4"
      >
        <path d="m6 6 12 12M18 6 6 18" stroke-linecap="round" />
      </svg>
    </Button>
  </header>
</template>
