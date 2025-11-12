// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
  })
);
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// detecta si en el chat el usuario dijo "1 hora", "60 min", etc.
function detectRequestedDuration(messages = []) {
  const text = messages
    .map((m) => (m?.content || "").toLowerCase())
    .join(" ");

  if (text.includes("1 hora") || text.includes("una hora")) return 60;
  if (text.includes("60 min") || text.includes("60min")) return 60;
  if (text.includes("45 min") || text.includes("45min")) return 45;
  if (text.includes("30 min") || text.includes("30min")) return 30;

  return null;
}

function buildSystemPrompt(profile, requestedDurationMinutes) {
  const durationText = requestedDurationMinutes
    ? `El usuario pidió una duración aproximada de ${requestedDurationMinutes} minutos. ADÁPTATE a ese tiempo.`
    : `Si el usuario no dijo tiempo, sugiere entre 35 y 40 minutos.`;

  return `
Eres "VitaliTrainer", una IA que vive dentro de una app de salud física y mental para adolescentes (13-19).

TU TONO:
- Siempre en español.
- Corto, motivador.
- No digas que no tienes acceso, la app usa tu JSON.

DATOS DEL USUARIO:
${JSON.stringify(profile, null, 2)}

SOBRE EL TIEMPO:
- ${durationText}
- Si el usuario pidió 60 minutos, arma el día como: calentamiento (5-10) + bloque principal (35-40) + core/movilidad (10-15).

FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "assistant_message": "texto corto para el chat",
  "routine": [
    {
      "day": "Lunes",
      "type": "Fuerza tren superior",
      "duration": 60,
      "exercises": [
        { "name": "Calentamiento articular", "time": "5 min" },
        { "name": "Flexiones", "sets": 3, "reps": 12 },
        { "name": "Remo con mochila", "sets": 3, "reps": 12 },
        { "name": "Plancha", "time": "3 x 30s" },
        { "name": "Estiramientos", "time": "5 min" }
      ]
    }
  ],
  "habits": [
    { "title": "Tomar agua al despertar", "desc": "1 vaso apenas te levantas" }
  ],
  "requested_duration": 60
}

REGLAS PARA "routine":
- Si el usuario pidió una rutina nueva o un cambio, DEVUELVE una rutina en el array.
- Cada elemento del array es UN DÍA (máx 7).
- Adáptala al objetivo: bajar, masa, mantener, resistencia.
- Incluye calentamiento y algo de core/movilidad cuando tenga sentido.
- **Muy importante**: en los ejercicios de fuerza usa **repeticiones fijas**, por ejemplo "reps": 10 o "reps": 12. **NO uses rangos como "10-12" o "8-10"** porque la app solo muestra un número.
- Los días de descanso activo ponlos con ejercicios suaves (caminar 10 min, estirar 5 min).

REGLAS PARA "habits":
- Si el usuario pidió hábitos o se ve que le serviría, mándalos aquí.
- Formato: { "title": "...", "desc": "..." }
- No hagas preguntas en los hábitos (“¿qué hábito quieres?”), solo mándalos; la app los inserta.

CONTENIDO DE RIESGO:
- Si habla de autolesión, suicidio, abuso, etc: "assistant_message" recomienda hablar con un adulto/profesional y "routine": [] y "habits": [].
  `.trim();
}

app.get("/", (req, res) => {
  res.json({ ok: true, message: "Vitali AI server running" });
});

app.post("/chat", async (req, res) => {
  try {
    const { messages, profile } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages debe ser un array" });
    }

    const requestedDurationMinutes = detectRequestedDuration(messages);
    const systemPrompt = buildSystemPrompt(profile || {}, requestedDurationMinutes);

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: openaiMessages,
      temperature: 0.6,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = {
        assistant_message: raw,
        routine: [],
        habits: [],
      };
    }

    const finalRoutine = Array.isArray(parsed.routine) ? parsed.routine : [];
    const finalHabits = Array.isArray(parsed.habits) ? parsed.habits : [];

    const fallbackDuration = parsed.requested_duration || requestedDurationMinutes || 40;

    const normalizedRoutine = finalRoutine.map((dayObj) => {
      const dayCopy = { ...dayObj };
      if (!dayCopy.duration) {
        dayCopy.duration = fallbackDuration;
      }
      if (!Array.isArray(dayCopy.exercises)) {
        dayCopy.exercises = [];
      }
      return dayCopy;
    });

    res.json({
      reply: parsed.assistant_message || "Listo 👍",
      routine: normalizedRoutine,
      habits: finalHabits,
      requested_duration: fallbackDuration,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error generando respuesta",
      details: err.message,
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
