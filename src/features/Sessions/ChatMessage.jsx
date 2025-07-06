import React from 'react';
import { Volume2, PauseCircle } from 'lucide-react';

const ChatMessage = React.memo(({ message, onPlayAudio, isSpeaking, currentlySpeakingId }) => {
  const isUser = message.role === 'user';
  const isThisMessageSpeaking = isSpeaking && currentlySpeakingId === message.id;

  return (
    <div className={`flex my-2 animate-fade-in ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-end gap-2`}>
        <div className={`px-4 py-3 rounded-2xl max-w-sm md:max-w-md lg:max-w-2xl shadow-md ${isUser ? 'bg-teal-600 text-white rounded-br-none' : 'bg-white text-stone-800 rounded-bl-none border border-stone-200'}`}>
           <p className="break-words" style={{ whiteSpace: 'pre-wrap' }}>{message.content}</p>
        </div>
        {!isUser && (
          <button onClick={() => onPlayAudio(message.id, message.content)} className="p-2 text-stone-500 hover:bg-teal-100 rounded-full transition-colors">
            {isThisMessageSpeaking ? <PauseCircle className="text-teal-600"/> : <Volume2 />}
          </button>
        )}
      </div>
    </div>
  );
});

export default ChatMessage;
