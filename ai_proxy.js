const path = require('path');
const { query } = require('./db');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// جلب إعدادات الذكاء الاصطناعي الخاصة بالمشرف من القاعدة أو المتغيرات البيئية
async function getServerAiCredentials() {
  let serverGeminiKey = process.env.SERVER_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  let serverProvider = process.env.SERVER_AI_PROVIDER || 'gemini';
  let serverVertexConfig = {
    project: process.env.VERTEX_PROJECT_ID || '',
    region: process.env.VERTEX_REGION || 'global',
    key: process.env.VERTEX_KEY_TOKEN || ''
  };

  try {
    const rows = await query('SELECT setting_key, setting_value FROM admin_settings WHERE setting_key IN (?, ?, ?)', [
      'server_gemini_api_key',
      'server_ai_provider',
      'server_vertex_config'
    ]);
    
    for (const row of rows) {
      if (row.setting_key === 'server_gemini_api_key' && row.setting_value) {
        serverGeminiKey = row.setting_value;
      }
      if (row.setting_key === 'server_ai_provider' && row.setting_value) {
        serverProvider = row.setting_value;
      }
      if (row.setting_key === 'server_vertex_config' && row.setting_value) {
        try {
          serverVertexConfig = JSON.parse(row.setting_value);
        } catch (e) {
          console.warn('Failed to parse stored vertex config:', e.message);
        }
      }
    }
  } catch (err) {
    // في حال عدم توفر القاعدة نستخدم process.env
  }

  return {
    provider: serverProvider,
    geminiKey: serverGeminiKey,
    vertexConfig: serverVertexConfig
  };
}

// بناء رابط التوجيه والترويسة لـ Gemini أو Vertex
function buildGoogleRequestConfig(provider, modelName, apiKey, vertexConfig) {
  if (provider === 'vertex') {
    const { project, region, key, token } = vertexConfig || {};
    const loc = (region && region.trim()) ? region.trim().toLowerCase() : 'global';
    const host = (loc === 'global') ? 'aiplatform.googleapis.com' : `${loc}-aiplatform.googleapis.com`;
    const cred = (key || token || '').trim();
    const isBearer = cred.startsWith('ya29.') || cred.toLowerCase().startsWith('bearer ');
    const cleanToken = cred.replace(/^bearer\s+/i, '');

    let url = `https://${host}/v1beta1/projects/${project}/locations/${loc}/publishers/google/models/${modelName}:generateContent`;
    const headers = { 'Content-Type': 'application/json' };

    if (isBearer) {
      headers['Authorization'] = `Bearer ${cleanToken}`;
      if (project) headers['x-goog-user-project'] = project;
    } else if (cred) {
      url += (url.includes('?') ? '&' : '?') + `key=${encodeURIComponent(cred)}`;
      headers['x-goog-api-key'] = cred;
    }
    return { url, headers };
  }

  return {
    url: `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
    headers: { 'Content-Type': 'application/json' }
  };
}

// معالجة طلب توليد المحتوى أو تحويل النص إلى صوت
async function handleAiGenerate(user, requestBody) {
  const {
    modelName = 'gemini-2.5-flash',
    payload,
    provider: requestedProvider,
    personalApiKey,
    personalVertexConfig
  } = requestBody;

  if (!payload) {
    throw { status: 400, message: 'محتوى الطلب (payload) مطلوب' };
  }

  let effectiveProvider = requestedProvider || 'gemini';
  let effectiveApiKey = '';
  let effectiveVertexConfig = {};
  let isUsingServerKey = false;

  // التحقق من صلاحية استخدام مفتاح السيرفر
  if (user && (user.has_server_ai_access === 1 || user.role === 'admin')) {
    const serverCreds = await getServerAiCredentials();
    isUsingServerKey = true;
    effectiveProvider = requestedProvider || serverCreds.provider;
    effectiveApiKey = serverCreds.geminiKey;
    effectiveVertexConfig = serverCreds.vertexConfig;
  } else {
    // محاولة استخدام المفتاح الشخصي للمستخدم
    effectiveApiKey = personalApiKey || '';
    effectiveVertexConfig = personalVertexConfig || {};

    if (!effectiveApiKey && user && user.custom_api_settings) {
      try {
        const parsed = typeof user.custom_api_settings === 'string' 
          ? JSON.parse(user.custom_api_settings) 
          : user.custom_api_settings;
        effectiveApiKey = parsed.gemini_api_key || '';
        effectiveVertexConfig = parsed.vertex_config || {};
        if (parsed.ai_provider) effectiveProvider = parsed.ai_provider;
      } catch (e) {}
    }
  }

  // إذا لم يتوفر مفتاح سيرفر ولا مفتاح شخصي
  if (effectiveProvider === 'gemini' && !effectiveApiKey) {
    throw {
      status: 403,
      message: 'لم يتم منح حسابك صلاحية استخدام مفتاح المشرف بعد. يرجى إدخال مفتاح Gemini الخاص بك في الإعدادات أو التواصل مع المشرف لتفعيل الحساب.'
    };
  }

  if (effectiveProvider === 'vertex' && (!effectiveVertexConfig?.project || (!effectiveVertexConfig?.key && !effectiveVertexConfig?.token))) {
    throw {
      status: 403,
      message: 'بيانات Vertex AI غير مكتملة. يرجى مراجعة إعدادات Vertex أو التواصل مع المشرف.'
    };
  }

  // تنفيذ الطلب إلى Google
  const { url, headers } = buildGoogleRequestConfig(
    effectiveProvider,
    modelName,
    effectiveApiKey,
    effectiveVertexConfig
  );

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  const resData = await response.json();

  if (!response.ok) {
    const errMsg = resData.error?.message || `خطأ من مزود الذكاء الاصطناعي (${response.status})`;
    throw { status: response.status, message: errMsg, details: resData };
  }

  // زيادة عداد الاستخدام للمستخدم في حال النجاح
  if (user && user.id) {
    try {
      await query('UPDATE users SET ai_calls_count = ai_calls_count + 1 WHERE id = ?', [user.id]);
    } catch (e) {
      console.warn('Failed to update ai_calls_count:', e.message);
    }
  }

  return {
    success: true,
    data: resData,
    usedServerKey: isUsingServerKey
  };
}

// جلب قائمة النماذج المتاحة
async function handleFetchModels(user, personalApiKey) {
  let keyToUse = personalApiKey;

  if (user && (user.has_server_ai_access === 1 || user.role === 'admin')) {
    const serverCreds = await getServerAiCredentials();
    keyToUse = serverCreds.geminiKey || personalApiKey;
  }

  if (!keyToUse) {
    // قائمة نماذج افتراضية في حال عدم توفر المفتاح حالياً
    return {
      brainModels: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-1.5-flash'],
      ttsModels: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']
    };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${keyToUse}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const allModels = (data.models || []).map(m => m.name.replace('models/', ''));

    const brainModels = allModels.filter(m => 
      m.includes('flash') || m.includes('pro') || m.includes('gemini')
    ).filter(m => !m.includes('tts') && !m.includes('embedding') && !m.includes('aqa'));

    const ttsModels = allModels.filter(m => m.includes('tts'));

    return {
      brainModels: brainModels.length ? brainModels : ['gemini-2.5-flash', 'gemini-2.5-pro'],
      ttsModels: ttsModels.length ? ttsModels : ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']
    };
  } catch (err) {
    return {
      brainModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      ttsModels: ['gemini-2.5-flash-preview-tts', 'gemini-3.1-flash-tts-preview']
    };
  }
}

module.exports = {
  getServerAiCredentials,
  handleAiGenerate,
  handleFetchModels
};
