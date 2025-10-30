// server.js (mínimo para probar)
import express from "express";
const app = express();

app.get("/", (_req, res) => res.send("OK"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`UP on :${PORT}`));
