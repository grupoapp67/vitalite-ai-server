import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ruta de prueba
app.get("/", (req, res) => {
  res.json({ ok: true, msg: "Servidor VitalitePlus funcionando ✅" });
});

// ruta IA
app.post("/ai", async (req, res) => {
  const { message = "", userData = {}, history = [] } = req.body || {};

  // datos del usuario
  const name = userData.name || "amigo/a";
  const goal = userData.goal || "mantener";
  const trainingDays = userData.trainingDays || 3;

  // respuesta “inteligente” simple
  let text = "";

  const msg = message.toLowerCase();

  if (msg.includes("generar") || msg.includes("rutina")) {
    // devolvemos también la rutina para que tu CodePen la guarde
    const days = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
    const baseByGoal = {
      bajar: ["Cardio 30 min", "Abdominales 3x15", "Sentadillas 3x15"],
      masa: ["Press banca 4x10", "Remo 4x10", "Peso muerto 3x8"],
      mantener: ["Caminata 20 min", "Plancha 3x30s", "Estiramientos 10 min"],
      resistencia: ["Correr 30-40 min", "Burpees 3x12", "Core 3x15"]
    };
    const base = baseByGoal[goal] || baseByGoal["mantener"];

    const routine = days.map((day, i) => ({
      day,
      routine: i < trainingDays ? base.join(", ") : "Descanso 💤"
    }));

    text = `Listo ${name}, te armé una rutina para tu objetivo "${goal}" con ${trainingDays} días. La puedes ver en la pantalla de rutina.`;
    return res.json({ text, routine });
  }

  // respuestas genéricas
  if (msg.includes("hola") || msg.includes("hey")) {
    text = `Hola ${name} 👋 ¿quieres que te arme una rutina o que te analice tu estado?`;
  } else if (msg.includes("estado") || msg.includes("resumen")) {
    text = `Tu objetivo actual es "${goal}" y pusiste ${trainingDays} días de entrenamiento. Si quieres puedo ajustar los días o hacerla más liviana.`;
  } else {
    text = `Recibí tu mensaje: "${message}". Puedes decirme "generar rutina" y la mando a la app.`;
  }

  return res.json({ text });
});

// start
app.listen(PORT, () => {
  console.log(`✅ Server escuchando en puerto ${PORT}`);
});
