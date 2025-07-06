import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Эти переменные должны быть предоставлены средой выполнения
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// Инициализируем приложение
const app = initializeApp(firebaseConfig);

// Экспортируем сервисы для использования в других частях приложения
export const auth = getAuth(app);
export const db = getFirestore(app);
