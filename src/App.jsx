import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc, arrayUnion, Timestamp } from 'firebase/firestore';
import { db, appId } from './firebase/config';
import { useAuth } from './hooks/useAuth';
import { useFirestore } from './hooks/useFirestore';

import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Diary from './features/Diary/Diary';
import Goals from './features/Goals/Goals';
import Sessions from './features/Sessions/Sessions';
import SessionSchema from './features/SessionSchema/SessionSchema';
import Loader from './components/common/Loader';
import ProfileModal from './components/modals/ProfileModal';
import ContentModal from './components/modals/ContentModal';
import ReflectionModal from './components/modals/ReflectionModal';
import ChecklistFeedbackModal from './components/modals/ChecklistFeedbackModal';

export default function App() {
  // --- Auth & Core Data ---
  const { user, isAuthReady } = useAuth();
  const userId = user?.uid;

  const { data: sessions, loading: sessionsLoading } = useFirestore('sessions', userId);
  const { data: goals, loading: goalsLoading } = useFirestore('goals', userId);
  const { data: moods, loading: moodsLoading } = useFirestore('moods', userId);
  const { data: diaryNotes, loading: notesLoading } = useFirestore('diaryNotes', userId);

  // --- Profile State ---
  const [profile, setProfile] = useState(null);
  const [isProfileLoading, setIsProfileLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // --- UI State ---
  const [activeTab, setActiveTab] = useState('diary');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // --- Modal State ---
  const [viewingContent, setViewingContent] = useState(null);
  const [reflectionGoal, setReflectionGoal] = useState(null);
  const [editingNote, setEditingNote] = useState(null);
  const [feedbackGoal, setFeedbackGoal] = useState(null);

  // --- Profile Fetching ---
  useEffect(() => {
    if (!isAuthReady || !userId) return;

    const fetchProfile = async () => {
      setIsProfileLoading(true);
      const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profiles`, 'userProfile');
      try {
        const docSnap = await getDoc(profileRef);
        if (docSnap.exists()) {
          setProfile(docSnap.data());
        } else {
          setShowProfileModal(true);
        }
      } catch (error) {
        console.error("Error fetching profile:", error);
        setShowProfileModal(true);
      } finally {
        setIsProfileLoading(false);
      }
    };

    fetchProfile();
  }, [isAuthReady, userId]);

  // --- Handlers ---
  const handleSaveProfile = async (profileData) => {
    if (!userId || !db) return;
    const profileRef = doc(db, `artifacts/${appId}/users/${userId}/profiles`, 'userProfile');
    try {
      await setDoc(profileRef, profileData);
      setProfile(profileData);
      setShowProfileModal(false);
    } catch (error) {
      console.error("Error saving profile:", error);
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
  const isLoadingData = sessionsLoading || goalsLoading || moodsLoading || notesLoading || isProfileLoading;
  if (!isAuthReady || isLoadingData) {
    return <Loader />;
  }

  if (showProfileModal) {
    return <ProfileModal onSave={handleSaveProfile} existingProfile={profile} />;
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'diary':
        return <Diary
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
        />;
      default:
        return <Diary />;
    }
  };

  return (
    <div className="relative min-h-screen lg:flex font-sans bg-stone-50 text-stone-900">
      {/* Modals */}
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
        onProfileClick={() => setShowProfileModal(true)}
      />

      <main className="flex-1 flex flex-col h-screen">
        <Header onMenuClick={() => setIsSidebarOpen(true)} activeTab={activeTab} />
        <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24">
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
}
