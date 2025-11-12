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
Devuelve SIEMPRE un JSON con esta forma, aunque el usuario solo te salude o pida otra cosa:

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
- Si el usuario NO pidió rutina, entonces "routine": [].

3) "habits":
- Array de hábitos para que la app los agregue directo, SIN pedirle al usuario que los copie.
- Cada hábito:
  {
    "title": "Tomar agua al despertar",
    "desc": "Un vaso para activar el cuerpo"
  }
- Si el usuario NO pidió hábitos, deja "habits": [].

REGLA NUEVA IMPORTANTE (DURACIÓN):
- Si el usuario pide una rutina / entreno / "armame una rutina" PERO NO dijo cuánto tiempo quiere entrenar (15, 20, 25, 30 min), ENTONCES:
  - NO generes la rutina todavía.
  - Pon "routine": []
  - En "assistant_message" pregúntale CLARAMENTE: 
    "¿Cuánto tiempo quieres entrenar? por ejemplo 15, 20 o 30 minutos. Para tu caso te recomiendo X min."
  - Donde "X" es un tiempo recomendado que tú calculas así:
    - Si objetivo es "bajar" o "resistencia": 25-30 min
    - Si objetivo es "masa": 25-30 min pero con fuerza
    - Si el perfil dice estrés/algo alto: sugiere 20 min
  - EJEMPLO de assistant_message correcto:
    "¿Cuánto tiempo quieres entrenar? por ejemplo 15, 20 o 30 minutos. Por tu objetivo te recomiendo 25 min 🙂"
- SOLO cuando el usuario ya dijo el tiempo (porque lo escribió en un mensaje anterior) ahí sí devuelves la rutina en "routine".

REGLA DE HÁBITOS:
- Si el usuario dice algo como "créame hábitos", "dame hábitos diarios", "hábitos para ordenarme", ENTONCES:
  - Llena "habits" con 2 a 5 objetos.
  - NO pongas textos tipo "dime qué hábito quieres".
  - Deben ser concretos:
    [
      { "title": "Haz tu cama", "desc": "Empieza el día con orden." },
      { "title": "Respira 1 min", "desc": "Para bajar la tensión." }
    ]

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
      // importantísimo: forzamos JSON
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // fallback por si el modelo se sale
      parsed = {
        assistant_message: raw,
        routine: [],
        habits: [],
      };
    }

    // normalizamos por si el modelo no mandó alguna clave
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
