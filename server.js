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

LO QUE DEBES DEVOLVER:
- Siempre devuelve un JSON con esta forma EXTERNA (esto es una PLANTILLA, NO una rutina fija):

{
  "assistant_message": "texto para el adolescente",
  "routine": [ ... ]
}

REGLAS PARA "routine":
- Si el usuario pidió una rutina, "routine" debe contener una rutina NUEVA generada según:
  - edad / etapa (13-19)
  - objetivo (bajar, masa, mantener, resistencia)
  - días que dijo que entrena
  - estado de ánimo/estrés si viene
- Si NO pidió rutina, "routine": []
- Cada elemento de "routine" representa UN DÍA, por ejemplo:
  {
    "day": "Lunes",
    "type": "Fuerza tren superior",
    "exercises": [
      { "name": "Flexiones", "sets": 3, "reps": "10-12" }
    ]
  }
- Puedes cambiar los días, ejercicios y volúmenes según lo que pida el usuario. NO repitas siempre el mismo contenido del ejemplo.
- Si el usuario luego dice "cámbiala a 4 días" o "hazla más para piernas", genera una NUEVA rutina con esos cambios.

Si el usuario menciona algo grave (autolesión, suicidio, abuso, TCA) responde en "assistant_message" que hable con un adulto o profesional y pon "routine": [].
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
      temperature: 0.6, // un poco de variación
      response_format: { type: "json_object" }
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      parsed = {
        assistant_message: raw,
        routine: []
      };
    }

    res.json({
      reply: parsed.assistant_message,
      routine: parsed.routine || []
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
