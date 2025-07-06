import React from 'react';

const InfoCard = React.memo(({ title, content, icon }) => (
  <div className="bg-white rounded-xl shadow-md p-6 border border-stone-100 mb-4 transition-all hover:shadow-lg">
    <div className="flex items-center mb-3">
      {icon}
      <h3 className="text-lg font-semibold text-stone-800 ml-3">{title}</h3>
    </div>
    {typeof content === 'string' ? (
       <p className="text-stone-600 leading-relaxed">{content}</p>
    ) : (
      <ul className="list-disc list-inside text-stone-600 space-y-2">
        {Array.isArray(content) && content.map((item, index) => <li key={index}>{item}</li>)}
      </ul>
    )}
  </div>
));

export default InfoCard;
