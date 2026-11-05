import React, { useLayoutEffect, useRef } from 'react';
import { ArrowUp, BookOpenCheck, Mic, MicOff } from 'lucide-react';
import SaveFeedback from '../../components/common/SaveFeedback';

/**
 * A bottom-of-chat multiline composer. All content remains controlled by the
 * parent; no hidden browser storage, external AI call, or Firestore write.
 */
const SessionComposer = ({
  value,
  onChange,
  onSubmit,
  onToggleRecording,
  onSaveToDiary,
  diarySaveStatus = 'idle',
  isLoading = false,
  isRecording = false,
  error = '',
  aiAvailable = false
}) => {
  const textareaRef = useRef(null);
  const sendButtonRef = useRef(null);
  const canSend = aiAvailable && !isLoading && diarySaveStatus !== 'saving' && Boolean(value.trim());
  const canSave = Boolean(onSaveToDiary) && Boolean(value.trim()) && diarySaveStatus !== 'saving' && !isLoading;

  useLayoutEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = 'auto';
    const contentHeight = field.scrollHeight;
    field.style.height = `${Math.min(280, Math.max(72, contentHeight))}px`;
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
      {error && <p className="reflect-session-error" role="alert">{error}</p>}
      <form className="reflect-session-composer-form" onSubmit={onSubmit}>
        <label className="sr-only" htmlFor="reflect-session-message">Сообщение для сеанса</label>
        <textarea
          id="reflect-session-message"
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          aria-describedby="reflect-session-message-hint"
          placeholder="Опишите ситуацию, мысль или чувство…"
          rows={2}
          className="reflect-session-textarea"
          spellCheck={true}
          disabled={isLoading || diarySaveStatus === 'saving'}
        />
        <div className="reflect-session-composer-footer">
          <p id="reflect-session-message-hint" className="reflect-session-composer-hint">
            {aiAvailable
              ? 'Enter — новая строка · Ctrl+Enter — отправить'
              : 'ИИ временно отключён. Текст не сохраняется автоматически — используйте кнопку «В дневник».'}
          </p>
          <div className="reflect-session-composer-controls">
            {onSaveToDiary && (
              <button type="button" onClick={onSaveToDiary} disabled={!canSave}
                className="reflect-session-save-note"
                aria-label="Сохранить текст в дневник">
                <BookOpenCheck size={18} aria-hidden="true" />
                <span>{diarySaveStatus === 'saving' ? 'Сохраняется…' : 'В дневник'}</span>
              </button>
            )}
            <button type="button" onClick={onToggleRecording}
              className={`reflect-session-control reflect-session-record ${isRecording ? 'reflect-session-record--on' : ''}`}
              aria-label={isRecording ? 'Остановить диктовку' : 'Начать диктовку'}
              title={isRecording ? 'Остановить диктовку' : 'Начать диктовку'}
              disabled={diarySaveStatus === 'saving'}
            >
              {isRecording ? <MicOff size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
            </button>
            <button type="submit" ref={sendButtonRef} disabled={!canSend}
              className="reflect-session-control reflect-session-send"
              aria-label="Отправить сообщение" title={aiAvailable ? 'Отправить сообщение' : 'ИИ пока недоступен'}>
              <ArrowUp size={22} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
      <SaveFeedback status={diarySaveStatus} />
    </section>
  );
};

export default SessionComposer;
