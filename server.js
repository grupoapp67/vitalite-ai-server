import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import OpenAI from "openai";

const app = express();

// Permitir CodePen (editor y full-page)
app.use(cors({ origin: ["https://codepen.io", "https://cdpn.io"] }));
app.use(express.json({ limit: "1mb" }));
app.use("/ai", rateLimit({ windowMs: 60_000, max: 30 }));

// Ping simple para probar en el navegador
app.get("/", (_req, res) => res.send("Vitalite AI server ✅"));

const openai = new OpenAI({
