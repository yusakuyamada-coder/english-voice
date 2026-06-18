export const maxDuration = 30

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, voiceId } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const VOICES = {
    female: 'EXAVITQu4vr4xnSDxMaL', // Sarah
    male:   'TxGEqnHWrfWFTfGW9XjX',  // Josh
  };

  const voice = VOICES[voiceId] || VOICES.female;

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      console.error('ElevenLabs error:', error);
      return res.status(500).json({ error: error.detail?.message || 'TTS failed' });
    }

    const audioBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS handler error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
