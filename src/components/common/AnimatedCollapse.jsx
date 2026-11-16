import React, { useId } from 'react';

/** Stable DOM and CSS grid transitions both ways. Hidden controls never receive focus. */
export default function AnimatedCollapse({ open = false, children, className = '', id }) {
  const stableId = useId().replace(/:/g, '');
  return (
    <div id={id || `reflect-collapse-${stableId}`}
      className={`reflect-motion-collapse ${className}`}
      data-open={open ? 'true' : 'false'} aria-hidden={!open}>
      <div className="reflect-motion-collapse-inner">{children}</div>
    </div>
  );
}
