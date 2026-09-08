<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useModalContext } from "./context";

export interface ModalBodyProps {
  /**
   * Makes the body itself focusable and claims initial focus. Set it when the
   * body holds long scrollable content: a keyboard user otherwise has no way to
   * scroll a region that contains no focusable element of its own.
   */
  scrollable?: boolean;
}

const props = withDefaults(defineProps<ModalBodyProps>(), { scrollable: false });

const { setInitialFocus } = useModalContext("Modal.Body");
const body = ref<HTMLElement | null>(null);

onMounted(() => {
  if (props.scrollable) setInitialFocus(body.value);
});
</script>

<template>
  <div
    ref="body"
    class="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6"
    :tabindex="scrollable ? 0 : undefined"
  >
    <slot />
  </div>
</template>
