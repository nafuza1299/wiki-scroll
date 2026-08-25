import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../Button/Button";
import { Skeleton } from "../Skeleton/Skeleton";

export type ModalSize = "sm" | "md" | "lg";
export interface ModalProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> { open: boolean; onOpenChange: (open: boolean) => void; size?: ModalSize; closeOnOverlayClick?: boolean; closeOnEscape?: boolean; /** Replaces modal content with a loading placeholder. */ loading?: boolean; }
export interface ModalSectionProps extends HTMLAttributes<HTMLElement> { children?: ReactNode; }
interface ModalContextValue { close: () => void; titleId: string; }

const ModalContext = createContext<ModalContextValue | null>(null);
const sizeClasses: Record<ModalSize, string> = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-[80vw]" };
const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';
let lockedModalCount = 0;
let originalBodyOverflow = "";

const lockBodyScroll = () => { if (lockedModalCount === 0) originalBodyOverflow = document.body.style.overflow; lockedModalCount += 1; document.body.style.overflow = "hidden"; };
const unlockBodyScroll = () => { lockedModalCount = Math.max(0, lockedModalCount - 1); if (lockedModalCount === 0) document.body.style.overflow = originalBodyOverflow; };
const getFocusableElements = (container: HTMLElement) => { return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true"); };

const useModalBehavior = (open: boolean, panelRef: React.RefObject<HTMLDivElement | null>, onRequestClose: () => void, closeOnEscape: boolean) => {
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onRequestClose);
  closeRef.current = onRequestClose;
  useEffect(() => {
    if (!open || !panelRef.current) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (getFocusableElements(panel)[0] ?? panel).focus();
    lockBodyScroll();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && closeOnEscape) { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = getFocusableElements(panel);
      if (items.length === 0) { event.preventDefault(); panel.focus(); return; }
      const first = items[0]; const last = items[items.length - 1]; const current = document.activeElement;
      if (event.shiftKey && current === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && current === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); unlockBodyScroll(); previouslyFocusedRef.current?.focus(); };
  }, [closeOnEscape, open, panelRef]);
};

const ModalRoot = forwardRef<HTMLDivElement, ModalProps>(({ open, onOpenChange, size = "md", closeOnOverlayClick = true, closeOnEscape = true, loading = false, className = "", children, ...rest }, forwardedRef) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const [isVisible, setIsVisible] = useState(false);
  const requestClose = () => onOpenChange(false);
  useModalBehavior(open, panelRef, requestClose, closeOnEscape);
  useEffect(() => {
    if (!open) { setIsVisible(false); return; }
    const frame = requestAnimationFrame(() => setIsVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <ModalContext.Provider value={{ close: requestClose, titleId }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <button type="button" aria-label="Close modal" aria-hidden="true" tabIndex={-1} className={["absolute inset-0 bg-black/50 transition-opacity duration-200 motion-reduce:transition-none", isVisible ? "opacity-100" : "opacity-0"].join(" ")} onClick={closeOnOverlayClick ? requestClose : undefined} />
        <div ref={(node) => { panelRef.current = node; if (typeof forwardedRef === "function") forwardedRef(node); else if (forwardedRef) forwardedRef.current = node; }} role="dialog" aria-modal="true" aria-busy={loading || undefined} aria-label={loading ? "Loading dialog" : undefined} aria-labelledby={loading ? undefined : titleId} tabIndex={-1} className={["relative flex h-[96vh] w-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-elevation transition duration-200 ease-out motion-reduce:transition-none motion-reduce:transform-none", isVisible ? "scale-100 opacity-100" : "scale-95 opacity-0", sizeClasses[size], className].filter(Boolean).join(" ")} {...rest}>{loading ? <ModalSkeleton /> : children}</div>
      </div>
    </ModalContext.Provider>, document.body,
  );
});
ModalRoot.displayName = "Modal";
const useModalContext = (componentName: string) => { const context = useContext(ModalContext); if (!context) throw new Error(`${componentName} must be used within Modal.`); return context; };

const ModalHeader = forwardRef<HTMLElement, ModalSectionProps>(({ className = "", children, ...rest }, ref) => {
  const { close } = useModalContext("Modal.Header");
  return <header ref={ref as any} className={["flex items-start justify-between gap-4 border-b border-border px-4 py-2 sm:px-6 sm:py-2", className].filter(Boolean).join(" ")} {...rest}><div className="min-w-0">{children}</div><Button variant="ghost" size="sm" iconOnly aria-label="Close" onClick={close}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" /></svg></Button></header>;
});
ModalHeader.displayName = "ModalHeader";
const ModalTitle = forwardRef<HTMLElement, ModalSectionProps>(({ className = "", children, ...rest }, ref) => { const { titleId } = useModalContext("Modal.Title"); return <h2 ref={ref as any} id={titleId} className={["text-sm font-semibold text-text", className].filter(Boolean).join(" ")} {...rest}>{children}</h2>; });
ModalTitle.displayName = "ModalTitle";
const ModalBody = forwardRef<HTMLElement, ModalSectionProps>(({ className = "", children, ...rest }, ref) => <div ref={ref as any} className={["min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-6", className].filter(Boolean).join(" ")} {...rest}>{children}</div>);
ModalBody.displayName = "ModalBody";
const ModalFooter = forwardRef<HTMLElement, ModalSectionProps>(({ className = "", children, ...rest }, ref) => <footer ref={ref as any} className={["flex flex-col gap-2 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6", className].filter(Boolean).join(" ")} {...rest}>{children}</footer>);
ModalFooter.displayName = "ModalFooter";
const ModalSkeleton = () => { return <div className="space-y-5 p-6"><Skeleton className="w-2/5" /><div className="space-y-3"><Skeleton className="w-full" /><Skeleton className="w-4/5" /><Skeleton className="w-3/5" /></div><div className="flex justify-end gap-3 pt-2"><Skeleton className="h-9 w-20" /><Skeleton className="h-9 w-24" /></div></div>; };
export const Modal = Object.assign(ModalRoot, { Header: ModalHeader, Title: ModalTitle, Body: ModalBody, Footer: ModalFooter, Skeleton: ModalSkeleton });
