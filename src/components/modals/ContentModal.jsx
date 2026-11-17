import React from 'react';
import ReflectDialog from './ReflectDialog';

export default function ContentModal({ content, onClose }) {
  if (!content) return null;
  return (
    <ReflectDialog title="Полное содержание" onClose={onClose} size="wide">
      <p className="reflect-dialog-fulltext">{content}</p>
    </ReflectDialog>
  );
}
