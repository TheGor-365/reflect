import React, { createRef } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ProtectedDraftControls from './ProtectedDraftControls';
import {
  discardProtectedDraft, openProtectedDraft, protectedDraftExists
} from '../../security/protectedDraft';

vi.mock('../../security/protectedDraft', () => ({
  discardProtectedDraft: vi.fn(),
  openProtectedDraft: vi.fn(),
  protectedDraftExists: vi.fn()
}));

const phrase = 'some-long-independent-phrase';
const defaultValue = { title: 'Note', text: 'Synthetic multiline\ntext' };
const props = {
  userId: 'synthetic-uid', surface: 'diary-new',
  value: defaultValue, onRestore: vi.fn()
};
let handle;
beforeEach(() => {
  vi.clearAllMocks();
  handle = { recovered: null, write: vi.fn().mockResolvedValue(undefined),
    discard: vi.fn() };
  openProtectedDraft.mockResolvedValue(handle);
  protectedDraftExists.mockReturnValue(false);
});

async function enableDraft(properties = props) {
  render(<ProtectedDraftControls {...properties} />);
  fireEvent.click(screen.getByRole('button', { name: 'Включить шифрование черновика' }));
  fireEvent.change(screen.getByPlaceholderText('Минимум 12 символов'), {
    target: { value: phrase }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Включить' }));
  await waitFor(() => expect(openProtectedDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      uid: properties.userId, surface: properties.surface, passphrase: phrase
    })
  ));
}

test('drafts are opt-in and not written during default journal editing', () => {
  render(<ProtectedDraftControls {...props}/>);
  expect(openProtectedDraft).not.toHaveBeenCalled();
  expect(screen.getByText(/По желанию: шифрование/)).toBeInTheDocument();
});

test('after opt-in shows confirmed encryption status only after local write', async () => {
  await enableDraft();
  await waitFor(() => expect(handle.write).toHaveBeenCalledWith(defaultValue));
  expect(await screen.findByText('Черновик зашифрован и сохранён на устройстве.'))
    .toBeInTheDocument();
});

test('unlock restores existing encrypted text instead of silently replacing it', async () => {
  protectedDraftExists.mockReturnValue(true);
  handle.recovered = { title: 'Recovered title', text: 'Recovered private text' };
  const onRestore = vi.fn();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<ProtectedDraftControls {...props} onRestore={onRestore}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Восстановить локальный черновик' }));
  fireEvent.change(screen.getByPlaceholderText('Минимум 12 символов'), {
    target: { value: phrase }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Расшифровать' }));
  await waitFor(() => expect(onRestore).toHaveBeenCalledWith(handle.recovered));
  expect(confirm).toHaveBeenCalledOnce();
  confirm.mockRestore();
});

test('failed encrypted write is shown as error, never success', async () => {
  handle.write.mockRejectedValue(new Error('Зашифрованный черновик изменился в другой вкладке.'));
  await enableDraft();
  expect(await screen.findByRole('alert')).toHaveTextContent('другой вкладке');
  expect(screen.queryByText('Черновик зашифрован и сохранён на устройстве.'))
    .not.toBeInTheDocument();
});

test('server-confirmed write removes only the currently unlocked encrypted draft', async () => {
  const ref = createRef();
  render(<ProtectedDraftControls {...props} ref={ref}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Включить шифрование черновика' }));
  fireEvent.change(screen.getByPlaceholderText('Минимум 12 символов'), {
    target: { value: phrase }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Включить' }));
  await waitFor(() => expect(handle.write).toHaveBeenCalled());
  await ref.current.clearAfterCommit();
  expect(handle.discard).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Включить шифрование черновика' }))
    .toBeInTheDocument();
  expect(discardProtectedDraft).not.toHaveBeenCalled();
});

test('compact session draft starts unobtrusively and still requires explicit protection', () => {
  render(<ProtectedDraftControls {...props} surface="session-new" compact />);
  expect(screen.getByText('Локальный черновик')).toBeInTheDocument();
  expect(screen.getByText(/Зашифрованная копия останется в этом браузере/)).toBeInTheDocument();
  expect(screen.queryByText(/AES-GCM/)).not.toBeInTheDocument();
  expect(openProtectedDraft).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Защитить текст на устройстве' }));
  expect(screen.getByText('Придумайте отдельную фразу')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Минимум 12 символов')).toBeInTheDocument();
  expect(openProtectedDraft).not.toHaveBeenCalled();
});
