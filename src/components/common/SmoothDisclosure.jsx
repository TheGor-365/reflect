import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import ReflectContentIcon from './ReflectContentIcon';

/**
 * Accessible, non-native disclosure. Content remains mounted while CSS
 * grid rows animate both opening AND closing (unlike native <details>).
 * Collapsed descendants are non-interactive via visibility/pointer-events.
 */
export default function SmoothDisclosure({
  label, iconKind = 'information', children,
  defaultOpen = false, className = '', id = undefined
}) {
  const uniqueId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const contentId = id || `reflect-disclosure-${uniqueId.replace(/:/g,'')}`;
  return (
    <div className={`reflect-disclosure ${className}`}>
      <button type="button" className="reflect-disclosure-trigger"
        aria-expanded={open} aria-controls={contentId}
        onClick={() => setOpen(value => !value)}>
        <ReflectContentIcon kind={iconKind} size={17}/>
        <span>{label}</span>
        <ChevronDown size={16} aria-hidden="true"
          className={open ? 'is-expanded' : ''}/>
      </button>
      <div id={contentId} className="reflect-disclosure-content"
        data-open={open} aria-hidden={!open}>
        <div className="reflect-disclosure-inner">{children}</div>
      </div>
    </div>
  );
}
