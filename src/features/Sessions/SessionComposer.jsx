import React, { useLayoutEffect, useRef } from 'react';
import { ArrowUp, Mic, MicOff } from 'lucide-react';

/**
 * Composes long, multi-paragraph reflections without collapsing the input
 * into a single line. This component never writes to Firestore on its own.
 * The parent controls whether AI-backed sending is actually available.
 */
const SessionComposer = ({
  value,
  onChange,
  onSubmit,
  onToggleRecording,
  isLoading = false,
  isRecording = false,
  aiAvailable = false
}) => {
  const textareaRef = useRef(null);
  const sendButtonRef = useRef(null);
  const canSend = aiAvailable && !isLoading && Boolean(value.trim());

  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = 'auto';
    const contentHeight = field.scrollHeight;
    field.style.height = `${Math.min(280, Math.max(112, contentHeight))}px`;
    field.style.overflowY = contentHeight > 280 ? 'auto' : 'hidden';
  }, [value]);

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      if (canSend) sendButtonRef.current?.click();
    }
  };

  return (
    <section className="reflect-session-composer" aria-label="Поле ввода для сеанса">
      <div className="reflect-session-composer-heading">
        <div>
          <p className="reflect-session-composer-label">Ваша история</p>
          <p className="reflect-session-composer-subtitle">Пишите свободно, в несколько абзацев</p>
        </div>
        <span className={`reflect-session-composer-status ${aiAvailable ? 'reflect-session-composer-status--available' : ''}`}>
          {aiAvailable ? 'Готов к отправке' : 'ИИ пока недоступен'}
        </span>
      </div>
      <form className="reflect-session-composer-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="reflect-session-message">Сообщение для сеанса</label>
        <textarea
          id="reflect-session-message"
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-describedby="reflect-session-message-hint"
          placeholder="Что произошло? Какие мысли или чувства хочется обсудить? Можно написать подробно…"
          rows={4}
          className="reflect-session-textarea"
          spellCheck={true}
          disabled={isLoading}
        />
        <div className="reflect-session-composer-footer">
          <p id="reflect-session-message-hint" className="reflect-session-composer-hint">
            {aiAvailable
              ? 'Enter — перенос строки · Ctrl+Enter — отправить'
              : 'ИИ-сеансы отключены до подключения защищённого API. Введённый текст пока не сохраняется автоматически.'}
          </p>
          <div className="reflect-session-composer-controls">
            <button type="button" onClick={onToggleRecording}
              className={`reflect-session-control reflect-session-record ${isRecording ? 'reflect-session-record--on' : ''}`}
              aria-label={isRecording ? 'Остановить диктовку' : 'Начать диктовку'}
              title={isRecording ? 'Остановить диктовку' : 'Начать диктовку'}
            >
              {isRecording ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
            </button>
            <button type="submit" ref={sendButtonRef} disabled={!canSend}
              className="reflect-session-control reflect-session-send"
              aria-label="Отправить сообщение" title="Отправить сообщение">
              <ArrowUp size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
    </section>
  );
};

export default SessionComposer;
