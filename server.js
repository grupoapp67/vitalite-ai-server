// server.js (CommonJS, Node 18+)
const express = require("express");
const cors = require("cors");

// --- Config ---
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"; // cambia si quieres

const app = express();

// CORS (puedes restringir a tu CodePen si querés)
app.use(cors());
app.use(express.json());

// Healthcheck
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Vitalite AI server is running ✅" });
});

// Util: generar rutina según goal + trainingDays
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

// Util: armar mensaje de sistema con la encuesta
function makeSystemContext(userData = {}) {
  const name = userData.name || "usuario";
  const goal = userData.goal || "mantener";
  const trainingDays = userData.trainingDays || 3;
  const height = userData.height || "no indicada";
  const weight = userData.weight || "no indicado";
  const mood = userData.mood || "Regular";
  const stress = userData.stress || "Algunas veces";
  const sleep = userData.sleep || "A veces";

  return `
Eres el coach de la app VitalitePlus.
Responde SIEMPRE en español y sé breve (máximo 4 líneas). Si das pasos o recomendaciones, usa viñetas cortas.
Datos del usuario:
- Nombre: ${name}
- Objetivo: ${goal}
- Días de entrenamiento: ${trainingDays}
- Altura: ${height}
- Peso: ${weight}
- Ánimo: ${mood}
- Estrés: ${stress}
- Sueño: ${sleep}
Si el usuario pide la rutina, puedes decirle que ya se la envío la app.
  `.trim();
}

// POST /api/chat: recibe { message, userData, history }
app.post("/api/chat", async (req, res) => {
  const { message, userData = {}, history = [] } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  // armar conversación para el modelo
  const messages = [];

  // 1) sistema con el contexto de la encuesta
  messages.push({ role: "system", content: makeSystemContext(userData) });

  // 2) historial (solo user/assistant)
  if (Array.isArray(history)) {
    history.slice(-20).forEach((m) => {
      if (m && (m.role === "user" || m.role === "assistant") && m.content) {
        messages.push({ role: m.role, content: m.content });
      }
    });
  }

  // 3) último mensaje del usuario
  messages.push({ role: "user", content: message });

  // ¿Pidió rutina?
  const askedRoutine = /(?:\brutina\b|\bentrenar\b|\bworkout\b|\bgenerar rutina\b)/i.test(message);

  try {
    // Si no hay API key, devolvemos un fallback útil (pero sin llamar a OpenAI)
    if (!OPENAI_API_KEY) {
      const reply =
        `⚠️ Falta OPENAI_API_KEY en el servidor.\n` +
        `Recibí tu mensaje y tus datos: objetivo "${userData.goal || "mantener"}", ` +
        `${userData.trainingDays || 3} días/semana.`;
      const routine = askedRoutine ? buildRoutine(userData) : null;
      return res.json({ reply, routine });
    }

    // Llamado a OpenAI REST (Node 18 ya trae fetch global)
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

    const aiMessage = data.choices?.[0]?.message?.content ?? "(sin respuesta)";
    const payload = { reply: aiMessage };

    // si pidió rutina, la mandamos también
    if (askedRoutine) {
      payload.routine = buildRoutine(userData);
    }

    return res.json(payload);
  } catch (err) {
    console.error("Error talking to AI:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Start
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
