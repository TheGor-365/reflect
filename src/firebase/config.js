import { initializeApp } from 'firebase/app';
import { getAnalytics } from "firebase/analytics";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Эти переменные должны быть предоставлены средой выполнения

// const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// export const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const firebaseConfig = process.env.REACT_APP_FIREBASE_CONFIG
  ? JSON.parse(process.env.REACT_APP_FIREBASE_CONFIG)
  : {};

export const appId = process.env.REACT_APP_APP_ID || 'default-app-id';

// Инициализируем приложение
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Экспортируем сервисы для использования в других частях приложения
export const auth = getAuth(app);
export const db = getFirestore(app);


