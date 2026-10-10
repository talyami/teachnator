import { query } from '../../db/pool.js';
import { sha256 } from '../../lib/crypto.js';
import { TtsRequest, TtsResponse } from '@fast-learning/shared';
import { AppError } from '../../lib/errors.js';
import { detectTextLanguage } from './generateQuiz.js';

export async function executeTts(
  apiKey: string,
  modelName: string,
  request: TtsRequest
): Promise<TtsResponse> {
  const text = (request.text || '').trim();

  if (!text) {
    throw new AppError({
      code: 'MISSING_TEXT',
      message: 'النص المطلوب تحويله إلى صوت مفقود / Text to speak is missing',
      statusCode: 400
    });
  }

  const detectedLang = detectTextLanguage(text);
  const isEnglish = request.language === 'en' || (request.language !== 'ar' && detectedLang === 'en');

  const defaultVoice = isEnglish ? 'en-US-Standard-C' : 'ar-XA-Standard-A';
  const defaultLangCode = isEnglish ? 'en-US' : 'ar-XA';
  const voice = (request.voice || defaultVoice).trim();

  // 1. Check Cache
  const cacheKey = sha256(`${text}:${voice}:${modelName}:${defaultLangCode}`);
  const cachedRows = await query<any[]>(
    'SELECT audio, mime_type FROM tts_cache WHERE hash = ?',
    [cacheKey]
  );

  if (cachedRows.length > 0) {
    const row = cachedRows[0];
    const base64Audio = Buffer.isBuffer(row.audio)
      ? row.audio.toString('base64')
      : Buffer.from(row.audio).toString('base64');

    return {
      audioBase64: base64Audio,
      mimeType: row.mime_type || 'audio/mp3',
      cached: true
    };
  }

  // 2. Synthesize audio via Google Text-To-Speech REST API using the provided API key
  try {
    const ttsUrl = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;
    const ttsRes = await fetch(ttsUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text },
        voice: {
          languageCode: defaultLangCode,
          name: voice
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0
        }
      })
    });

    if (!ttsRes.ok) {
      const errText = await ttsRes.text();
      console.warn('Google TTS API returned non-200:', errText);
      throw new Error('TTS service unavailable with this key configuration: ' + errText);
    }

    const ttsData = await ttsRes.json();
    const audioContentBase64 = ttsData.audioContent;
    if (!audioContentBase64) {
      throw new Error('No audio content returned from TTS service');
    }

    // Save to Cache
    const audioBuffer = Buffer.from(audioContentBase64, 'base64');
    await query(
      `INSERT INTO tts_cache (hash, voice, model, mime_type, audio)
       VALUES (?, ?, ?, 'audio/mp3', ?)
       ON DUPLICATE KEY UPDATE audio = VALUES(audio)`,
      [cacheKey, voice, modelName, audioBuffer]
    );

    return {
      audioBase64: audioContentBase64,
      mimeType: 'audio/mp3',
      cached: false
    };
  } catch (err: any) {
    console.error('TTS error:', err);
    throw new AppError({
      code: 'TTS_GENERATION_FAILED',
      message: (isEnglish ? 'Failed to generate voice audio: ' : 'فشل توليد الصوت: ') + (err.message || 'Error'),
      statusCode: 502
    });
  }
}
