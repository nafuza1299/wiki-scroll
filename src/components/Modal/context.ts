import { inject, type InjectionKey } from "vue";

export interface ModalContext {
  close: () => void;
  titleId: string;
  /**
   * Lets a sub-component claim focus on open. The reader body uses it so the
   * dialog opens on the article rather than on the close button.
   */
  setInitialFocus: (element: HTMLElement | null) => void;
}

export const modalContextKey: InjectionKey<ModalContext> = Symbol("modal");

export function useModalContext(componentName: string): ModalContext {
  const context = inject(modalContextKey, null);
  if (!context) throw new Error(`${componentName} must be used within Modal.`);
  return context;
}
