export const maxDuration = 30

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, voiceId, speed } = req.body;
  if (!text) return res.status(400).json({ error: 'text is required' });

  const VOICES = {
    female: 'EXAVITQu4vr4xnSDxMaL', // Sarah
    male:   'TxGEqnHWrfWFTfGW9XjX',  // Josh
  };

  const voice = VOICES[voiceId] || VOICES.female;
  const playbackSpeed = Math.min(Math.max(Number(speed) || 1.0, 0.5), 1.5); // 0.5〜1.5の範囲に制限

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
            speed: playbackSpeed,
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
    res.setHeader('Cache-Control', 'no-cache'); // スピードが変わるのでキャッシュ無効
    res.send(Buffer.from(audioBuffer));

  } catch (error) {
    console.error('TTS handler error:', error.message);
    res.status(500).json({ error: error.message });
  }
}
