import React, { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Reusable disclosure without hard-coded light backgrounds or unreadable text. */
const CollapsibleContent = ({ title, children, startOpen = false }) => {
  const [isOpen, setIsOpen] = useState(startOpen);
  const contentId = useId();
  return (
    <div className="reflect-disclosure">
      <button type="button" className="reflect-disclosure-trigger"
        aria-expanded={isOpen} aria-controls={contentId}
        onClick={() => setIsOpen(open => !open)}>
        {isOpen ? 'Свернуть' : title}
        <ChevronDown size={16} aria-hidden="true"
          className={isOpen ? 'reflect-disclosure-chevron is-open' : 'reflect-disclosure-chevron'} />
      </button>
      {isOpen && <div id={contentId} className="reflect-disclosure-panel">{children}</div>}
    </div>
  );
};

export default CollapsibleContent;
