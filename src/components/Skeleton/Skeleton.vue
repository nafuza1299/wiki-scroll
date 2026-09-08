<script lang="ts">
export type SkeletonShape = "text" | "circle" | "rect";

export interface SkeletonProps {
  /** The visual form of the placeholder. Defaults to a text line. */
  shape?: SkeletonShape;
  /** Announces that the surrounding content is loading when supplied. */
  label?: string;
}

const shapeStyles: Record<SkeletonShape, string> = {
  text: "h-4 w-full rounded-sm",
  circle: "aspect-square rounded-full",
  rect: "rounded-md",
};
</script>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(defineProps<SkeletonProps>(), {
  shape: "text",
  // Absent by design: no label means decorative, which is the common case.
  label: undefined,
});

const classes = computed(() => [
  "animate-pulse bg-surface-hover motion-reduce:animate-none",
  shapeStyles[props.shape],
]);
</script>

<!-- A decorative, animated placeholder for content that has not loaded yet. -->
<template>
  <div
    :class="classes"
    :aria-hidden="label ? undefined : true"
    :aria-label="label"
    :role="label ? 'status' : undefined"
  />
</template>
