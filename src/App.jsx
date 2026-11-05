import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db, appId } from './firebase/config';
import { useAuth } from './hooks/useAuth';
import { useFirestore } from './hooks/useFirestore';

import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import MobileDock from './components/layout/MobileDock';
import Diary from './features/Diary/Diary';
import Goals from './features/Goals/Goals';
import Sessions from './features/Sessions/Sessions';
import SessionSchema from './features/SessionSchema/SessionSchema';
import Loader from './components/common/Loader';
import ProfileModal from './components/modals/ProfileModal';
import AccountAccess from './components/modals/AccountAccess';
import ContentModal from './components/modals/ContentModal';
import ReflectionModal from './components/modals/ReflectionModal';
import ChecklistFeedbackModal from './components/modals/ChecklistFeedbackModal';

function LoadErrorView({ message }) {
  return (
    <main role="alert" className="min-h-screen bg-stone-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-xl border border-red-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900 mb-3">Не удалось загрузить данные</h1>
        <p className="text-sm text-stone-700 mb-5">{message}</p>
        <button type="button" onClick={() => window.location.reload()}
          className="rounded-lg bg-teal-600 px-4 py-2 text-white hover:bg-teal-700">
          Повторить загрузку
        </button>
      </div>
    </main>
  );
}

export default function App() {
  // --- Auth & Core Data ---
  const { user, isAuthReady, authError, refreshUser } = useAuth();
  const userId = user?.uid;

  const { data: sessions, loading: sessionsLoading, error: sessionsError } = useFirestore('sessions', userId);
  const { data: goals, loading: goalsLoading, error: goalsError } = useFirestore('goals', userId);
  const { data: moods, loading: moodsLoading, error: moodsError } = useFirestore('moods', userId);
  const { data: diaryNotes, loading: notesLoading, error: notesError } = useFirestore('diaryNotes', userId);

  // Profile load failures are distinct from a genuinely missing profile.
  // The UID is attached to state so previous users' profiles never flash.
  const [profileState, setProfileState] = useState({
    uid: null, status: 'idle', data: null, error: null
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [allowGuestProfile, setAllowGuestProfile] = useState(false);
  const profile = profileState.uid === userId ? profileState.data : null;

  useEffect(() => {
    // Never inherit account portal choices from the previous signed-in UID.
    setAllowGuestProfile(false);
    setShowAccountModal(false);
  }, [userId]);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState('diary');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    try { return window.localStorage.getItem('reflect-theme') === 'light' ? 'light' : 'dark'; }
    catch { return 'dark'; }
  });

  useEffect(() => {
    try { window.localStorage.setItem('reflect-theme', theme); }
    catch { /* Browser storage is optional; never block journal access. */ }
  }, [theme]);

  useEffect(() => {
    if (!isSidebarOpen) return undefined;
    const onEscape = (event) => {
      if (event.key === 'Escape') setIsSidebarOpen(false);
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [isSidebarOpen]);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // --- Modal State ---
  const [viewingContent, setViewingContent] = useState(null);
  const [reflectionGoal, setReflectionGoal] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [feedbackGoal, setFeedbackGoal] = useState(null);

  // --- Profile Fetching ---
  useEffect(() => {
    if (!isAuthReady || !userId) {
      setProfileState({ uid: null, status: 'idle', data: null, error: null });
      setShowProfileModal(false);
      return undefined;
    }

    let cancelled = false;
    setProfileState({ uid: userId, status: 'loading', data: null, error: null });
    setShowProfileModal(false);
    setProfileSaveError(null);

    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profiles`, 'userProfile');
    getDoc(profileRef)
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot.exists()) {
          setProfileState({ uid: userId, status: 'ready', data: snapshot.data(), error: null });
        } else {
          setProfileState({ uid: userId, status: 'missing', data: null, error: null });
          setShowProfileModal(true);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error('Profile read failed:', error?.code || 'unknown');
        setProfileState({
          uid: userId,
          status: 'error',
          data: null,
          error: 'Ошибка чтения профиля. Ваши данные не удалены. Проверьте соединение и повторите попытку.'
        });
        // NEVER ask a returning user to create a new profile after a read error.
        setShowProfileModal(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthReady, userId]);

  // --- Handlers ---
  const handleSaveProfile = async (profileData) => {
    if (!userId || !db || profileSaving) return;
    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profiles`, 'userProfile');
    setProfileSaving(true);
    setProfileSaveError(null);
    try {
      // Preserve any existing profile fields not handled by this simple modal.
      await setDoc(profileRef, profileData, { merge: true });
      setProfileState({
        uid: userId, status: 'ready',
        data: { ...(profile || {}), ...profileData }, error: null
      });
      setShowProfileModal(false);
    } catch (error) {
      console.error('Profile save failed:', error?.code || 'unknown');
      setProfileSaveError('Не удалось сохранить профиль. Проверьте соединение и повторите попытку.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveReflection = async (text) => {
    const targetEntry = reflectionGoal || editingNote;
    if (!targetEntry || !text.trim() || !db || !userId) return;

    const isGoal = !!reflectionGoal;
    const collectionName = isGoal ? 'goals' : 'diaryNotes';
    const fieldToUpdate = isGoal ? 'reflections' : 'entries';
    
    const entryId = targetEntry.id || targetEntry.data.id;
    if (!entryId) {
      console.error("Cannot save reflection, entry ID is missing.");
      return;
    }

    const entryRef = doc(db, `artifacts/${appId}/users/${userId}/${collectionName}`, entryId);
    const newSubEntry = { text, createdAt: Timestamp.now() };
    
    const updatePayload = { [fieldToUpdate]: arrayUnion(newSubEntry) };
    if (isGoal) {
      updatePayload.completed = true;
    }

    await updateDoc(entryRef, updatePayload);

    setReflectionGoal(null);
    setEditingNote(null);
  };
  
  const handleSaveFeedback = async (feedback) => {
    if (!feedbackGoal) return;
    await updateDoc(doc(db, `artifacts/${appId}/users/${userId}/goals`, feedbackGoal.id), { checklistFeedback: { ...feedback, createdAt: Timestamp.now() } });
    setFeedbackGoal(null);
  };

  const handleAppendToEntry = (entry) => {
    if (entry.type === 'goal') {
      setReflectionGoal(entry);
    } else if (entry.type === 'note') {
      setEditingNote(entry);
    }
  };

  const changeTab = (tab) => { setActiveTab(tab); setIsSidebarOpen(false); };
  const selectSession = (id) => { setCurrentSessionId(id); setActiveTab('sessions'); setIsSidebarOpen(false); };
  const handleNewSession = () => { setCurrentSessionId('new'); setActiveTab('sessions'); setIsSidebarOpen(false); };

  // --- Render Logic ---
  const profileIsLoading = profileState.uid !== userId || profileState.status === 'loading';
  const isLoadingData = sessionsLoading || goalsLoading || moodsLoading || notesLoading || profileIsLoading;
  const readError = sessionsError || goalsError || moodsError || notesError || profileState.error;

  if (!isAuthReady) return <Loader />;

  if (!userId) {
    return <LoadErrorView message={authError || 'Авторизация пока недоступна. Повторите попытку позже.'} />;
  }

  if (isLoadingData) return <Loader />;

  if (readError) return <LoadErrorView message={readError} />;

  const hasLocalData = Boolean(profile) ||
    sessions.length > 0 || goals.length > 0 || moods.length > 0 || diaryNotes.length > 0;

  if (showProfileModal && user.isAnonymous && !profile && !allowGuestProfile) {
    return (
      <div className="reflect-app" data-theme={theme}>
        <AccountAccess user={user} hasLocalData={hasLocalData} welcome
          onGuest={() => setAllowGuestProfile(true)}
          onContinue={() => setAllowGuestProfile(true)}
          onAccountChanged={account => {
            // The UID may remain unchanged on link. Never wait for a separate
            // Auth listener emission to advance the first-time onboarding.
            setAllowGuestProfile(true);
            refreshUser?.(account);
          }} />
      </div>
    );
  }

  if (showProfileModal) {
    return (
      <div className="reflect-app" data-theme={theme}>
      <ProfileModal
        onSave={handleSaveProfile}
        existingProfile={profile}
        saving={profileSaving}
        saveError={profileSaveError}
        onCancel={profile ? () => setShowProfileModal(false) : undefined}
      />
      </div>
    );
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'diary':
          return <Diary
              key={userId}
              sessions={sessions} 
              goals={goals} 
              moods={moods} 
              diaryNotes={diaryNotes} 
              userId={userId}
              onAppend={handleAppendToEntry}
              isLoading={isLoadingData}
          />;
      case 'goals':
        return <Goals 
          goals={goals} 
          userId={userId} 
          onAppend={handleAppendToEntry}
          onFeedback={setFeedbackGoal}
        />;
      case 'sessionSchema':
        return <SessionSchema 
          sessions={sessions} 
          goals={goals} 
          onViewContent={setViewingContent}
        />;
      case 'sessions':
        return <Sessions 
          sessions={sessions} 
          profile={profile}
          userId={userId}
          currentSessionId={currentSessionId}
          setCurrentSessionId={setCurrentSessionId}
          onStartNewSession={handleNewSession}
        />;
      default:
          return <Diary />;
    }
  };

  return (
    <div className="reflect-app min-h-screen font-sans" data-theme={theme}>
      {showAccountModal && (
        <AccountAccess user={user} hasLocalData={hasLocalData}
          onClose={() => setShowAccountModal(false)}
          onAccountChanged={account => refreshUser?.(account)} />
      )}
      <a className="reflect-skip-link" href="#reflect-main">Перейти к содержимому</a>

      {feedbackGoal && <ChecklistFeedbackModal goal={feedbackGoal} onSave={handleSaveFeedback} onCancel={() => setFeedbackGoal(null)} />}
      {(reflectionGoal || editingNote) && <ReflectionModal entry={reflectionGoal || editingNote} onSave={handleSaveReflection} onCancel={() => {setReflectionGoal(null); setEditingNote(null);}} />}
      {viewingContent && <ContentModal content={viewingContent} onClose={() => setViewingContent(null)} />}

      <Sidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeTab={activeTab}
        changeTab={changeTab}
        sessions={sessions}
        currentSessionId={currentSessionId}
        selectSession={selectSession}
        handleNewSession={handleNewSession}
        profile={profile}
        userId={userId}
        onProfileClick={() => { setProfileSaveError(null); setShowProfileModal(true); }}
        onAccountClick={() => { setIsSidebarOpen(false); setShowAccountModal(true); }}
        accountLabel={user.isAnonymous ? 'Гостевой доступ' : 'Email подключён'}
      />

      <div className="reflect-layout">
        <Header
          activeTab={activeTab}
          onMenuClick={() => setIsSidebarOpen(true)}
          theme={theme}
          onToggleTheme={() => setTheme(current => current === 'dark' ? 'light' : 'dark')}
        />
        <main className={`reflect-main reflect-workspace ${activeTab === 'sessions' ? 'reflect-main--sessions' : ''}`} id="reflect-main" tabIndex={-1}>
          {renderActiveTab()}
        </main>
      </div>

      <MobileDock
        activeTab={activeTab}
        currentSessionId={currentSessionId}
        changeTab={changeTab}
        handleNewSession={handleNewSession}
      />
    </div>
  );
}
