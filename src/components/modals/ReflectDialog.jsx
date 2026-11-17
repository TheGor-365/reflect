import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Theme-aware, accessible modal shell for owner-facing Reflect dialogs. */
export default function ReflectDialog({
  title, children, footer = null, onClose, size = 'compact', closeDisabled = false
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const disabledRef = useRef(closeDisabled);
  onCloseRef.current = onClose;
  disabledRef.current = closeDisabled;

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.focus();

    const keydown = event => {
      if (event.key === 'Escape') {
        if (!disabledRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onCloseRef.current?.();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(el =>
        !el.disabled && el.getAttribute('aria-hidden') !== 'true' &&
        el.getAttribute('tabindex') !== '-1'
      );
      if (!items.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return (
    <div className="reflect-dialog-overlay">
      <section role="dialog" aria-modal="true" aria-labelledby={titleId}
        tabIndex={-1} ref={panelRef}
        className={`reflect-dialog reflect-dialog--${size}`}>
        <header className="reflect-dialog-header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="reflect-dialog-close"
            onClick={onClose} disabled={closeDisabled} aria-label="Закрыть окно">
            <X size={19} aria-hidden="true" />
          </button>
        </header>
        <div className="reflect-dialog-body">{children}</div>
        {footer && <footer className="reflect-dialog-footer">{footer}</footer>}
      </section>
    </div>
  );
}
