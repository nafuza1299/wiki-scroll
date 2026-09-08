<script setup lang="ts">
import { useModalContext } from "./context";

const { titleId } = useModalContext("Modal.Title");
</script>

<template>
  <h2 :id="titleId" class="text-lg font-semibold text-text"><slot /></h2>
</template>
