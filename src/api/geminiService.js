export const getAnalysisFromAI = async (history, userProfile) => {
  const profileInfo = userProfile ? `Ты говоришь с пользователем по имени ${userProfile.name}, возраст ${userProfile.age}, пол ${userProfile.gender}. Учитывай эту информацию в своих ответах.` : '';
  const prompt = `Ты — эмпатичный цифровой помощник. Твоя задача — помочь пользователю разобраться в его чувствах. ${profileInfo}
  История диалога: ${history.map(m => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`).join('\n')}
  Предоставь ответ в формате JSON. Не добавляй текста за пределами объекта JSON.
  Структура JSON: { "response": "Твой ответ пользователю.", "score": "число от 0 до 100", "sessionTitle": "Короткое название для сессии.", "recommendations": ["массив советов."], "exercises": [{ "title": "Название упражнения", "description": "Описание упражнения." }] }`;

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

  const apiKey = ""; // API-ключ обрабатывается средой выполнения
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
  try {
    const response = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const result = await response.json();
    if (result.candidates && result.candidates.length > 0) {
      // Исправляем возможные проблемы с JSON, удаляя лишние символы
      const rawText = result.candidates[0].content.parts[0].text;
      return JSON.parse(rawText.replace(/```json\n?/, '').replace(/```$/, ''));
    }
    throw new Error("No valid response from AI.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    return { error: "Не удалось получить ответ от ассистента." };
  }
};
