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

/**
 * Prompt del sistema
 * - español
 * - app de adolescentes
 * - solo temas: entrenamiento, hábitos, motivación, bienestar emocional/coping
 * - si no hay duración => pedirla y sugerir una
 * - devolver siempre JSON con assistant_message, routine, habits, metadata
 */
function buildSystemPrompt(profile) {
  return `
Eres "VitaliTrainer", una IA que vive dentro de una app de salud física + mental para ADOLESCENTES (13-19).

TONO:
- Siempre en español.
- Breve, amable, cero brusca.
- Puedes responder como mini-psicólogo de apoyo (validar emoción, sugerir algo simple), pero sin hacer diagnósticos.
- NO respondas sobre temas fuera de: entrenamiento, actividad física, rutinas, hábitos diarios, motivación, manejo básico de estrés/ánimo.
- Si el usuario cambia de tema (primero hábitos y luego rutina) RESPONDE SOLO a lo último, NO te quedes pegada en lo anterior.

DATOS DEL USUARIO (úsalos para adaptar volumen, días, lenguaje):
${JSON.stringify(profile || {}, null, 2)}

TU FORMATO DE RESPUESTA (SIEMPRE JSON):
{
  "assistant_message": "texto para mostrar en el chat",
  "routine": [ ... ],
  "habits": [ ... ],
  "metadata": {
    "requested_duration_min": number | null,
    "recommended_duration_min": number | null
  }
}

REGLAS DE DURACIÓN:
- Si el usuario NO dijo cuánto tiempo quiere entrenar, en "assistant_message" PREGUNTA algo como: "¿cuánto tiempo quieres entrenar hoy? 20, 30 o 45 min?".
- En "metadata.recommended_duration_min" pon un número recomendado (por ejemplo 30).
- Si el usuario SÍ dijo "1 hora" o "60 minutos", entonces "requested_duration_min": 60 y "recommended_duration_min": 60.
- Usa la duración para ajustar el número de ejercicios.

REGLAS PARA "routine":
- Si el usuario pidió una rutina (por ejemplo "hazme una rutina de pierna 3 días"), entonces "routine" debe traer esos días con ejercicios detallados.
- Cada elemento de la rutina es UN día:
  {
    "day": "Lunes",
    "type": "Pierna y glúteo",
    "exercises": [
      { "name": "Sentadillas", "sets": 4, "reps": "10-12" },
      { "name": "Zancadas alternadas", "sets": 3, "reps": "12/12" },
      { "name": "Puente de glúteo", "sets": 3, "reps": "15" }
    ]
  }
- Si NO pidió rutina, "routine": [].

REGLAS PARA "habits":
- Si el usuario pide hábitos ("créame hábitos", "hábitos para estudiar", "hábitos de sueño"), devuelve un array así:
  "habits": [
    { "title": "Tomar agua al despertar", "desc": "Activas tu cuerpo." },
    { "title": "Respirar 1 min", "desc": "Baja estrés rápido." }
  ]
- Si NO pidió hábitos, "habits": [].

SEGURIDAD:
- Si menciona algo grave (autolesión, suicidio, abuso, TCA) responde en "assistant_message" que hable con un adulto o profesional y pon "routine": [] y "habits": [].
`.trim();
}

// raíz
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Vitali AI server running" });
});

app.post("/chat", async (req, res) => {
  try {
    const { messages, profile } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages debe ser un array" });
    }

    const systemPrompt = buildSystemPrompt(profile || {});

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
      // si vino texto suelto, lo encapsulamos
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

    // --------- NORMALIZACIÓN ---------
    const userMsg = messages[messages.length - 1]?.content?.toLowerCase() || "";
    const userWantsRoutine =
      Array.isArray(parsed.routine) && parsed.routine.length > 0 ||
      userMsg.includes("rutina") ||
      userMsg.includes("entreno") ||
      userMsg.includes("pierna") ||
      userMsg.includes("pecho") ||
      userMsg.includes("espalda");

    const userWantsHabits =
      Array.isArray(parsed.habits) && parsed.habits.length > 0 ||
      userMsg.includes("hábito") ||
      userMsg.includes("habitos") ||
      userMsg.includes("hábitos");

    // rutina original de la IA
    const aiRoutine = Array.isArray(parsed.routine) ? parsed.routine : [];

    // normalizar ejercicios
    const normalizedRoutine = aiRoutine.map((dayObj, idx) => {
      const fallbackDays = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
      const safeDay = dayObj.day || fallbackDays[idx] || "Día";
      const safeType = dayObj.type || "Entrenamiento";
      const exs = Array.isArray(dayObj.exercises) ? dayObj.exercises : [];
      const normalizedExs = exs.map((ex) => {
        if (typeof ex === "string") {
          return { name: ex };
        }
        return {
          name: ex.name || "Ejercicio",
          sets: ex.sets || ex.series || null,
          reps: ex.reps || ex.repetitions || null,
          time: ex.time || null,
        };
      });
      return {
        day: safeDay,
        type: safeType,
        duration: dayObj.duration || parsed?.metadata?.requested_duration_min || parsed?.metadata?.recommended_duration_min || null,
        exercises: normalizedExs,
      };
    });

    // --------- COMPLETAR SEMANA ---------
    const WEEK_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

    // si la IA no puso day en alguno, ya pusimos uno arriba por índice
    const routineByDay = {};
    normalizedRoutine.forEach((d) => {
      if (d.day) routineByDay[d.day] = d;
    });

    // armamos los 7 días
    const fullWeekRoutine = WEEK_DAYS.map((dayName) => {
      if (routineByDay[dayName]) {
        return routineByDay[dayName];
      }
      // día que la IA NO mandó -> lo completamos como descanso activo
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

    // --------- HÁBITOS ---------
    const habitsArray = Array.isArray(parsed.habits) ? parsed.habits : [];
    // los normalizamos un poco
    const normalizedHabits = habitsArray.map((h) => ({
      title: h.title || h.name || "Hábito",
      desc: h.desc || h.description || "",
    }));

    // --------- METADATA ---------
    const meta = parsed.metadata || {};
    const requestedDuration = typeof meta.requested_duration_min === "number" ? meta.requested_duration_min : null;
    const recommendedDuration =
      typeof meta.recommended_duration_min === "number"
        ? meta.recommended_duration_min
        : 30; // por defecto recomendamos 30

    // respuesta final al front
    res.json({
      reply: parsed.assistant_message || "Listo 👍",
      // solo mandamos rutina si realmente la pidió o la IA la generó
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
