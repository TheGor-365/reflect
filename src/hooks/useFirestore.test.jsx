import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { useFirestore } from './useFirestore';

vi.mock('../firebase/config', () => ({ db: {}, appId: 'reflect-8fdc8' }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  onSnapshot: vi.fn()
}));

let handlers;
let unsubscribe;
function FirestoreHarness({ userId }) {
  const { data, loading, error } = useFirestore('diaryNotes', userId);
  return (
    <div>
      <span data-testid="records">{data.map((record) => record.title).join(',')}</span>
      <span data-testid="loading">{loading ? 'yes' : 'no'}</span>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  collection.mockReturnValue({});
  query.mockReturnValue({});
  handlers = [];
  unsubscribe = vi.fn();
  onSnapshot.mockImplementation((_q, onNext, onError) => {
    handlers.push({ onNext, onError });
    return unsubscribe;
  });
});

test('changing user ID never displays records from previous account', () => {
  const view = render(<FirestoreHarness userId="first" />);
  act(() => {
    handlers[0].onNext({ docs: [{ id: 'n1', data: () => ({ title: 'old-test-record' }) }] });
  });
  expect(screen.getByTestId('records').textContent).toBe('old-test-record');
  view.rerender(<FirestoreHarness userId="second" />);
  expect(screen.getByTestId('records').textContent).toBe('');
  expect(screen.getByTestId('loading').textContent).toBe('yes');
  act(() => handlers[0].onNext({ docs: [{ id: 'n2', data: () => ({ title: 'stale-test-record' }) }] }));
  expect(screen.getByTestId('records').textContent).toBe('');
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test('Firestore read failure is surfaced, not presented as empty content', () => {
  render(<FirestoreHarness userId="first" />);
  act(() => handlers[0].onError({ code: 'permission-denied' }));
  expect(screen.getByRole('alert').textContent).toMatch(/Не удалось загрузить/);
  expect(screen.getByTestId('loading').textContent).toBe('no');
});
