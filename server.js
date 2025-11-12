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

// --------- helpers de fallback ---------
const WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function inferRequestedDaysFromText(text) {
  if (!text) return null;
  const m = text.match(/(\d+)\s*d[ií]as/i);
  if (m) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 7) return n;
  }
  return null;
}

function inferFocusFromText(text) {
  if (!text) return null;
  const t = text.toLowerCase();
  if (t.includes("pierna") || t.includes("piernas")) return "Pierna y glúteo";
  if (t.includes("pecho")) return "Pecho y tríceps";
  if (t.includes("espalda")) return "Espalda y bíceps";
  if (t.includes("hombro") || t.includes("hombros")) return "Hombros y core";
  if (t.includes("full")) return "Full body";
  return null;
}

function buildExercisesForFocus(focus) {
  switch (focus) {
    case "Pierna y glúteo":
      return [
        { name: "Calentamiento articular", time: "5 min" },
        { name: "Sentadillas", sets: 4, reps: "10-12" },
        { name: "Zancadas alternadas", sets: 3, reps: "12/12" },
        { name: "Puente de glúteo", sets: 3, reps: "15" },
        { name: "Estiramientos", time: "5 min" },
      ];
    case "Pecho y tríceps":
      return [
        { name: "Calentamiento articular", time: "5 min" },
        { name: "Flexiones", sets: 4, reps: "8-12" },
        { name: "Fondos en silla", sets: 3, reps: "10-12" },
        { name: "Press con mochila o botellas", sets: 3, reps: "10-12" },
        { name: "Plancha", time: "30s x 3" },
      ];
    case "Espalda y bíceps":
      return [
        { name: "Calentamiento articular", time: "5 min" },
        { name: "Remo con mochila", sets: 4, reps: "10-12" },
        { name: "Jalón con banda (si tiene)", sets: 3, reps: "12" },
        { name: "Curl con mochila/botellas", sets: 3, reps: "10-12" },
        { name: "Estiramientos", time: "5 min" },
      ];
    case "Hombros y core":
      return [
        { name: "Calentamiento articular", time: "5 min" },
        { name: "Press de hombros con botellas", sets: 3, reps: "10-12" },
        { name: "Elevaciones laterales con botellas", sets: 3, reps: "12" },
        { name: "Plancha", time: "30s x 3" },
        { name: "Crunch", sets: 3, reps: "15" },
      ];
    case "Full body":
    default:
      return [
        { name: "Calentamiento articular", time: "5 min" },
        { name: "Sentadillas", sets: 3, reps: "12-15" },
        { name: "Flexiones (o en pared)", sets: 3, reps: "8-12" },
        { name: "Remo con mochila", sets: 3, reps: "10-12" },
        { name: "Plancha", time: "30s x 3" },
      ];
  }
}

function buildFallbackRoutine(userMsg, profile) {
  const focus = inferFocusFromText(userMsg) || "Full body";
  const askedDays = inferRequestedDaysFromText(userMsg);
  const profileDays =
    (profile && (profile.trainingDays || profile.training_days)) || 3;
  const trainingDays = askedDays || profileDays || 3;

  const routine = [];
  for (let i = 0; i < trainingDays; i++) {
    const dayName = WEEK_DAYS[i] || `Día ${i + 1}`;
    routine.push({
      day: dayName,
      type: focus,
      duration: 30,
      exercises: buildExercisesForFocus(focus),
    });
  }

  // los demás días: descanso activo
  for (let i = trainingDays; i < 7; i++) {
    const dayName = WEEK_DAYS[i] || `Día ${i + 1}`;
    routine.push({
      day: dayName,
      type: "Descanso activo",
      duration: 15,
      exercises: [
        { name: "Caminar 10 min", time: "10 min" },
        { name: "Estiramientos suaves", time: "5 min" },
      ],
    });
  }

  return routine;
}

function buildSystemPrompt(profile) {
  return `
Eres "VitaliTrainer", una IA que vive dentro de una app de salud física + mental para ADOLESCENTES (13-19).

IMPORTANTÍSIMO:
- Nunca digas que "solo puedes hacer 4 días". Siempre puedes devolver hasta 7 días.
- Si el usuario pide 3 días de pierna, le das 3 de pierna y el resto de la semana lo dejas como descanso activo.
- La app espera SIEMPRE un JSON.

TONO:
- Español.
- Amable, contenedora, como un coach/psicólogo breve.
- Responde solo sobre: entrenamiento, rutinas, hábitos, motivación, manejo básico de emociones.
- Si el usuario habló de hábitos y luego te pide otra cosa, responde solo a lo ÚLTIMO.

DATOS DEL USUARIO:
${JSON.stringify(profile || {}, null, 2)}

FORMATO DE RESPUESTA (OBLIGATORIO):
{
  "assistant_message": "texto para el adolescente",
  "routine": [ ... ],
  "habits": [ ... ],
  "metadata": {
    "requested_duration_min": number | null,
    "recommended_duration_min": number | null
  }
}

DURACIÓN:
- Si NO mencionó duración: en assistant_message pregunta "¿cuánto tiempo quieres entrenar hoy? 20, 30 o 45 min?" y pon "recommended_duration_min": 30.
- Si sí mencionó (ej: "1 hora", "60 minutos"), pon ambos en 60.

RUTINA:
- Cada item es un día con este estilo:
  {
    "day": "Lunes",
    "type": "Pierna y glúteo",
    "duration": 45,
    "exercises": [
      { "name": "Sentadillas", "sets": 4, "reps": "10-12" }
    ]
  }

HÁBITOS:
- Si pide hábitos: devuélvelos en "habits" como { "title": "...", "desc": "..." }.
- Si no, "habits": [].

SI HAY ALGO GRAVE:
- assistant_message: sugiere hablar con adulto/profesional.
- routine: []
- habits: []
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

    const userMsg = messages[messages.length - 1]?.content || "";
    const systemPrompt = buildSystemPrompt(profile || {});

    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
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
        metadata: {
          requested_duration_min: null,
          recommended_duration_min: 30,
        },
      };
    }

    // detectar intención del usuario
    const lowerUser = userMsg.toLowerCase();
    const userWantsRoutine =
      lowerUser.includes("rutina") ||
      lowerUser.includes("entreno") ||
      lowerUser.includes("entrenamiento") ||
      lowerUser.includes("pierna") ||
      lowerUser.includes("pecho") ||
      lowerUser.includes("espalda") ||
      (Array.isArray(parsed.routine) && parsed.routine.length > 0);

    const userWantsHabits =
      lowerUser.includes("hábito") ||
      lowerUser.includes("habito") ||
      lowerUser.includes("hábitos") ||
      lowerUser.includes("habitos") ||
      (Array.isArray(parsed.habits) && parsed.habits.length > 0);

    // --- NORMALIZAR RUTINA DE LA IA ---
    let aiRoutine = Array.isArray(parsed.routine) ? parsed.routine : [];

    // si el modelo se puso raro y no mandó rutina pero el usuario pidió, creamos fallback
    if (userWantsRoutine && aiRoutine.length === 0) {
      aiRoutine = buildFallbackRoutine(userMsg, profile || {});
    }

    // normalizamos lo que sí vino
    const normalizedRoutine = aiRoutine.map((dayObj, idx) => {
      const safeDay = dayObj.day || WEEK_DAYS[idx] || `Día ${idx + 1}`;
      const safeType = dayObj.type || "Entrenamiento";
      const exercises = Array.isArray(dayObj.exercises) ? dayObj.exercises : [];
      const normEx = exercises.map((ex) => {
        if (typeof ex === "string") {
          // quitar numeraciones tipo "1. Sentadillas"
          const clean = ex.replace(/^\d+\.\s*/, "");
          return { name: clean };
        }
        return {
          name: typeof ex.name === "string" ? ex.name.replace(/^\d+\.\s*/, "") : "Ejercicio",
          sets: ex.sets || ex.series || null,
          reps: ex.reps || ex.repetitions || null,
          time: ex.time || null,
        };
      });
      return {
        day: safeDay,
        type: safeType,
        duration:
          dayObj.duration ||
          parsed?.metadata?.requested_duration_min ||
          parsed?.metadata?.recommended_duration_min ||
          null,
        exercises: normEx,
      };
    });

    // --- COMPLETAR A 7 DÍAS ---
    const routineByDay = {};
    normalizedRoutine.forEach((d) => {
      if (d.day) routineByDay[d.day] = d;
    });

    const fullWeekRoutine = WEEK_DAYS.map((dayName, idx) => {
      if (routineByDay[dayName]) return routineByDay[dayName];
      // si no vino de la IA, descanso activo
      return {
        day: dayName,
        type: "Descanso activo",
        duration: 15,
        exercises: [
          { name: "Caminar 10 min", time: "10 min" },
          { name: "Estiramientos suaves", time: "5 min" },
        ],
      };
    });

    // --- HÁBITOS ---
    const habitsArray = Array.isArray(parsed.habits) ? parsed.habits : [];
    const normalizedHabits = habitsArray.map((h) => ({
      title: h.title || h.name || "Hábito",
      desc: h.desc || h.description || "",
    }));

    const meta = parsed.metadata || {};
    const requestedDuration =
      typeof meta.requested_duration_min === "number" ? meta.requested_duration_min : null;
    const recommendedDuration =
      typeof meta.recommended_duration_min === "number" ? meta.recommended_duration_min : 30;

    res.json({
      reply: parsed.assistant_message || "Listo 👍",
      routine: userWantsRoutine ? fullWeekRoutine : [],
      habits: userWantsHabits ? normalizedHabits : [],
      metadata: {
        requested_duration_min: requestedDuration,
        recommended_duration_min: recommendedDuration,
      },
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
