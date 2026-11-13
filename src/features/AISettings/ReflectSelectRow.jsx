import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Fully styled, controlled preference selector. Native <select> popup colors
 * are browser/OS-controlled and cannot follow Reflect's light/dark design.
 * The trigger remains a real button; options are not submitted with the form.
 * Arrow keys, Home/End, Enter/Space, Escape, outside click and disabled state.
 */
export default function ReflectSelectRow({
  label, description, name, value, options, onChange, disabled = false
}) {
  const unique = useId();
  const labelId = unique + '-label';
  const descId = unique + '-description';
  const listId = unique + '-list';
  const root = useRef(null);
  const trigger = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = Math.max(0, options.findIndex(([id]) => id === value));
  const selected = options[selectedIndex]?.[1] || '';

  useEffect(() => {
    if (!open) return undefined;
    const outside = event => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const expand = () => {
    if (disabled) return;
    setActive(selectedIndex);
    setOpen(true);
  };
  const select = index => {
    if (disabled || !options[index]) return;
    setOpen(false);
    if (value !== options[index][0]) onChange(name, options[index][0]);
    trigger.current?.focus();
  };
  const handleKey = event => {
    if (disabled) return;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!open) { expand(); return; }
      setActive(previous =>
        event.key === 'Home' ? 0 :
        event.key === 'End' ? options.length - 1 :
        (previous + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      );
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) select(active);
      else expand();
    }
  };
  return (
    <div className="reflect-ai-settings-row">
      <span className="reflect-ai-settings-row-text">
        <strong id={labelId}>{label}</strong>
        <span id={descId}>{description}</span>
      </span>
      <div className="reflect-preference-select" ref={root}>
        <button type="button" ref={trigger}
          className="reflect-preference-select-trigger"
          role="combobox" aria-haspopup="listbox"
          aria-expanded={open} aria-controls={listId}
          aria-labelledby={labelId} aria-describedby={descId}
          aria-activedescendant={open ? unique + '-option-' + active : undefined}
          disabled={disabled}
          onClick={() => open ? setOpen(false) : expand()}
          onKeyDown={handleKey}>
          <span>{selected}</span>
          <ChevronDown size={17} aria-hidden="true" className={open ? 'reflect-preference-chevron--open' : ''}/>
        </button>
        {open && !disabled && (
          <div className="reflect-preference-menu"
            id={listId} role="listbox" aria-labelledby={labelId}>
            {options.map(([id, caption], i) => (
              <div key={id} id={unique + '-option-' + i}
                className={'reflect-preference-option' +
                  (i === active ? ' reflect-preference-option--active' : '')}
                role="option" aria-selected={id === value}
                onMouseEnter={() => setActive(i)}
                onPointerDown={event => event.preventDefault()}
                onClick={() => select(i)}>
                <span>{caption}</span>
                {id === value && <Check size={16} aria-hidden="true"/>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
