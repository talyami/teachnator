const { query } = require('./db');

const SETTINGS_KEYS = [
  'server_brain_url', 'server_brain_api_key', 'server_brain_model',
  'server_gemini_api_key', 'server_vertex_config',
  'server_tts_provider', 'server_tts_model', 'server_tts_voice'
];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function cleanBearer(value) {
  return String(value || '').trim().replace(/^(?:bearer\s+)+/i, '').trim();
}

async function requestJson(url, headers, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    // Never forward credentials across redirects or return upstream errors verbatim.
    const response = await fetch(url, {
      method: 'POST', headers, body: JSON.stringify(payload),
      signal: controller.signal, redirect: 'error'
    });
    if (!response.ok) {
      throw fail(response.status === 429 ? 429 : 502,
        response.status === 429 ? 'مزود الذكاء الاصطناعي مشغول، حاول لاحقاً.' : 'تعذر إتمام الطلب لدى مزود الذكاء الاصطناعي.');
    }
    return await response.json();
  } catch (error) {
    if (controller.signal.aborted) throw fail(504, 'انتهت مهلة طلب الذكاء الاصطناعي، حاول مرة أخرى.');
    if (error.status) throw error;
    throw fail(502, 'تعذر الاتصال بمزود الذكاء الاصطناعي.');
  } finally {
    clearTimeout(timeout);
  }
}

// Runtime settings are exclusively database-backed. Missing settings fail closed.
async function getServerAiCredentials() {
  const settings = Object.create(null);

  try {
    const rows = await query(
      `SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`,
      SETTINGS_KEYS
    );
    for (const row of rows) settings[row.setting_key] = row.setting_value;
  } catch (error) {
    throw fail(503, 'إعدادات الذكاء الاصطناعي غير متاحة حالياً.');
  }
  let vertexConfig = {};
  try { vertexConfig = JSON.parse(settings.server_vertex_config || '{}') || {}; } catch (error) {}
  return {
    brainUrl: settings.server_brain_url,
    brainKey: settings.server_brain_api_key,
    brainModel: settings.server_brain_model,
    geminiKey: settings.server_gemini_api_key,
    vertexConfig,
    ttsProvider: settings.server_tts_provider,
    ttsModel: settings.server_tts_model,
    ttsVoice: settings.server_tts_voice
  };
}

// بناء رابط التوجيه والترويسة لـ Gemini أو Vertex
function buildGoogleRequestConfig(provider, modelName, apiKey, vertexConfig) {
  if (provider === 'vertex') {
    const { project, region, key, token } = vertexConfig || {};
    const loc = String(region || 'global').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.:-]*$/i.test(project || '') || !/^[a-z0-9-]+$/.test(loc)) {
      throw fail(503, 'إعدادات خدمة الصوت غير مكتملة.');
    }
    const host = (loc === 'global') ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    const cred = String(key || token || '').trim();
    const isBearer = cred.startsWith('ya29.') || /^bearer\s/i.test(cred);
    const cleanToken = cleanBearer(cred);

    let url = `https://${host}/v1beta1/projects/${project}/locations/${loc}/publishers/google/models/${modelName}:generateContent`;
    const headers = { 'Content-Type': 'application/json' };

    if (isBearer) {
      headers['Authorization'] = `Bearer ${cleanToken}`;
      if (project) headers['x-goog-user-project'] = project;
    } else if (cred) {
      headers['x-goog-api-key'] = cred;
    }
    return { url, headers };
  }

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
  };
}

// معالجة طلب توليد المحتوى أو تحويل النص إلى صوت
async function handleAiGenerate(user, requestBody) {
  const { purpose, payload } = requestBody || {};
  if (purpose !== 'brain' && purpose !== 'tts') throw fail(400, 'يجب تحديد purpose: brain أو tts.');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw fail(400, 'محتوى الطلب (payload) مطلوب.');
  // Guests remain supported. Authenticated users need the existing server-access grant.
  if (user && user.role !== 'admin' && Number(user.has_server_ai_access) !== 1) {
    throw fail(403, 'حسابك لا يملك صلاحية استخدام الذكاء الاصطناعي، تواصل مع المشرف.');
  }
  const credentials = await getServerAiCredentials();
  // Only purpose and payload are read; all client routing/credential overrides are ignored.
  const resData = purpose === 'brain'
    ? await generateBrain(credentials, payload)
    : await generateSpeech(credentials, payload);

  // زيادة عداد الاستخدام للمستخدم في حال النجاح
  if (user && user.id) {
    try {
      await query('UPDATE users SET ai_calls_count = ai_calls_count + 1 WHERE id = ?', [user.id]);
    } catch (e) {
      console.warn('Failed to update AI usage counter.');
    }
  }

  return {
    success: true,
    data: resData,
    usedServerKey: true
  };
}

module.exports = { handleAiGenerate };

function convertParts(parts, textOnly = false) {
  if (!Array.isArray(parts) || !parts.length) throw fail(400, 'يجب إرسال أجزاء محتوى صالحة.');
  return parts.map(part => {
    const image = part?.inlineData;
    if (!part?.fileData && !image && part && typeof part.text === 'string') return { type: 'text', text: part.text };
    if (!part?.fileData && !textOnly && image && /^image\/(png|jpeg|jpg|webp|gif)$/i.test(image.mimeType || '') && typeof image.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
      return { type: 'image_url', image_url: { url: `data:${image.mimeType};base64,${image.data}` } };
    }
    if (!part?.fileData && !textOnly && image && image.mimeType === 'application/pdf' && typeof image.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) {
      return { type: 'file', file: { filename: 'lesson.pdf', file_data: `data:application/pdf;base64,${image.data}` } };
    }
    throw fail(400, textOnly ? 'تحويل الصوت يقبل النص فقط.' : 'يقبل هذا الخادم النص والصور وملفات PDF المضمنة فقط.');
  });
}

async function generateBrain(settings, payload) {
  let url;
  try {
    url = new URL(settings.brainUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error();
    url.pathname = url.pathname.replace(/\/$/, '') + '/chat/completions';
  } catch (error) { throw fail(503, 'إعدادات خدمة الذكاء الاصطناعي غير مكتملة.'); }
  const key = cleanBearer(settings.brainKey);
  if (!key || !settings.brainModel) throw fail(503, 'إعدادات خدمة الذكاء الاصطناعي غير مكتملة.');
  const messages = [];
  if (payload.systemInstruction) {
    messages.push({ role: 'system', content: convertParts(payload.systemInstruction.parts, true) });
  }
  if (!Array.isArray(payload.contents) || !payload.contents.length) throw fail(400, 'محتوى الطلب لا يتضمن نصاً أو صوراً.');
  for (const content of payload.contents) {
    if (!content || (content.role && !['user', 'model'].includes(content.role))) throw fail(400, 'دور المحتوى غير صالح.');
    messages.push({ role: content.role === 'model' ? 'assistant' : 'user', content: convertParts(content.parts) });
  }
  const body = { model: settings.brainModel, messages };
  const config = payload.generationConfig || {};
  if (config.responseMimeType === 'application/json') {
    body.response_format = { type: 'json_object' };
    messages.unshift({ role: 'system', content: 'Return valid JSON only. If the requested JSON is an array of questions, wrap it in an object with the key "questions".' });
  }
  if (Number.isFinite(config.temperature) && config.temperature >= 0 && config.temperature <= 2) body.temperature = config.temperature;
  if (Number.isFinite(config.topP) && config.topP >= 0 && config.topP <= 1) body.top_p = config.topP;
  if (Number.isInteger(config.maxOutputTokens) && config.maxOutputTokens > 0) body.max_tokens = Math.min(config.maxOutputTokens, 32768);
  const data = await requestJson(url.toString(), { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body);
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== 'string' || !text.trim()) throw fail(502, 'لم يرجع مزود الذكاء الاصطناعي محتوى صالحاً.');
  const result = { candidates: [{ content: { role: 'model', parts: [{ text }] } }] };
  if (data.usage) {
    result.usageMetadata = {
      promptTokenCount: Number(data.usage.prompt_tokens) || 0,
      candidatesTokenCount: Number(data.usage.completion_tokens) || 0,
      totalTokenCount: Number(data.usage.total_tokens) || 0
    };
  }
  return result;
}
async function generateSpeech(settings, payload) {
  if (!['gemini', 'vertex'].includes(settings.ttsProvider) || !/^[a-zA-Z0-9._-]+$/.test(settings.ttsModel || '') || !/^[a-zA-Z0-9_-]+$/.test(settings.ttsVoice || '')) {
    throw fail(503, 'إعدادات خدمة الصوت غير مكتملة.');
  }
  if (!Array.isArray(payload.contents) || !payload.contents.length) throw fail(400, 'النص المطلوب تحويله إلى صوت مفقود.');
  const text = payload.contents.flatMap(content => convertParts(content?.parts, true).map(part => part.text)).join('\n');
  if (!text.trim() || text.length > 10000) throw fail(400, 'أرسل نصاً للصوت لا يتجاوز 10000 حرف.');
  const fixedPayload = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.ttsVoice } } }
    }
  };
  // Preserve the lesson's speech locale, without accepting client voice/model overrides.
  const languageCode = payload.generationConfig?.speechConfig?.languageCode;
  if (typeof languageCode === 'string' && /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(languageCode)) {
    fixedPayload.generationConfig.speechConfig.languageCode = languageCode;
  }
  const configured = provider => provider === 'gemini'
    ? Boolean(String(settings.geminiKey || '').trim())
    : Boolean(settings.vertexConfig.project && String(settings.vertexConfig.key || settings.vertexConfig.token || '').trim());
  const providers = [settings.ttsProvider, settings.ttsProvider === 'gemini' ? 'vertex' : 'gemini'].filter(configured);
  if (!providers.length) throw fail(503, 'لم يتم إعداد مزود صوت متاح على الخادم.');
  let lastError;
  for (const provider of providers) {
    try {
      const { url, headers } = buildGoogleRequestConfig(provider, settings.ttsModel, settings.geminiKey, settings.vertexConfig);
      const data = await requestJson(url, headers, fixedPayload);
      const audio = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.mimeType?.startsWith('audio/') && typeof part.inlineData.data === 'string' && part.inlineData.data);
      if (!audio) throw fail(502, 'لم يرجع مزود الصوت ملفاً صوتياً صالحاً.');
      // Return only the audio contract, not arbitrary upstream metadata/errors.
      return { candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: audio.inlineData.mimeType, data: audio.inlineData.data } }] } }] };
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
