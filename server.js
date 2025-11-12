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

/* ====== helpers de intención ====== */

// devuelve el texto del último mensaje del user
function getLastUserMessage(messages = []) {
  const reversed = [...messages].reverse();
  const lastUser = reversed.find((m) => m.role === "user");
  return (lastUser && (lastUser.content || "")) || "";
}

// ¿está hablando de hábitos?
function mentionsHabits(text = "") {
  const t = text.toLowerCase();
  return (
    t.includes("hábito") ||
    t.includes("habito") ||
    t.includes("hábitos") ||
    t.includes("habitos") ||
    t.includes("crear hábitos") ||
    t.includes("crear habitos") ||
    t.includes("ponerme hábitos") ||
    t.includes("ponerme habitos")
  );
}

// ¿está hablando de rutina/entrenar?
function mentionsRoutine(text = "") {
  const t = text.toLowerCase();
  return (
    t.includes("rutina") ||
    t.includes("entreno") ||
    t.includes("entrenar") ||
    t.includes("entrenamiento") ||
    t.includes("cámbiame la rutina") ||
    t.includes("cambiar la rutina")
  );
}

// ¿pide tiempo concreto?
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
    ? `El usuario pidió una duración aproximada de ${requestedDurationMinutes} minutos. ADÁPTATE a ese tiempo y pon "duration": ${requestedDurationMinutes} en cada día.`
    : `Si el usuario no dijo tiempo, sugiere entre 35 y 40 minutos.`;

  return `
Eres "VitaliTrainer", una IA que vive dentro de una app de salud física y mental para adolescentes (13-19).

OBJETIVO:
- Solo hablas de: entrenamiento/rutinas, creación de hábitos saludables y acompañamiento emocional amable.
- Si el usuario cuenta un problema personal, respondes EMPÁTICA, breve y sin juicios (estilo psicólogo joven), y NO inventas rutinas ni hábitos a menos que el último mensaje lo pida.
- No arrastres pedidos viejos: RESPONDE SOLO a lo que diga el ÚLTIMO mensaje del usuario.

DATOS DEL USUARIO:
${JSON.stringify(profile, null, 2)}

DURACIÓN:
- ${durationText}
- Si pidió 60 min: calentamiento 5-10 + bloque principal 35-40 + core/movilidad 10-15.

FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "assistant_message": "texto corto y amable",
  "routine": [ ... ],
  "habits": [ ... ],
  "requested_duration": 40
}

REGLAS DE CONTENIDO:
- Si el último mensaje fue sobre RUTINA/entreno: entonces sí devuelve "routine" con los días.
- Si el último mensaje NO fue sobre RUTINA: devuelve "routine": [].
- Si el último mensaje fue sobre HÁBITOS: entonces sí devuelve "habits".
- Si el último mensaje NO fue sobre HÁBITOS: devuelve "habits": [].
- En fuerza usa SIEMPRE reps fijas: "reps": 10 (NO "10-12").
- Cada ejercicio debe tener o "sets"+"reps" o "time".
- Si el mensaje es solo emocional ("me siento mal", "estoy triste", etc.), responde con apoyo y pon routine: [] y habits: [].

EJEMPLO DE RUTINA (no lo copies literal, es solo forma):
"routine": [
  {
    "day": "Lunes",
    "type": "Fuerza tren superior",
    "duration": 40,
    "exercises": [
      { "name": "Calentamiento articular", "time": "5 min" },
      { "name": "Flexiones", "sets": 3, "reps": 12 },
      { "name": "Remo con mochila", "sets": 3, "reps": 12 },
      { "name": "Plancha", "time": "3 x 30s" },
      { "name": "Estiramientos", "time": "5 min" }
    ]
  }
]

EJEMPLO DE HÁBITOS:
"habits": [
  { "title": "Tomar agua al despertar", "desc": "1 vaso apenas te levantas" },
  { "title": "Respirar 1 min", "desc": "Para bajar ansiedad" }
]

RIESGO:
- Si habla de autolesión, suicidio, abuso o algo grave: "assistant_message" = recomendar adulto/profesional y "routine": [] y "habits": [].
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

    // intención del ÚLTIMO mensaje
    const lastUserText = getLastUserMessage(messages);
    const userWantsHabits = mentionsHabits(lastUserText);
    const userWantsRoutine = mentionsRoutine(lastUserText);
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

    // normalizamos lo que vino
    let finalRoutine = Array.isArray(parsed.routine) ? parsed.routine : [];
    let finalHabits = Array.isArray(parsed.habits) ? parsed.habits : [];

    // SI el usuario NO habló de rutina en el último mensaje → no mandamos rutina
    if (!userWantsRoutine) {
      finalRoutine = [];
    }

    // SI el usuario NO habló de hábitos en el último mensaje → no mandamos hábitos
    if (!userWantsHabits) {
      finalHabits = [];
    }

    // duración de respaldo
    const fallbackDuration =
      parsed.requested_duration || requestedDurationMinutes || 40;

    const normalizedRoutine = finalRoutine.map((dayObj) => {
      const dayCopy = { ...dayObj };
      if (!dayCopy.duration) {
        dayCopy.duration = fallbackDuration;
      }
      if (!Array.isArray(dayCopy.exercises)) {
        dayCopy.exercises = [];
      }
      // forzamos reps fijas si viene algo raro
      dayCopy.exercises = dayCopy.exercises.map((ex) => {
        const exCopy = { ...ex };
        if (typeof exCopy.reps === "string" && exCopy.reps.includes("-")) {
          // si viene "10-12" nos quedamos con el primer número
          const first = parseInt(exCopy.reps.split("-")[0], 10);
          if (!isNaN(first)) exCopy.reps = first;
        }
        return exCopy;
      });
      return dayCopy;
    });

    res.json({
      reply:
        parsed.assistant_message ||
        (userWantsRoutine
          ? "Aquí tienes una rutina adaptada 💪"
          : userWantsHabits
          ? "Te dejo unos hábitos fáciles 😉"
          : "Te leo 💛"),
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
