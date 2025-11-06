// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || ""; // por si luego quieres usar IA real

app.use(cors());
app.use(express.json());

// --------------------
// 1. utilidades de rutina
// --------------------
function shuffle(arr) {
  return arr
    .map((x) => ({ x, r: Math.random() }))
    .sort((a, b) => a.r - b.r)
    .map((o) => o.x);
}

function buildFunctionalRoutine(userData = {}) {
  const goal = (userData.goal || "mantener").toLowerCase();
  const trainingDays = Number(userData.trainingDays || 3);
  const daysNames = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

  // bancos de ejercicios
  const strengthUpper = [
    "Press banca 4x8-10",
    "Remo con mancuernas 4x10",
    "Press militar 3x10",
    "Curl bíceps 3x12",
    "Fondos en banca 3x12",
    "Aperturas con mancuernas 3x12"
  ];
  const strengthLower = [
    "Sentadillas 4x10",
    "Peso muerto rumano 4x10",
    "Zancadas caminando 3x12 c/p",
    "Puente de glúteo 3x15",
    "Elevación de gemelos 3x15"
  ];
  const coreMobility = [
    "Plancha 3x30s",
    "Plancha lateral 3x20s c/lado",
    "Bird-dog 3x12",
    "Dead bug 3x12",
    "Estiramientos 10 min"
  ];
  const cardioFatLoss = [
    "Cardio moderado 25-30 min",
    "HIIT 15-20 min (30s ON / 30s OFF)",
    "Caminata rápida 35 min",
    "Elíptica 25 min"
  ];

  let routinePerDay = [];

  if (goal === "masa") {
    // típico: push / pull / legs / full
    const templates = [
      ["Pecho y hombro", ...shuffle(strengthUpper).slice(0, 3), "Core ligero 5 min"],
      ["Espalda y brazos", ...shuffle(strengthUpper).slice(0, 3), "Core ligero 5 min"],
      ["Piernas", ...shuffle(strengthLower).slice(0, 4)],
      ["Full body", ...shuffle(strengthUpper).slice(0, 2), ...shuffle(strengthLower).slice(0, 2)]
    ];
    for (let i = 0; i < 7; i++) {
      if (i < trainingDays) {
        const t = templates[i % templates.length];
        routinePerDay.push({
          day: daysNames[i],
          routine: t.join(", ")
        });
      } else {
        routinePerDay.push({ day: daysNames[i], routine: "Descanso 💤" });
      }
    }
  } else if (goal === "bajar") {
    // alternar cardio + fuerza ligera
    for (let i = 0; i < 7; i++) {
      if (i < trainingDays) {
        if (i % 2 === 0) {
          routinePerDay.push({
            day: daysNames[i],
            routine: shuffle(cardioFatLoss)[0] + ", core 10 min"
          });
        } else {
          routinePerDay.push({
            day: daysNames[i],
            routine: "Fuerza total cuerpo: " + shuffle(strengthUpper).slice(0, 2).concat(shuffle(strengthLower).slice(0, 1)).join(", ")
          });
        }
      } else {
        routinePerDay.push({ day: daysNames[i], routine: "Descanso 💤" });
      }
    }
  } else if (goal === "resistencia") {
    for (let i = 0; i < 7; i++) {
      if (i < trainingDays) {
        routinePerDay.push({
          day: daysNames[i],
          routine: shuffle(cardioFatLoss)[0] + ", " + shuffle(coreMobility)[0]
        });
      } else {
        routinePerDay.push({ day: daysNames[i], routine: "Descanso 💤" });
      }
    }
  } else {
    // mantener
    for (let i = 0; i < 7; i++) {
      if (i < trainingDays) {
        routinePerDay.push({
          day: daysNames[i],
          routine: [
            ...shuffle(strengthUpper).slice(0, 1),
            ...shuffle(strengthLower).slice(0, 1),
            ...shuffle(coreMobility).slice(0, 1)
          ].join(", ")
        });
      } else {
        routinePerDay.push({ day: daysNames[i], routine: "Descanso 💤" });
      }
    }
  }

  return routinePerDay;
}

// --------------------
// 2. rutas
// --------------------
app.get("/", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/chat", async (req, res) => {
  const { message = "", userData = {}, history = [] } = req.body || {};
  const lower = message.toLowerCase();

  // si pide rutina → la generamos nosotros (sin IA) y la mandamos
  if (lower.includes("rutina") || lower.includes("entrenar") || lower.includes("generar")) {
    const routine = buildFunctionalRoutine(userData);
    return res.json({
      reply: `Listo ${userData.name || ""}, te armé una rutina de ${userData.trainingDays || 3} días usando tu objetivo (${userData.goal || "mantener"}). Si quieres cambiar días u objetivo, dímelo.`,
      routine
    });
  }

  // si NO pidió rutina → respondemos corto
  return res.json({
    reply: "Dime tu objetivo (bajar, masa, mantener, resistencia) y cuántos días vas a entrenar, y te la armo."
  });
});

app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
