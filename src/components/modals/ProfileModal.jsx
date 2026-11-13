import React, { useState } from 'react';
import ReflectSelect from '../ReflectSelect';
import { ArrowRight, Heart, Sparkles, UserRound, X } from 'lucide-react';

const ProfileModal = ({
  onSave, existingProfile, saving = false, saveError = null, onCancel
}) => {
  const [profileData, setProfileData] = useState({
    name: existingProfile?.name || '',
    age: existingProfile?.age || '',
    gender: existingProfile?.gender || 'не указан'
  });
  const [error, setError] = useState('');

  const handleSave = event => {
    event.preventDefault();
    if (!profileData.name.trim()) {
      setError('Укажите имя или псевдоним.');
      return;
    }
    const age = profileData.age === '' ? '' : Number(profileData.age);
    if (age !== '' && (!Number.isInteger(age) || age < 1 || age > 120)) {
      setError('Укажите корректный возраст или оставьте поле пустым.');
      return;
    }
    onSave({
      ...profileData,
      name: profileData.name.trim(),
      ...(age === '' ? {} : { age })
    });
  };

  return (
    <div className="reflect-auth-overlay">
      <section className="reflect-auth-card" role="dialog" aria-modal="true"
        aria-labelledby="reflect-profile-title" aria-describedby="reflect-profile-intro">
        {onCancel && <button type="button" className="reflect-auth-close"
          aria-label="Закрыть профиль" onClick={onCancel} disabled={saving}><X size={19} /></button>}
        <div className="reflect-auth-mark" aria-hidden="true"><UserRound size={26} /></div>
        <p className="reflect-auth-eyebrow">REFLECT · ПРОФИЛЬ</p>
        <h1 id="reflect-profile-title">{existingProfile ? 'Настройки профиля' : 'Добро пожаловать!'}</h1>
        <p id="reflect-profile-intro" className="reflect-auth-intro">
          Выберите имя, под которым хотите вести дневник. Возраст и пол необязательны.
          Здесь нет оценок или обязательных личных вопросов.
        </p>
        <form className="reflect-auth-form" onSubmit={handleSave}>
          <label htmlFor="name">Имя или псевдоним
            <span className="reflect-auth-field"><Sparkles size={18} aria-hidden="true" />
              <input id="name" type="text" autoComplete="nickname"
                value={profileData.name} maxLength={80}
                onChange={e => { setError(''); setProfileData(prev => ({ ...prev, name: e.target.value })); }}
                placeholder="Как к вам обращаться?" disabled={saving} required />
            </span>
          </label>
          <label htmlFor="age">Возраст <span className="reflect-auth-optional">необязательно</span>
            <span className="reflect-auth-field"><Heart size={18} aria-hidden="true" />
              <input id="age" type="number" min="1" max="120" inputMode="numeric"
                value={profileData.age} onChange={e => setProfileData(prev => ({ ...prev, age: e.target.value }))}
                placeholder="Полных лет" disabled={saving} />
            </span>
          </label>
          <ReflectSelect label="Пол (необязательно)" ariaLabel="Пол"
            value={profileData.gender} disabled={saving}
            options={[['не указан','Не указан'],['мужской','Мужской'],
              ['женский','Женский']]}
            onChange={gender => setProfileData(prev => ({ ...prev, gender }))}/>
          {(error || saveError) && <p className="reflect-auth-error" role="alert">{error || saveError}</p>}
          <button type="submit" className="reflect-auth-primary" disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить и продолжить'}
            {!saving && <ArrowRight size={19} aria-hidden="true" />}
          </button>
        </form>
        <p className="reflect-auth-footer">Ваши мысли принадлежат вам.</p>
      </section>
    </div>
  );
};

export default ProfileModal;
