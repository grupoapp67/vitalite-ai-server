// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;

// permite que tu app web le pegue (puedes ajustar el origin)
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
Eres "VitaliTrainer", una IA integrada en una app para adolescentes que combina salud física y salud mental.

REGLAS:
- Solo hablas de: ejercicio, rutinas, progresión, hábitos, motivación, autocuidado, manejo básico de estrés/ánimo.
- Si el usuario menciona algo grave (autolesión, suicidio, abuso, TCA), le dices que hable con un adulto o profesional y no das detalles clínicos.
- Responde en español, tono cercano, frases cortas.
- Prioriza que entrene según sus días disponibles y su objetivo.
- Si pregunta "hazme una rutina" devuélvela en forma clara, tipo lista, y si puedes en estructura por días.

PERFIL DEL USUARIO (lo manda la app, úsalo para personalizar):
${JSON.stringify(profile, null, 2)}

Si no hay datos en el perfil, pregunta de forma amable lo que falta (por ejemplo peso, altura o objetivo).
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
      model: "gpt-4o-mini", // cambia si usas otro
      messages: openaiMessages,
      temperature: 0.7,
    });

    const answer = completion.choices[0].message.content;

    res.json({ reply: answer });
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
