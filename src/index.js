import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css'; // Импортируем глобальные стили и Tailwind CSS
import App from './App';
import reportWebVitals from './reportWebVitals';

// Находим корневой DOM-элемент, в который будет встроено приложение
const root = ReactDOM.createRoot(document.getElementById('root'));

// Отрисовываем главный компонент <App /> внутри корневого элемента.
// <React.StrictMode> — это инструмент для выявления потенциальных проблем в приложении.
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Если вы хотите начать измерять производительность в вашем приложении, передайте функцию
// для логирования результатов (например: reportWebVitals(console.log))
// или отправьте на эндпоинт для аналитики. Узнайте больше: https://bit.ly/CRA-vitals
reportWebVitals();
