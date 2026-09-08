<script setup lang="ts">
import Skeleton from "../Skeleton/Skeleton.vue";
</script>

<template>
  <div class="space-y-5 p-6">
    <Skeleton class="w-2/5" />
    <div class="space-y-3">
      <Skeleton class="w-full" />
      <Skeleton class="w-4/5" />
      <Skeleton class="w-3/5" />
    </div>
    <div class="flex justify-end gap-3 pt-2">
      <Skeleton class="h-9 w-20" />
      <Skeleton class="h-9 w-24" />
    </div>
  </div>
</template>
