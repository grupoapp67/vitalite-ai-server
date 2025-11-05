const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

app.use(cors());
app.use(express.json());

// healthcheck
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Vitalite AI server is running ✅" });
});

// ⬇️ 1) función de contexto, ahora con altura y peso
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
Datos del usuario:
- Nombre: ${name}
- Objetivo: ${goal}
- Días de entrenamiento: ${trainingDays}
- Altura: ${height}
- Peso: ${weight}
- Ánimo: ${mood}
- Estrés: ${stress}
- Sueño: ${sleep}
Usa estos datos en tus respuestas. Responde en español y de forma cercana.
  `.trim();
}

// utilidad para crear una rutina si la pide
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

// ⬇️ 2) endpoint principal
app.post("/api/chat", async (req, res) => {
  const { message, userData = {}, history = [] } = req.body || {};

  // LOG para ver qué está llegando
  console.log("---- /api/chat ----");
  console.log("message:", message);
  console.log("userData:", userData);
  console.log("history length:", Array.isArray(history) ? history.length : 0);

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  const askedRoutine = /(?:\brutina\b|\bentrenar\b|\bworkout\b|\bgenerar rutina\b)/i.test(message);

  // armamos los mensajes para el modelo
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
    // si no hay key, devolvemos igual usando los datos
    if (!OPENAI_API_KEY) {
      const baseReply = `Recibí tus datos 👌 Objetivo: ${userData.goal || "no indicado"}, días: ${userData.trainingDays || "no indicado"}, altura: ${userData.height || "no indicada"} cm, peso: ${userData.weight || "no indicado"} kg.`;
      return res.json({
        reply: baseReply,
        ...(askedRoutine ? { routine: buildRoutine(userData) } : {})
      });
    }

    // llamada a OpenAI
    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
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

    const data = await openaiRes.json();

    if (data.error) {
      console.error("OpenAI error:", data.error);
      return res.status(500).json({ error: data.error.message || "AI error" });
    }

    let aiMessage = data.choices?.[0]?.message?.content ?? "(sin respuesta)";

    // ⬇️ 3) Forzamos a que la respuesta incluya lo que nos mandó el front
    const prefix = `Datos que tengo tuyos: objetivo=${userData.goal || "no indicado"}, días=${userData.trainingDays || "no indicado"}, altura=${userData.height || "no indicada"}, peso=${userData.weight || "no indicado"}.\n\n`;
    aiMessage = prefix + aiMessage;

    return res.json({
      reply: aiMessage,
      ...(askedRoutine ? { routine: buildRoutine(userData) } : {})
    });

  } catch (err) {
    console.error("Error talking to AI:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
