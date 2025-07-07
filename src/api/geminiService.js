/**
 * Отправляет запрос к Gemini API и обрабатывает ответ.
 * @param {Array} history - История чата.
 * @param {Object} userProfile - Профиль пользователя.
 * @returns {Promise<Object>} - Объект с ответом от AI или объект с ошибкой.
 */
export const getAnalysisFromAI = async (history, userProfile) => {
  // --- ИСПРАВЛЕНИЕ: Считываем API-ключ из переменных окружения ---
  // Этот ключ должен быть определен в файле .env в корне проекта
  const apiKey = process.env.REACT_APP_GEMINI_API_KEY;

  if (!apiKey) {
    const errorMessage = "API-ключ для Gemini не найден. Пожалуйста, добавьте REACT_APP_GEMINI_API_KEY в ваш .env файл.";
    console.error(errorMessage);
    return { error: errorMessage };
  }

  // Формируем промпт для AI с информацией о пользователе и историей чата.
  const profileInfo = userProfile ? `Ты говоришь с пользователем по имени ${userProfile.name}, возраст ${userProfile.age}, пол ${userProfile.gender}. Учитывай эту информацию в своих ответах.` : '';
  const prompt = `Ты — эмпатичный цифровой помощник. Твоя задача — помочь пользователю разобраться в его чувствах. ${profileInfo}
  История диалога: ${history.map(m => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`).join('\n')}
  Предоставь ответ в формате JSON. Не добавляй текста за пределами объекта JSON.
  Структура JSON: { "response": "Твой ответ пользователю.", "score": "число от 0 до 100", "sessionTitle": "Короткое название для сессии.", "recommendations": ["массив советов."], "exercises": [{ "title": "Название упражнения", "description": "Описание упражнения." }] }`;
  
  // Формируем тело запроса для API.
  const payload = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          "response": { "type": "STRING" },
          "score": { "type": "STRING" },
          "sessionTitle": { "type": "STRING" },
          "recommendations": { "type": "ARRAY", "items": { "type": "STRING" } },
          "exercises": {
            "type": "ARRAY",
            "items": {
              "type": "OBJECT",
              "properties": {
                "title": { "type": "STRING" },
                "description": { "type": "STRING" }
              },
              "required": ["title", "description"]
            }
          }
        },
        required: ["response", "score", "sessionTitle", "recommendations", "exercises"]
      }
    }
  };

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  
  try {
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error("API Error Response Body:", errorBody);
      throw new Error(`HTTP error! status: ${response.status}, body: ${errorBody}`);
    }
    
    const result = await response.json();
    
    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content.parts[0].text) {
      const rawText = result.candidates[0].content.parts[0].text;
      const cleanedText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      
      try {
        return JSON.parse(cleanedText);
      } catch (parseError) {
        console.error("JSON Parsing Error:", parseError, "Text that failed to parse:", cleanedText);
        throw new Error("Failed to parse AI response as JSON.");
      }
    }
    
    throw new Error("No valid response from AI.");

  } catch (error) {
    console.error("Gemini API Call Failed:", error);
    return { error: "Не удалось получить ответ от ассистента. Проверьте консоль для деталей." };
  }
};
