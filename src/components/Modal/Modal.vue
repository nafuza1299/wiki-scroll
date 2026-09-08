<script lang="ts">
export type ModalSize = "sm" | "md" | "lg" | "reader";

export interface ModalProps {
  open: boolean;
  size?: ModalSize;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  /** Replaces modal content with a loading placeholder. */
  loading?: boolean;
}

/*
  Width lives here and nowhere else. A caller passing a width through `class`
  lands in the same class attribute as these, and Tailwind resolves conflicts by
  generated-CSS order rather than attribute order — so which one wins is not
  something the caller can rely on. Needing a new width means adding a size.
*/
const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  // The reader holds a whole article, so it takes a fixed height and scrolls
  // internally instead of growing with its content.
  reader: "max-w-3xl h-[85vh]",
};
</script>

<script setup lang="ts">
import { computed, provide, ref, toRef, useId, watch } from "vue";
import { modalContextKey } from "./context";
import { useModalBehavior } from "./useModalBehavior";
import ModalSkeleton from "./ModalSkeleton.vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<ModalProps>(), {
  size: "md",
  closeOnOverlayClick: true,
  closeOnEscape: true,
  loading: false,
});

const emit = defineEmits<{ "update:open": [value: boolean] }>();

const panel = ref<HTMLElement | null>(null);
const initialFocus = ref<HTMLElement | null>(null);
const isVisible = ref(false);
const titleId = useId();

function requestClose(): void {
  emit("update:open", false);
}

useModalBehavior({
  open: toRef(props, "open"),
  panel,
  closeOnEscape: toRef(props, "closeOnEscape"),
  requestClose,
  initialFocus,
});

watch(
  () => props.open,
  (open, _previous, onCleanup) => {
    if (!open) {
      isVisible.value = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      isVisible.value = true;
    });
    onCleanup(() => cancelAnimationFrame(frame));
  },
  { flush: "post" },
);

provide(modalContextKey, {
  close: requestClose,
  titleId,
  setInitialFocus: (element) => {
    initialFocus.value = element;
  },
});

const panelClasses = computed(() => [
  "relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-border",
  "bg-surface shadow-elevation transition duration-200 ease-out",
  "motion-reduce:transition-none motion-reduce:transform-none",
  isVisible.value ? "scale-100 opacity-100" : "scale-95 opacity-0",
  sizeClasses[props.size],
]);
</script>

<template>
  <Teleport v-if="open" to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <!--
        A redundant dismissal affordance, so it is hidden from assistive tech
        rather than exposed as a control — Escape and the header close button are
        the keyboard paths. The React original was a button that carried both an
        aria-label and aria-hidden, which contradict each other.
      -->
      <div
        aria-hidden="true"
        class="absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none"
        :class="isVisible ? 'opacity-100' : 'opacity-0'"
        @click="closeOnOverlayClick && requestClose()"
      />
      <div
        ref="panel"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        :aria-busy="loading || undefined"
        :aria-label="loading ? 'Loading dialog' : undefined"
        :aria-labelledby="loading ? undefined : titleId"
        :class="panelClasses"
        v-bind="$attrs"
      >
        <ModalSkeleton v-if="loading" />
        <slot v-else />
      </div>
    </div>
  </Teleport>
</template>
