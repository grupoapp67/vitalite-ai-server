const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json());

// ===============================
// AYUDA: generar rutina variada
// ===============================
function buildRoutineFromUser(user = {}) {
  const daysOfWeek = [
    "Lunes",
    "Martes",
    "Miércoles",
    "Jueves",
    "Viernes",
    "Sábado",
    "Domingo",
  ];

  const goal = (user.goal || "mantener").toLowerCase();
  const trainingDays = Number(user.trainingDays || 3);

  // por si viene estrés alto
  const stressed =
    typeof user.stress === "string" &&
    /frecuente|siempre/i.test(user.stress || "");

  function workoutFor(goal, dayIndex) {
    // según objetivo devolvemos bloques diferentes
    if (goal === "bajar") {
      const plans = [
        "Calentamiento 5-8 min, Cardio moderado 30 min, Core 3x20, Estiramientos 5 min",
        "HIIT 15-20 min (30s on / 30s off), Sentadillas 3x15, Plancha 3x30s",
        "Fuerza tren superior (flexiones 4x10, remo 3x12), Caminata 15 min",
        "Cardio largo 35-40 min (bici o elíptica), Abd 3x20",
        "Circuito quema grasa 4 vueltas (jumping jacks, zancadas, plancha)",
      ];
      const picked = plans[dayIndex % plans.length];
      return stressed ? picked + ", + 5 min respiración" : picked;
    }

    if (goal === "masa") {
      // dividimos por grupos musculares
      const plans = [
        "Pecho + tríceps: Calentamiento, Flexiones 4x12, Fondos 3x10, Press hombro 3x12, Abd 3x15",
        "Espalda + bíceps: Dominadas o remo 4x10-12, Curl bíceps 3x12, Peso muerto rumano 3x12",
        "Pierna + glúteo: Sentadilla 4x10-12, Zancadas 3x12 c/pierna, Puente de glúteo 3x15",
        "Hombro + core: Press militar 4x10, Elevaciones laterales 3x15, Plancha 3x40s",
      ];
      const picked = plans[dayIndex % plans.length];
      return stressed ? picked + ", + estiramientos 5 min" : picked;
    }

    if (goal === "resistencia") {
      const plans = [
        "Calentamiento 8 min, Carrera continua 25-30 min, Estiramientos 5 min",
        "HIIT carrera 15-20 min, Core 3x30s",
        "Subidas o cuestas 20 min, Pierna 3x15 (sentadilla, zancada)",
        "Bici 35 min ritmo medio, Movilidad 5 min",
      ];
      const picked = plans[dayIndex % plans.length];
      return stressed ? picked + ", + respiración 4-5 min" : picked;
    }

    // mantener
    const plans = [
      "Full body 25 min (flexiones 3x12, sentadillas 3x15, remo 3x12), Caminata 10 min",
      "Cardio suave 20-25 min, Core 3x20, Estiramientos 5 min",
      "Mix movilidad 15 min + fuerza ligera (bandas) 15 min",
    ];
    const picked = plans[dayIndex % plans.length];
    return stressed ? picked + ", + respiración 5 min" : picked;
  }

  // armamos los 7 días
  const schedule = daysOfWeek.map((day, idx) => {
    if (idx < trainingDays) {
      return {
        day,
        routine: workoutFor(goal, idx),
        completed: false,
      };
    } else {
      return {
        day,
        routine: "Descanso activo: caminar 15-20 min + estirar 5 min",
        completed: false,
      };
    }
  });

  return schedule;
}

// ===============================
// RUTAS
// ===============================
app.get("/", (req, res) => {
  res.send("✅ Vitalite AI server está vivo");
});

app.post("/api/chat", (req, res) => {
  const { message = "", userData = {}, history = [] } = req.body || {};

  console.log("📩 mensaje:", message);
  console.log("🧍 userData:", userData);

  const msg = message.toString().trim().toLowerCase();

  // --------------------------
  // 1) si dice "rutina" → le damos rutina ya
  // --------------------------
  if (/rutina|plan|entren/.test(msg)) {
    const routine = buildRoutineFromUser(userData);
    return res.json({
      reply: "Listo, te armé una rutina por días 💪. La puedes ver en la sección de 'Tu Rutina'.",
      routine,
    });
  }

  // --------------------------
  // 2) si dice un objetivo → también le damos rutina
  // --------------------------
  if (/bajar/.test(msg)) {
    const routine = buildRoutineFromUser({ ...userData, goal: "bajar" });
    return res.json({
      reply: "Objetivo: bajar de peso. Te dejo una rutina variada para varios días 👇",
      routine,
    });
  }
  if (/masa|múscul|muscul/.test(msg)) {
    const routine = buildRoutineFromUser({ ...userData, goal: "masa" });
    return res.json({
      reply: "Objetivo: ganar masa muscular 💪. Te puse días de pecho, espalda y pierna.",
      routine,
    });
  }
  if (/mantener/.test(msg)) {
    const routine = buildRoutineFromUser({ ...userData, goal: "mantener" });
    return res.json({
      reply: "Objetivo: mantenerte. Te dejo un plan con full body y cardio suave.",
      routine,
    });
  }
  if (/resisten/.test(msg)) {
    const routine = buildRoutineFromUser({ ...userData, goal: "resistencia" });
    return res.json({
      reply: "Objetivo: resistencia 🏃. Mezclé carrera, HIIT y movilidad.",
      routine,
    });
  }

  // --------------------------
  // 3) si respondió solo un número (días) y ya teníamos objetivo
  // --------------------------
  if (/^[1-7]$/.test(msg) && userData.goal) {
    const routine = buildRoutineFromUser({
      ...userData,
      trainingDays: Number(msg),
    });
    return res.json({
      reply: `Perfecto, ${msg} días a la semana. Actualicé tu rutina 👌`,
      routine,
    });
  }

  // --------------------------
  // 4) si ya teníamos datos en userData pero el mensaje no fue claro
  // --------------------------
  if (userData && userData.goal) {
    const routine = buildRoutineFromUser(userData);
    return res.json({
      reply: "Ya tenía tu objetivo, te vuelvo a mandar tu rutina 💪",
      routine,
    });
  }

  // --------------------------
  // 5) último fallback
  // --------------------------
  return res.json({
    reply:
      "Para armarte la rutina dime tu objetivo (bajar, masa, mantener, resistencia) o escribe 'rutina'.",
  });
});

// ===============================
app.listen(PORT, () => {
  console.log("✅ Vitalite AI server escuchando en puerto", PORT);
});
