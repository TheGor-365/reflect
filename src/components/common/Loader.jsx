import React from 'react';

/**
 * Shared Midnight Aurora boot state. CSS and the first-paint HTML shell use
 * the same palette so hydration/auth/Firestore loading never flashes white.
 * The animated line is indeterminate, not a false loading percentage.
 */
export default function Loader() {
  return (
    <main className="reflect-boot" role="status" aria-live="polite"
      aria-label="Загружаем Reflect">
      <div className="reflect-boot-content">
        <span className="reflect-boot-mark" aria-hidden="true">R</span>
        <div className="reflect-boot-wordmark" aria-hidden="true">
          reflect<span>.</span>
        </div>
        <p className="reflect-boot-message">Подготавливаем ваше пространство</p>
        <div className="reflect-boot-track" aria-hidden="true">
          <span className="reflect-boot-track-bar" />
        </div>
      </div>
    </main>
  );
}
