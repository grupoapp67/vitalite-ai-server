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

// ------------------------------------------------------------------
// PROMPT DEL SISTEMA
// ------------------------------------------------------------------
function buildSystemPrompt(profile) {
  return `
Eres "VitaliTrainer", una IA que vive dentro de una app de salud física y mental para adolescentes.

TU COMPORTAMIENTO:
- Responde SIEMPRE en español.
- Sé breve y motivadora.
- SOLO hablas de ejercicio, rutinas, hábitos, motivación y manejo básico de estrés/ánimo.
- NO digas "no tengo acceso a la app" ni "copia y pega". La app usará tu JSON.
- La rutina SIEMPRE debe salir de los datos del usuario y de lo que pida, NO de un ejemplo fijo.

DATOS DEL USUARIO (úsalos para personalizar SIEMPRE):
${JSON.stringify(profile, null, 2)}

FORMATO DE RESPUESTA (OBLIGATORIO SIEMPRE):
Devuelve SIEMPRE un JSON así:

{
  "assistant_message": "texto para el adolescente",
  "routine": [],
  "habits": []
}

DESCRIPCIÓN DE CAMPOS:

1) "assistant_message":
- Texto corto que ve el usuario en el chat.
- Máximo 2-3 frases.
- Tono motivador y claro.

2) "routine":
- Array de días de entrenamiento.
- Cada elemento:
  {
    "day": "Lunes",
    "type": "Fuerza tren superior",
    "duration": "25 min",
    "exercises": [
      { "name": "Flexiones", "sets": 3, "reps": "10-12" },
      { "name": "Remo con mochila", "sets": 3, "reps": "12-15" }
    ]
  }

3) "habits":
- Array de hábitos para que la app los agregue directo.
- Cada hábito:
  {
    "title": "Tomar agua al despertar",
    "desc": "Un vaso para activar el cuerpo"
  }

REGLA DE DURACIÓN (NUEVA Y MUY IMPORTANTE):
- Muchas veces el usuario dice "hazme una rutina" pero NO dice el tiempo.
- En ese caso debes hacer DOS cosas:
  1. En "assistant_message" le preguntas: 
     "¿Cuánto tiempo quieres entrenar? por ejemplo 15, 20 o 30 minutos. Por tu objetivo te recomiendo X min 🙂"
     Donde X lo calculas así:
       - objetivo "bajar" o "resistencia": 25-30 min
       - objetivo "masa": 25-30 min con fuerza
       - si su estrés/ánimo viene alto: sugiere 20 min
  2. PERO AUN ASÍ debes generar la rutina en "routine" usando ese tiempo recomendado. 
     O sea: NO dejes "routine": [] solo porque no dijo el tiempo.
     La app necesita que mandes la rutina siempre que pida una rutina.

- Si en el mensaje del usuario ya viene un tiempo claro ("hazme una rutina de 20 minutos", "quiero 15 min"), usa ese tiempo exacto en "duration" de cada día.

REGLA DE NÚMERO DE DÍAS:
- Si el perfil trae "trainingDays", úsalo como cantidad de días de la semana.
- Si no lo trae, usa 3 días.
- Los días pueden ser "Lunes", "Miércoles", "Viernes" o similares.
- Adapta el tipo al objetivo.

REGLA DE HÁBITOS:
- Si el usuario dice algo como "créame hábitos", "dame hábitos diarios", "hábitos para ordenarme", ENTONCES:
  - Llena "habits" con 2 a 5 objetos.
  - NO pongas textos tipo "dime qué hábito quieres".
  - Deben ser concretos, por ejemplo:
    [
      { "title": "Haz tu cama", "desc": "Empieza el día con orden." },
      { "title": "Respira 1 min", "desc": "Para bajar la tensión." }
    ]
- Si el usuario NO pidió hábitos, deja "habits": [].

SEGURIDAD:
- Si el usuario menciona algo grave (autolesión, suicidio, abuso, TCA) responde en "assistant_message" que hable con un adulto o profesional y pon:
  "routine": []
  "habits": []

RECORDATORIO:
- Siempre devolver un JSON válido, sin texto afuera.
  `.trim();
}

// ------------------------------------------------------------------
// RUTAS
// ------------------------------------------------------------------
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
      // fallback por si algo raro
      parsed = {
        assistant_message: raw,
        routine: [],
        habits: [],
      };
    }

    // normalizamos
    if (!Array.isArray(parsed.routine)) parsed.routine = [];
    if (!Array.isArray(parsed.habits)) parsed.habits = [];

    res.json({
      reply: parsed.assistant_message,
      routine: parsed.routine,
      habits: parsed.habits,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Error generando respuesta",
      details: err.message,
    });
  }
});

// ------------------------------------------------------------------
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
