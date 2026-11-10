import React from 'react';

/**
 * Reusable mount-stable panel: semantic hiding and smooth grid transition.
 * The hidden region is inert (keyboard/mouse excluded) and aria-hidden.
 * Motion is disabled via CSS for prefers-reduced-motion.
 */
const AnimatedRegion = ({ open, id, children, className = '' }) => (
  <div id={id} className={`reflect-motion-region ${open ? 'is-open' : ''} ${className}`}
    aria-hidden={!open} inert={open ? undefined : ''}>
    <div className="reflect-motion-region-inner">{children}</div>
  </div>
);

export default AnimatedRegion;
