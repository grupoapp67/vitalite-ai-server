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

// detecta si en los mensajes el usuario dijo "1 hora", "60 min", etc.
function detectRequestedDuration(messages = []) {
  const text = messages
    .map((m) => (m?.content || "").toLowerCase())
    .join(" ");

  // casos típicos
  if (text.includes("1 hora") || text.includes("una hora")) return 60;
  if (text.includes("60 min") || text.includes("60min")) return 60;
  if (text.includes("45 min") || text.includes("45min")) return 45;
  if (text.includes("30 min") || text.includes("30min")) return 30;

  return null;
}

function buildSystemPrompt(profile, requestedDurationMinutes) {
  // si el usuario no pidió tiempo, sugerimos 35-40
  const durationText = requestedDurationMinutes
    ? `El usuario pidió una duración aproximada de ${requestedDurationMinutes} minutos. ADÁPTATE a ese tiempo.`
    : `Si el usuario no dijo tiempo, sugiere entre 35 y 40 minutos.`;

  return `
Eres "VitaliTrainer", una IA que vive dentro de una app de salud física y mental para adolescentes (13-19).

TU TONO:
- Siempre en español.
- Corto, motivador, sin tecnicismos largos.
- No digas que no tienes acceso, la app va a usar tu JSON.

DATOS DEL USUARIO (úsalos siempre):
${JSON.stringify(profile, null, 2)}

OBJETIVO GENERAL:
- Generar rutinas y hábitos adecuados al objetivo del usuario (bajar, masa, mantener, resistencia), a los días que entrena y a su estado de ánimo/estrés.
- Si el usuario tiene estrés alto, mezcla respiración/movilidad.

SOBRE EL TIEMPO:
- ${durationText}
- Si el usuario pidió 60 minutos, crea bloques para que se vea como "1h": calentamiento (5-10), bloque principal (35-40), core/movilidad (10-15).

FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "assistant_message": "texto corto para mostrar en el chat",
  "routine": [
    {
      "day": "Lunes",
      "type": "Fuerza tren superior",
      "duration": 60,
      "exercises": [
        { "name": "Calentamiento articular", "time": "5 min" },
        { "name": "Flexiones", "sets": 3, "reps": "10-12" },
        { "name": "Remo mochila", "sets": 3, "reps": "12" },
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
- Si el usuario pidió una rutina nueva o dijo que la cambies, DEVUELVE una rutina en el array.
- Cada elemento del array es UN DÍA (no más de 7).
- Los días deben ser coherentes para una semana.
- Si el usuario dijo que entrena pocos días, prioriza esos días y el resto pon "descanso activo".
- Cada día debe tener 4 a 7 ejercicios/bloques, no 1 solo.
- Incluye calentamiento y algo de core/movilidad cuando tenga sentido.
- Si el usuario pidió 1 hora, reparte el tiempo, pero no pongas textos larguísimos.

REGLAS PARA "habits":
- Si el usuario pidió hábitos (o si su objetivo lo sugiere, como bajar de peso o dormir mejor), agrega algunos hábitos.
- Cada hábito debe tener "title" y opcionalmente "desc".
- No hagas preguntas en los hábitos, solo mándalos (la app los va a insertar).
- Ejemplos de hábitos: "Respirar 1 min", "Tomar agua", "Dormir a la misma hora", "Ordenar el cuarto 5 min".

SI HAY CONTENIDO DE RIESGO:
- Si habla de autolesión, suicidio, abuso o algo grave: "assistant_message" debe decir que hable con un adulto/profesional y "routine": [] y "habits": [].
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

    // detectamos si el usuario pidió una duración concreta
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
      // si por alguna razón el modelo no devolvió JSON
      parsed = {
        assistant_message: raw,
        routine: [],
        habits: [],
      };
    }

    // normalizamos la rutina y le metemos duración si falta
    const finalRoutine = Array.isArray(parsed.routine) ? parsed.routine : [];
    const finalHabits = Array.isArray(parsed.habits) ? parsed.habits : [];

    const fallbackDuration = parsed.requested_duration || requestedDurationMinutes || 40;

    const normalizedRoutine = finalRoutine.map((dayObj) => {
      const dayCopy = { ...dayObj };
      if (!dayCopy.duration) {
        dayCopy.duration = fallbackDuration;
      }
      // nos aseguramos de que exercises sea array
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
