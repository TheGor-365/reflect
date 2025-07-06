import React from 'react';
import { Loader2 } from 'lucide-react';

const Loader = () => (
  <div className="flex items-center justify-center h-screen bg-stone-50">
    <Loader2 className="w-12 h-12 text-teal-600 animate-spin" />
  </div>
);

export default Loader;
