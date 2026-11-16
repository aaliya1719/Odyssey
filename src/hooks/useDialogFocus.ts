import { useEffect, type RefObject } from 'react';

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialogFocus(
  open: boolean,
  dialogRef: RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const controls = dialog?.querySelectorAll<HTMLElement>(FOCUSABLE);
    (controls?.[0] ?? dialog)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;

      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, dialogRef, onClose]);
}
