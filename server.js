// server.js
const express = require('express');
const cors = require('cors');

const app = express();

// Permitir llamadas desde CodePen (o cualquier origen, ajústalo después)
app.use(cors());
app.use(express.json());

// Ruta de prueba para ver si Render está vivo
app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Vitalite AI server is running ✅' });
});

/**
 * Ruta de la IA
 * El frontend va a hacer POST a https://vitalite-ai-server.onrender.com/api/chat
 *
 * IMPORTANTE:
 * - En Render define la variable de entorno OPENAI_API_KEY
 *   (o cambia esto si usas otra IA)
 */
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  try {
    // Ejemplo usando OpenAI Chat Completions
    // Asegúrate de tener OPENAI_API_KEY en Render
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Para que al menos devuelva algo si olvidaste la key
      return res.json({
        reply: `⚠️ No hay OPENAI_API_KEY configurada en el servidor, pero recibí tu mensaje: "${message}"`
      });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // puedes cambiar el modelo si usas otro
        messages: [
          { role: 'system', content: 'Eres un asistente útil.' },
          { role: 'user', content: message }
        ]
      })
    });

    const data = await response.json();

    // Manejo básico de error de la API
    if (data.error) {
      console.error(data.error);
      return res.status(500).json({ error: data.error.message || 'AI error' });
    }

    const aiMessage = data.choices?.[0]?.message?.content ?? '(sin respuesta)';
    res.json({ reply: aiMessage });
  } catch (err) {
    console.error('Error talking to AI:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Render te da el puerto por env
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on port', PORT);
});
