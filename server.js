// server.js (CommonJS, Node 18+)
const express = require("express");
const cors = require("cors");

// --- Config ---
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const app = express();

app.use(cors());
app.use(express.json());

// healthcheck
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Vitalite AI server is running ✅" });
});

// ====== helpers ======
function buildRoutine(userData = {}) {
  const goal = userData.goal || "mantener";
  const trainingDays = Number(userData.trainingDays || 3);
  const days = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
  const baseByGoal = {
    bajar: ["Cardio 30 min", "Abdominales 3x20", "Sentadillas 3x15"],
    masa: ["Flexiones 4x12", "Dominadas 3x10", "Peso muerto 3x12"],
    mantener: ["Caminata 20 min", "Plancha 3x30s", "Estiramiento 15 min"],
    resistencia: ["Correr 40 min", "Burpees 3x15", "Planchas 3x1 min"],
  };
  const base = baseByGoal[goal] || ["Caminata 20 min", "Estiramientos suaves"];
  return days.map((d, i) => ({
    day: d,
    routine: i < trainingDays ? base.join(", ") : "Descanso 💤",
  }));
}

// SOLO nombre + reglas
function makeSystemContext(userData = {}) {
  const name = userData.name || "amigo";

  return `
Eres el coach de la app VitalitePlus.
Habla SIEMPRE en español.
Llama al usuario por su nombre: ${name}.
Sé breve: máximo 4 líneas.
Si pide rutina o cambiarla, di que ya se la enviaste a la app.
  `.trim();
}

// ====== endpoint principal ======
app.post("/api/chat", async (req, res) => {
  const { message, userData = {}, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // detectar si pidió rutina
  const askedRoutine = /rutina|entrenar|workout|cambiar rutina|generar rutina/i.test(
    message
  );

  // armar mensajes para el modelo
  const messages = [];
  messages.push({ role: "system", content: makeSystemContext(userData) });

  if (Array.isArray(history)) {
    history.slice(-20).forEach((m) => {
      if (m && (m.role === "user" || m.role === "assistant") && m.content) {
        messages.push({ role: m.role, content: m.content });
      }
    });
  }

  messages.push({ role: "user", content: message });

  try {
    // sin API key → devolvemos algo igual
    if (!OPENAI_API_KEY) {
      const reply = `Hola ${userData.name || "amigo"} 👋. No tengo la OPENAI_API_KEY configurada, pero recibí tu mensaje.`;
      const payload = { reply };
      if (askedRoutine) {
        payload.routine = buildRoutine(userData);
      }
      return res.json(payload);
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error("OpenAI error:", data.error);
      return res.status(500).json({ error: data.error.message || "AI error" });
    }

    const aiMessage =
      data.choices?.[0]?.message?.content ?? "Listo, ya tienes tu respuesta.";

    const payload = { reply: aiMessage };

    // si pidió rutina → la mandamos sí o sí
    if (askedRoutine) {
      payload.routine = buildRoutine(userData);
    }

    return res.json(payload);
  } catch (err) {
    console.error("Error talking to AI:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// start
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
