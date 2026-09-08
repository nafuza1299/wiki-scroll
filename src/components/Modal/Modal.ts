import ModalRoot from "./Modal.vue";
import Header from "./ModalHeader.vue";
import Title from "./ModalTitle.vue";
import Body from "./ModalBody.vue";
import Footer from "./ModalFooter.vue";
import ModalSkeleton from "./ModalSkeleton.vue";

/*
  Sub-components hang off the parent rather than being separate top-level
  exports, matching the upstream catalyst-ui contract. Vue templates resolve dot
  notation, so `<Modal.Header>` works exactly as `<Modal.Header>` did in JSX.

  There is no barrel index.ts anywhere in this tree on purpose: this library is
  vendored by copying directories, and a barrel would make a directory copy
  silently incomplete.
*/
export const Modal = Object.assign(ModalRoot, {
  Header,
  Title,
  Body,
  Footer,
  Skeleton: ModalSkeleton,
});

export type { ModalSize, ModalProps } from "./Modal.vue";
export type { ModalBodyProps } from "./ModalBody.vue";
