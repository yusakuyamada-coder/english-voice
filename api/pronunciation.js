export const maxDuration = 30

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { base64Audio, referenceText, mimeType } = req.body;
  if (!base64Audio || !referenceText) {
    return res.status(400).json({ error: 'base64Audio and referenceText are required' });
  }

  const key    = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || 'eastus';

  try {
    const audioBuffer = Buffer.from(base64Audio, 'base64');

    const assessmentConfig = {
      ReferenceText: referenceText,
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableMiscue: true,
      EnableProsodyAssessment: true,
    };
    const assessmentConfigBase64 = Buffer.from(JSON.stringify(assessmentConfig)).toString('base64');

    const contentType = (mimeType && mimeType.includes('wav')) ? 'audio/wav'
                      : (mimeType && mimeType.includes('pcm')) ? 'audio/webm;codecs=pcm'
                      : 'audio/webm;codecs=opus';

    const response = await fetch(
      `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=detailed`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': contentType,
          'Pronunciation-Assessment': assessmentConfigBase64,
        },
        body: audioBuffer,
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error('Azure error:', errText);
      return res.status(500).json({ error: 'Azure API error', detail: errText });
    }

    const data = await response.json();

    if (data.RecognitionStatus !== 'Success') {
      return res.status(500).json({ error: `Recognition failed: ${data.RecognitionStatus}`, raw: data });
    }

    const best  = data?.NBest?.[0];
    const pa    = best;   // AccuracyScore等はNBest直下にある
    const words = best?.Words || [];

    if (!pa || pa.PronScore === undefined) {
      return res.status(500).json({ error: 'No pronunciation assessment result', raw: data });
    }

    // 問題のある単語（AccuracyScore < 70 または ErrorType が None 以外）
    const badWords = words
      .filter(w => (w.AccuracyScore || 100) < 70 || (w.ErrorType && w.ErrorType !== 'None'))
      .map(w => ({
        word:      w.Word,
        accuracy:  Math.round(w.AccuracyScore || 0),
        errorType: w.ErrorType || 'None',
        phonemes:  (w.Phonemes || [])
          .filter(p => (p.PronunciationAssessment?.AccuracyScore || p.AccuracyScore || 100) < 70)
          .map(p => ({
            phoneme: p.Phoneme,
            score:   Math.round(p.PronunciationAssessment?.AccuracyScore || p.AccuracyScore || 0),
          })),
      }));

    res.status(200).json({
      transcript:          best?.Display || '',
      accuracyScore:       Math.round(pa.AccuracyScore      || 0),
      fluencyScore:        Math.round(pa.FluencyScore       || 0),
      completenessScore:   Math.round(pa.CompletenessScore  || 0),
      pronScore:           Math.round(pa.PronScore          || 0),
      prosodyScore:        Math.round(pa.ProsodyScore       || 0),
      badWords,
      allWords: words.map(w => ({
        word:      w.Word,
        accuracy:  Math.round(w.AccuracyScore || 100),
        errorType: w.ErrorType || 'None',
      })),
    });

  } catch (err) {
    console.error('Handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
