export const maxDuration = 60

export default async function handler(req, res) {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { base64Audio, prompt } = req.body;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: "audio/webm", data: base64Audio } },
          { text: prompt }
        ]}]
      })
    });

    const data = await response.json();

    if (!data.candidates || !data.candidates[0]) {
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(500).json({ error: 'AIの応答がありませんでした', detail: data });
    }

    res.status(200).json(data);
  } catch (error) {
    console.error('Handler error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
