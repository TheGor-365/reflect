import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Shared Reflect-styled accessible single-choice control. Accepts the same
 * stable [id, caption] options as AI preferences. No native OS popup.
 * No form values are changed here; the parent owns the controlled selection.
 */
export default function ReflectSelect({
  label, ariaLabel = label, value, options = [], onChange,
  disabled = false, className = ''
}) {
  const id = useId();
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex(([option]) => option === value));
  const selected = options[selectedIndex]?.[1] || 'Не выбрано';

  useEffect(() => {
    if (!open) return undefined;
    const closeOutside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  const expand = () => {
    if (disabled || options.length === 0) return;
    setActive(selectedIndex);
    setOpen(true);
  };
  const choose = index => {
    if (disabled || !options[index]) return;
    setOpen(false);
    if (options[index][0] !== value) onChange(options[index][0]);
    trigger.current?.focus();
  };
  const keyDown = event => {
    if (disabled || options.length === 0) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault(); setOpen(false); return;
    }
    if (event.key === 'Tab') { setOpen(false); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { expand(); return; }
      setActive(index => event.key === 'Home' ? 0
        : event.key === 'End' ? options.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length)
            % options.length);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) choose(active);
      else expand();
    }
  };
  return (
    <div ref={root} className={`reflect-ui-select ${className}`}>
      <span id={id + '-label'} className="reflect-ui-select-label">{label}</span>
      <div className="reflect-preference-select">
        <button type="button" ref={trigger}
          className="reflect-preference-select-trigger"
          role="combobox" aria-haspopup="listbox"
          aria-label={ariaLabel} aria-expanded={open}
          aria-controls={id + '-list'}
          aria-activedescendant={open ? id + '-option-' + active : undefined}
          disabled={disabled}
          onClick={() => open ? setOpen(false) : expand()}
          onKeyDown={keyDown}>
          <span>{selected}</span>
          <ChevronDown size={17} aria-hidden="true"
            className={open ? 'reflect-preference-chevron--open' : ''}/>
        </button>
        {open && !disabled && (
          <div id={id + '-list'} role="listbox" aria-label={ariaLabel}
            className="reflect-preference-menu">
            {options.map(([option, caption], index) => (
              <div key={option} id={id + '-option-' + index}
                role="option" aria-selected={option === value}
                className={'reflect-preference-option' +
                  (active === index ? ' reflect-preference-option--active' : '')}
                onPointerDown={event => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(index)}>
                <span>{caption}</span>
                {option === value && <Check size={16} aria-hidden="true"/>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
