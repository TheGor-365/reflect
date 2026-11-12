import React from 'react';
import { Bot, Volume2, PauseCircle } from 'lucide-react';
import InteractionResult from './InteractionResult';

const ChatMessage = React.memo(({ message, onPlayAudio, isSpeaking, currentlySpeakingId, onCompose, onDecision, onOpenGoals, isSaved, decisions, focused = false }) => {
  const isUser = message.role === 'user';
  const isThisMessageSpeaking = isSpeaking && currentlySpeakingId === message.id;

  return (
    <article className={`reflect-chat-message ${isUser ? 'reflect-chat-message--user' : 'reflect-chat-message--assistant'}${focused ? ' reflect-chat-message--source-focus' : ''}`}
      data-reflect-turn-id={message.id || undefined}
      aria-label={isUser ? 'Ваше сообщение' : 'Ответ Reflect'}>
      {!isUser && (
        <span className="reflect-chat-avatar" aria-hidden="true"><Bot size={18} /></span>
      )}
      <div className="reflect-chat-message-body">
        <p className="reflect-chat-message-author">{isUser ? 'Вы' : 'Reflect'}</p>
        <div className="reflect-chat-bubble">
          <p>{message.content}</p>
        </div>
        {!isUser && message.interaction && <InteractionResult
          interaction={message.interaction} messageId={message.id}
          isSaved={isSaved} decisions={decisions} onDecision={onDecision}
          onOpenGoals={onOpenGoals} onCompose={onCompose} />}
      </div>
      {!isUser && onPlayAudio && (
        <button type="button" className="reflect-chat-audio"
          onClick={() => onPlayAudio(message.id, message.content)}
          aria-label={isThisMessageSpeaking ? 'Остановить озвучивание' : 'Озвучить ответ'}>
          {isThisMessageSpeaking
            ? <PauseCircle size={19} aria-hidden="true" />
            : <Volume2 size={19} aria-hidden="true" />}
        </button>
      )}
    </article>
  );
});

export default ChatMessage;
