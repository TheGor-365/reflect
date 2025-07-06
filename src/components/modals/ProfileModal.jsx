import React, { useState } from 'react';

const ProfileModal = ({ onSave, existingProfile }) => {
  const [profileData, setProfileData] = useState({
    name: existingProfile?.name || '',
    age: existingProfile?.age || '',
    gender: existingProfile?.gender || 'не указан'
  });
  const [error, setError] = useState('');

  const handleSave = () => {
    if (!profileData.name.trim() || !profileData.age) {
      setError('Пожалуйста, заполните имя и возраст.');
      return;
    }
    onSave(profileData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[70] p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md animate-fade-in">
        <h2 className="text-2xl font-bold text-stone-800 mb-2">{existingProfile ? 'Редактировать профиль' : 'Добро пожаловать!'}</h2>
        <p className="text-stone-600 mb-6">Пожалуйста, представьтесь, чтобы ассистент мог лучше вас понимать.</p>

        <div className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-stone-700 mb-1">Имя или псевдоним</label>
            <input
              type="text"
              id="name"
              value={profileData.name}
              onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Как к вам обращаться?"
            />
          </div>
          <div>
            <label htmlFor="age" className="block text-sm font-medium text-stone-700 mb-1">Возраст</label>
            <input
              type="number"
              id="age"
              value={profileData.age}
              onChange={(e) => setProfileData({ ...profileData, age: e.target.value })}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Полных лет"
            />
          </div>
          <div>
            <label htmlFor="gender" className="block text-sm font-medium text-stone-700 mb-1">Пол</label>
            <select
              id="gender"
              value={profileData.gender}
              onChange={(e) => setProfileData({ ...profileData, gender: e.target.value })}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="не указан">Не указан</option>
              <option value="мужской">Мужской</option>
              <option value="женский">Женский</option>
            </select>
          </div>
        </div>

        {error && <p className="text-red-500 text-sm mt-4">{error}</p>}

        <div className="mt-8">
          <button onClick={handleSave} className="w-full px-6 py-3 text-white bg-teal-600 rounded-lg hover:bg-teal-700 font-semibold transition-colors">
            Сохранить и продолжить
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;
