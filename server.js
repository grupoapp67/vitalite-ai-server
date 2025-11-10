// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// Config
app.use(cors());
app.use(bodyParser.json());

// cliente OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // en Render la pones en Environment
});

// helper: arma el system prompt
function buildSystemPrompt(profile) {
  // profile viene del front: {name, age, height, weight, goals, mentalNotes, ...}
  return `
Eres "VitaliTrainer", una IA para una app de adolescentes que quieren mejorar su físico y cuidar su salud mental.
TU OBJETIVO:
1. Responder solo sobre: ejercicio, rutinas, progresión, motivación, hábitos saludables, manejo básico de emociones/estrés.
2. Si la persona menciona algo serio (autolesiones, ideación suicida, abuso, TCA fuerte), debes decir que hable con un adulto/profesional y no dar instrucciones clínicas.
3. Tus respuestas deben ser cortas, claras y accionables.
4. Adapta TODO al perfil del usuario de abajo.

PERFIL DEL USUARIO (venía del front):
${JSON.stringify(profile, null, 2)}

Cuando pida una rutina, devuelve pasos concretos y, si es posible, en formato estructurado tipo:
- dia: "Lunes"
- objetivo: "fuerza"
- ejercicios: [{nombre, series, reps, descansoSegundos}]

Si el usuario dice que es menor o adolescente, usa tono amigable y motivador.

No hables de política, ni de temas fuera de salud física/mental ligera.
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

    // armamos el hilo para OpenAI
    const openaiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", // pon aquí el modelo que tengas en tu cuenta
      messages: openaiMessages,
      temperature: 0.7,
    });

    const answer = completion.choices[0].message.content;

    res.json({
      reply: answer,
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
