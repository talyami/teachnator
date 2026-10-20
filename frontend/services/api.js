import { MAX_AUDIO_RESPONSE_BYTES, readBoundedJson } from './resources.cjs';
    // Local HTML previews still need the Node API; hosted pages stay same-origin.
    const getApiUrl = (endpoint) => {
      const isLocalFile = window.location.protocol === 'file:';
      const isLocalPreview = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) &&
        !['3000', '3025'].includes(window.location.port);
      const isSubpath = /^\/teachnator(?:\/|$)/.test(window.location.pathname);
      const base = isLocalFile || isLocalPreview ? 'http://localhost:3025/api' : (isSubpath ? '/teachnator/api' : '/api');
      const clean = endpoint.startsWith('/api') ? endpoint.substring(4) : (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
      return base + (clean.startsWith('/') ? clean : '/' + clean);
    };

    // Local quota is advisory only. The persistent device ID identifies the server allowance.
    const GUEST_MATERIAL_KEY = 'smartExamGuestMaterial.v1';
    const getGuestDevice = () => {
      let id = localStorage.getItem('guest_device_id');
      if (!id) {
        try {
          id = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
              });
          localStorage.setItem('guest_device_id', id);
        } catch (_) {
          id = 'guest_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        }
      }
      return id;
    };
    const apiHeaders = (token = localStorage.getItem('auth_token') || '') => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : { 'X-Guest-Device': getGuestDevice() })
    });
    // Reverse proxies can return HTML for upload/timeout failures. Never show their
    // raw response, and never retry a paid generation automatically.
    const readApiResponse = async (res, maxBytes = null) => {
      let json;
      try { json = maxBytes ? await readBoundedJson(res, maxBytes) : await res.json(); }
      catch (error) { if (error.code === 'AUDIO_RESPONSE_TOO_LARGE') throw error; }
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        console.warn('Non-JSON API response', { status: res.status, url: res.url, contentType: res.headers.get('content-type') });
        const messages = {
          413: 'حجم المرفقات كبير جداً. قلّل حجم الملفات أو عددها ثم حاول مرة أخرى.',
          429: 'تم تجاوز حد الطلبات، حاول بعد دقيقة.',
          502: 'تعذر الاتصال بخادم التطبيق عبر بوابة الموقع. حاول مرة أخرى لاحقاً.',
          503: 'خادم التطبيق غير متاح حالياً. حاول مرة أخرى لاحقاً.',
          504: 'انتهت مهلة الاتصال بخادم التطبيق. تحقق من حالة المادة قبل إعادة التوليد.',
          520: 'تعذر الاتصال بخادم التطبيق عبر بوابة الموقع. حاول مرة أخرى لاحقاً.',
          521: 'خادم التطبيق غير متاح حالياً. حاول مرة أخرى لاحقاً.',
          522: 'انتهت مهلة الاتصال بخادم التطبيق. تحقق من حالة المادة قبل إعادة التوليد.',
          524: 'انتهت مهلة الاتصال بخادم التطبيق. تحقق من حالة المادة قبل إعادة التوليد.'
        };
        throw new Error(messages[res.status] || (res.status === 404 || res.ok
          ? 'استجابة الخادم غير صالحة. تحقق من تشغيل خادم التطبيق وتوجيه مسار API إليه.'
          : `خطأ من الخادم (${res.status})`));
      }
      if (!res.ok || json.success === false) {
        throw Object.assign(new Error(json.message || `API error (${res.status})`), { status: res.status, revision: json.revision });
      }
      return json;
    };
    let activeMaterialContext = { generationId: null, materialId: null };
    const materialApi = async (endpoint, { token, method = 'GET', body, signal } = {}) => {
      const res = await fetch(getApiUrl(endpoint), {
        method, headers: apiHeaders(token), signal,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      return readApiResponse(res);
    };

    // Every AI operation belongs to a reservation or an already saved material.
    const requestAiCompletion = async ({ purpose = 'brain', operation, generationId, materialId, material, draftQuestions, payload, evaluation, signal = null }) => {
      const ownerToken = localStorage.getItem('auth_token') || '';
      const headers = apiHeaders(ownerToken);
      const context = generationId ? { generationId } : materialId ? { materialId } : activeMaterialContext;
      let res;
      try {
        res = await fetch(getApiUrl('/ai/generate'), {
          method: 'POST',
          headers,
          body: JSON.stringify({ purpose, operation, ...context, material, draftQuestions, payload, evaluation }),
          signal
        });
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        throw new Error(getApiUrl('/ai/generate').startsWith('http://localhost:3000/')
          ? 'تعذر الاتصال بالخادم المحلي. شغّل npm start من مجلد المشروع ثم افتح http://localhost:3000.'
          : 'تعذر الاتصال بخادم التطبيق. تحقق من اتصال الشبكة وتشغيل الخادم ثم حاول مرة أخرى.');
      }
      // Bound the actual streamed response before JSON/base64 parsing, not only
      // the decoded clip. Allow base64 expansion plus small response metadata.
      const json = await readApiResponse(res, purpose === 'tts' ? Math.ceil(MAX_AUDIO_RESPONSE_BYTES * 4 / 3) + 65536 : null);
      if ((localStorage.getItem('auth_token') || '') !== ownerToken) throw new DOMException('Account changed.', 'AbortError');
      return json.data || json;
    };

    // بناء أجزاء المحتوى للذكاء الاصطناعي مع عزل المادة التعليمية كبيانات غير موثوقة ضد حقن الأوامر (Prompt Injection Fencing)
    const buildContentsParts = (prompt, material) => {
      const parts = [{ text: prompt }];
      if (!material) return parts;

      if (material.type === 'text') {
        parts.push({ text: `\n<untrusted_study_material>\n${material.data}\n</untrusted_study_material>` });
      } else if (material.type === 'file') {
        parts.push({ text: '\n<untrusted_study_material>' });
        parts.push({ inlineData: { mimeType: material.mimeType, data: material.data } });
        parts.push({ text: '\n</untrusted_study_material>' });
      } else if (material.type === 'multi' && Array.isArray(material.items)) {
        parts.push({ 
          text: `\n<untrusted_study_material count="${material.items.length}">`
        });
        material.items.forEach((item, idx) => {
          if (item.type === 'text') {
            parts.push({ text: `\n[المرفق ${idx + 1}: ${item.name || 'مستند نصي'}]\n${item.data}` });
          } else if (item.data) {
            parts.push({ text: `\n[المرفق ${idx + 1}: ${item.name || 'صورة / مستند مرفق'}]` });
            parts.push({ 
              inlineData: { 
                mimeType: item.mimeType || 'image/jpeg', 
                data: item.data 
              } 
            });
          }
        });
        parts.push({ text: '\n</untrusted_study_material>' });
      }
      return parts;
    };


const setActiveMaterialContext = value => { activeMaterialContext = value; };
export { getApiUrl, apiHeaders, materialApi, requestAiCompletion, GUEST_MATERIAL_KEY, activeMaterialContext, setActiveMaterialContext };
