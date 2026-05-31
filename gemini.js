const DEFAULT_MODEL = 'gemini-2.5-flash';

function asText(value) {
  return value == null ? '' : String(value);
}

function mapMessages(messages, prompt) {
  if (Array.isArray(messages) && messages.length) {
    return messages.map((m) => ({
      role: m && m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: asText(m && m.content) }],
    }));
  }

  return [
    {
      role: 'user',
      parts: [{ text: asText(prompt) }],
    },
  ];
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method Not Allowed' } });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: { message: 'Missing GEMINI_API_KEY environment variable.' } });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (error) {
      body = {};
    }
  }

  if (!body || typeof body !== 'object') {
    body = {};
  }

  const model = body.model || DEFAULT_MODEL;
  const options = body.options && typeof body.options === 'object' ? body.options : {};
  const prompt = asText(body.prompt);
  const maxTokens = Number.isFinite(body.maxTokens) ? body.maxTokens : 2000;
  const systemPrompt = asText(options.systemPrompt);
  const responseMimeType = options.responseMimeType || 'text/plain';
  const contents = mapMessages(options.messages, prompt);

  const payload = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.2,
      responseMimeType,
    },
  };

  if (systemPrompt) {
    payload.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  try {
    const upstream = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(model) +
        ':generateContent?key=' +
        encodeURIComponent(apiKey),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const raw = await upstream.text();
    let json;
    try {
      json = raw ? JSON.parse(raw) : {};
    } catch (error) {
      json = { raw };
    }

    res.status(upstream.status).json(json);
  } catch (error) {
    res.status(500).json({
      error: {
        message: error && error.message ? error.message : 'Gemini proxy error.',
      },
    });
  }
};
