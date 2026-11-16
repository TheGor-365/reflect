import React from 'react';
import { Bot, Volume2, PauseCircle } from 'lucide-react';
import InteractionResult from './InteractionResult';
import SmoothDisclosure from '../../components/common/SmoothDisclosure';
import { isSupportedInteraction } from './interactionVersions';

const ChatMessage = React.memo(({ message, onPlayAudio, isSpeaking, currentlySpeakingId, onCompose, onDecision, onOpenGoals, onOpenRecommendations, isSaved, decisions,
  reviews = {}, onHypothesisReview, onFocusTurn, focused = false }) => {
  const isUser = message.role === 'user';
  const isThisMessageSpeaking = isSpeaking && currentlySpeakingId === message.id;
  // Old replies may contain a full copied question. Render it as a quiet,
  // reversible citation without mutating any owner-authored stored text.
  const legacy = isUser && typeof message.content === 'string'
    ? message.content.match(/^Мой ответ на вопрос «([\s\S]+)»:\s*([\s\S]+)$/u)
    : null;

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
          {!isUser && isSupportedInteraction(message.interaction) &&
            <small className="reflect-ai-provisional-label">
              Предварительный взгляд Reflect · возможна ошибка в объяснении
            </small>}
          {legacy ? (
            <>
              <p>{legacy[2]}</p>
              <SmoothDisclosure label="На какой вопрос отвечал"
                className="reflect-quoted-question" iconKind="information">
                <blockquote>{legacy[1]}</blockquote>
              </SmoothDisclosure>
            </>
          ) : <p>{message.content}</p>}
        </div>
        {!isUser && message.interaction && <InteractionResult
          interaction={message.interaction} messageId={message.id}
          isSaved={isSaved} decisions={decisions} onDecision={onDecision}
          reviews={reviews} onHypothesisReview={onHypothesisReview}
          onOpenGoals={onOpenGoals} onOpenRecommendations={onOpenRecommendations}
          onCompose={onCompose} onFocusTurn={onFocusTurn} />}
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
