import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

const CollapsibleContent = ({ title, children, startOpen = false }) => {
  const [isOpen, setIsOpen] = useState(startOpen);
  return (
    <div className="mt-2">
      <button onClick={() => setIsOpen(!isOpen)} className="text-sm text-teal-600 font-semibold flex items-center gap-1">
        {isOpen ? 'Свернуть' : title}
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="mt-2 p-3 bg-stone-50 rounded-md border animate-fade-in">{children}</div>}
    </div>
  );
};

export default CollapsibleContent;
