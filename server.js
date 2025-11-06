// server.js
const express = require("express");
const cors = require("cors");
const app = express();

// si Render te da PORT:
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// util para construir una rutina decente
function buildRoutineFromUser(user) {
  // user puede venir mezclado: encuestas + chatProfile
  const goal = user.goal || "mantener";
  const trainingDays = Number(user.trainingDays || 3);

  // lista de días
  const days = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

  // bloques según objetivo (un poco más reales)
  const blocks = {
    bajar: [
      "Calentamiento 5-10 min",
      "Cardio moderado 25 min",
      "Core: plancha 3x30s",
      "Estiramientos 5 min"
    ],
    masa: [
      "Calentamiento 5-10 min",
      "Pecho/Espalda: 3 ejercicios 3x10-12",
      "Piernas/Glúteos: sentadilla o zancadas 3x10",
      "Core 3x15",
    ],
    mantener: [
      "Calentamiento 5-10 min",
      "Full body 20-25 min (sentadilla, flexión, remo)",
      "Cardio suave 10 min",
      "Movilidad 5 min"
    ],
    resistencia: [
      "Calentamiento 5-10 min",
      "HIIT 15-20 min (30s on / 30s off)",
      "Core 3x30s",
      "Estiramientos 5-8 min"
    ]
  };

  let base = blocks[goal] || blocks["mantener"];

  // si viene estresado del front, añadimos algo suave
  if (user.stress && /frecuent|siempre/i.test(user.stress)) {
    base = base.concat(["Respiración 5 min"]);
  }

  // armamos el horario: los primeros N días tienen rutina, el resto descanso
  const schedule = days.map((day, i) => {
    if (i < trainingDays) {
      return {
        day,
        routine: base.join(", "),
        completed: false,
      };
    } else {
      return {
        day,
        routine: "Descanso activo (caminar 15-20 min, estirar)",
        completed: false,
      };
    }
  });

  return schedule;
}

// ====================================================
// ENDPOINT PRINCIPAL DEL CHAT
// tu front le pega a: https://vitalite-ai-server.onrender.com/api/chat
// ====================================================
app.post("/api/chat", (req, res) => {
  // lo que manda tu front:
  const { message, userData = {}, history = [] } = req.body || {};

  // seguridad básica
  const userMsg = (message || "").toString().trim().toLowerCase();

  // si NO hay reply en tu server, el front se queda pegado,
  // así que SIEMPRE vamos a mandar reply.
  let reply = "";

  // 1. si el front todavía está “llenando datos” y te dice “bajar”, “masa”, etc,
  // puedes simplemente reconocerlo
  if (/bajar/.test(userMsg)) {
    reply = "Perfecto, objetivo: bajar de peso. ¿Cuántos días quieres entrenar a la semana? (1-7)";
  } else if (/masa|muscul/.test(userMsg)) {
    reply = "Va, objetivo: ganar masa 💪. ¿Cuántos días quieres entrenar a la semana? (1-7)";
  } else if (/mantener/.test(userMsg)) {
    reply = "Ok, mantenerte en forma. ¿Cuántos días quieres entrenar a la semana? (1-7)";
  } else if (/resisten/.test(userMsg)) {
    reply = "Genial, mejorar resistencia. ¿Cuántos días quieres entrenar a la semana? (1-7)";
  }

  // 2. si el mensaje pide explícitamente rutina
  if (!reply && /rutina|plan|entrenar|entreno/.test(userMsg)) {
    const routine = buildRoutineFromUser(userData);
    return res.json({
      reply: "Te armé una rutina basada en lo que me diste. La verás en la app ✅",
      routine
    });
  }

  // 3. si llega algo como “3” (días) pero ya tenemos objetivo, le devolvemos la rutina
  if (!reply && /^[1-7]$/.test(userMsg) && userData.goal) {
    const routine = buildRoutineFromUser({
      ...userData,
      trainingDays: Number(userMsg)
    });
    return res.json({
      reply: `Perfecto, ${userMsg} días. Te dejo la rutina 👇`,
      routine
    });
  }

  // 4. fallback: si ya tenemos datos suficientes en userData,
  // no sigas preguntando, simplemente genera rutina
  if (!reply) {
    const routine = buildRoutineFromUser(userData);
    return res.json({
      reply: "Listo, te dejo una rutina según tus datos 💪",
      routine
    });
  }

  // 5. si llegamos aquí, es porque sí encontramos una respuesta de arriba
  return res.json({
    reply
  });
});

// endpoint de prueba
app.get("/", (req, res) => {
  res.send("Vitalite AI server OK");
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
