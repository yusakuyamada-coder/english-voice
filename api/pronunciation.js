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

    // Content-Typeをフロントから受け取ったmimeTypeに合わせる
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
    console.log('Azure response:', JSON.stringify(data));

    // RecognitionStatusチェック
    if (data.RecognitionStatus !== 'Success') {
      return res.status(500).json({ error: `Recognition failed: ${data.RecognitionStatus}`, raw: data });
    }

    const pa = data?.NBest?.[0]?.PronunciationAssessment;
    const words = data?.NBest?.[0]?.Words || [];

    if (!pa) {
      return res.status(500).json({ error: 'No pronunciation assessment result', raw: data });
    }

    const badWords = words
      .filter(w => (w.PronunciationAssessment?.AccuracyScore || 100) < 70
                || (w.PronunciationAssessment?.ErrorType && w.PronunciationAssessment.ErrorType !== 'None'))
      .map(w => ({
        word: w.Word,
        accuracy: Math.round(w.PronunciationAssessment?.AccuracyScore || 0),
        errorType: w.PronunciationAssessment?.ErrorType,
        phonemes: (w.Phonemes || []).filter(p => (p.PronunciationAssessment?.AccuracyScore || 100) < 70)
          .map(p => ({ phoneme: p.Phoneme, score: Math.round(p.PronunciationAssessment?.AccuracyScore || 0) })),
      }));

    res.status(200).json({
      transcript:         data?.NBest?.[0]?.Display || '',
      accuracyScore:      Math.round(pa.AccuracyScore     || 0),
      fluencyScore:       Math.round(pa.FluencyScore      || 0),
      completenessScore:  Math.round(pa.CompletenessScore || 0),
      pronScore:          Math.round(pa.PronScore         || 0),
      prosodyScore:       Math.round(pa.ProsodyScore      || 0),
      badWords,
      allWords: words.map(w => ({
        word:      w.Word,
        accuracy:  Math.round(w.PronunciationAssessment?.AccuracyScore || 100),
        errorType: w.PronunciationAssessment?.ErrorType || 'None',
      })),
    });

  } catch (err) {
    console.error('Handler error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
