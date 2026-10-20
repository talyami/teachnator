'use strict';
const { getRetentionPolicy } = require('./retention_policy');

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function publicText(value, max = 250) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(text) ? text : null;
}
function publicEmail(value) {
  const text = publicText(value, 254);
  // Deliberately accept conventional support addresses only. Reserved mailto
  // characters (?, #, %, &) must not become header/query injection downstream.
  if (!text || !/^[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,63}$/.test(text)) return null;
  const [local, domain] = text.split('@');
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  return domain.split('.').every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) ? text : null;
}
function publicHttpsUrl(value) {
  const text = publicText(value, 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    // Operator links are public, not a place for query-string credentials.
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
function normalizeBasePath(value = '') {
  if (value === '' || value === '/') return '';
  if (typeof value !== 'string' || !/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\/?$/.test(value)) throw new Error('Invalid public base path.');
  return value.replace(/\/$/, '');
}
function getPublicLegalConfig(env = process.env, { basePath = '' } = {}) {
  const base = normalizeBasePath(basePath);
  const whatsapp = publicText(env.SUPPORT_WHATSAPP, 20);
  const digits = whatsapp && /^\+?[1-9]\d{7,14}$/.test(whatsapp) ? whatsapp.replace(/^\+/, '') : null;
  const reviewedAt = publicText(env.LEGAL_REVIEWED_AT, 10);
  const dateValid = reviewedAt && /^\d{4}-\d{2}-\d{2}$/.test(reviewedAt) && Number.isFinite(Date.parse(reviewedAt)) && new Date(reviewedAt).toISOString().slice(0, 10) === reviewedAt;
  return {
    operator: {
      name: publicText(env.LEGAL_OPERATOR_NAME),
      country: publicText(env.LEGAL_OPERATOR_COUNTRY, 100),
      address: publicText(env.LEGAL_OPERATOR_ADDRESS, 500),
      registrationNumber: publicText(env.LEGAL_OPERATOR_REGISTRATION, 100)
    },
    support: { email: publicEmail(env.SUPPORT_EMAIL), url: publicHttpsUrl(env.PUBLIC_SUPPORT_URL), whatsapp: digits ? `https://wa.me/${digits}` : null },
    providers: {
      identity: publicText(env.LEGAL_IDENTITY_PROVIDER, 500),
      ai: publicText(env.LEGAL_AI_PROVIDER, 500),
      speech: publicText(env.LEGAL_SPEECH_PROVIDER, 500),
      hosting: publicText(env.LEGAL_HOSTING_PROVIDER, 500),
      fonts: publicText(env.LEGAL_FONT_PROVIDER, 500),
      monitoring: publicText(env.LEGAL_MONITORING_PROVIDER, 500),
      processingLocations: publicText(env.LEGAL_PROCESSING_LOCATIONS, 500)
    },
    policy: { ownerReviewed: env.LEGAL_POLICY_REVIEWED === 'true', reviewedAt: dateValid ? reviewedAt : null, version: publicText(env.LEGAL_POLICY_VERSION, 64) },
    paths: { privacy: `${base}/privacy`, terms: `${base}/terms`, contact: `${base}/contact` }
  };
}
function paragraphs(ar, en) {
  return `<p lang="ar" dir="rtl">${escapeHtml(ar)}</p><p lang="en" dir="ltr">${escapeHtml(en)}</p>`;
}
function contactDetails(config) {
  const missing = 'Not configured / غير مُعدّ';
  const fields = [['Operator / المشغّل', config.operator.name], ['Country / الدولة', config.operator.country], ['Address / العنوان', config.operator.address], ['Registration / التسجيل', config.operator.registrationNumber]];
  const details = fields.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value || missing)}</dd>`).join('');
  const support = [];
  if (config.support.email) support.push(`<li><a href="mailto:${escapeHtml(config.support.email)}">${escapeHtml(config.support.email)}</a></li>`);
  for (const url of [config.support.url, config.support.whatsapp].filter(Boolean)) support.push(`<li><a href="${escapeHtml(url)}" rel="noopener noreferrer">${escapeHtml(url)}</a></li>`);
  return `<dl>${details}</dl>${support.length ? `<ul>${support.join('')}</ul>` : paragraphs('وسيلة التواصل غير مُعدّة. لا توجد قناة دعم منشورة حالياً.', 'Support is not configured. No support channel is currently published.')}`;
}
function providerDetails(config) {
  const labels = { identity: 'Identity / الهوية', ai: 'AI / الذكاء الاصطناعي', speech: 'Speech / الصوت', hosting: 'Hosting / الاستضافة', fonts: 'Fonts / الخطوط', monitoring: 'External alerts / التنبيهات الخارجية', processingLocations: 'Processing locations / مواقع المعالجة' };
  return '<h2>Operator-published processor disclosures / إفصاحات المعالجة المنشورة من المشغّل</h2>'
    + paragraphs('هذه إفصاحات أدخلها المشغّل وليست تحققاً آلياً من إعداداته أو ضماناً لسياسات المزود. يجب مراجعة الأطراف الوسيطة والمزود الفعلي والمناطق وشروط الاحتفاظ قبل مشاركة البيانات.', 'These are operator-entered disclosures, not automatic verification of runtime settings or guarantees about a provider. Review intermediaries, actual providers, processing regions and retention terms before sharing data.')
    + `<dl>${Object.entries(labels).map(([key, label]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(config.providers[key] || 'Not disclosed / غير مُفصح عنه')}</dd>`).join('')}</dl>`;
}
function renderLegalPage(page, { env = process.env, basePath = '' } = {}) {
  if (!['privacy', 'terms', 'contact'].includes(page)) throw new Error('Unknown public policy page.');
  const config = getPublicLegalConfig(env, { basePath });
  const retention = getRetentionPolicy(env);
  const titles = { privacy: 'Privacy / الخصوصية', terms: 'Terms / شروط الاستخدام', contact: 'Contact / التواصل' };
  const review = config.policy.ownerReviewed
    ? paragraphs('سجّل المشغّل مراجعته لهذا النص. هذا ليس اعتماداً قانونياً أو إثباتاً للامتثال.', 'The operator has recorded an owner review of this text. This is not legal certification or evidence of regulatory compliance.')
    : paragraphs('لم يسجّل المشغّل مراجعة هذه السياسة بعد. بيانات المشغّل الناقصة موضّحة أدناه؛ لا تفترض وجود جهة أو ترخيص غير منشور.', 'Owner review of this policy has not been recorded. Missing operator details are identified below; do not assume an unpublished entity or registration exists.');
  let content = '';
  if (page === 'privacy') {
    content = paragraphs('تعالج الخدمة بيانات الحساب وتسجيل الدخول، والمواد والأسئلة والتقدم التي تختار حفظها. بعض مواد الضيف وإعداداته تبقى في تخزين المتصفح حتى حذفها من الجهاز.', 'The service processes account/sign-in data, and materials, questions and progress you choose to save. Some guest materials and preferences remain in browser storage until removed on that device.')
      + paragraphs('قد يُرسل النص أو محتوى الملفات والأسئلة إلى مزود الذكاء الاصطناعي أو الصوت المُعدّ عند طلب هذه الميزات. تسجيل الدخول يعتمد على مزود الهوية، وقد تطلب الخطوط الخارجية عنوان الشبكة كجزء من الاتصال. لا ترفع بيانات حساسة لا يحق لك مشاركتها. راجع إفصاحات المشغّل أدناه؛ الحقول الناقصة غير مُفصح عنها. لا يوجد هنا ضمان لإقامة البيانات.', 'Text, file content and questions may be sent to the configured AI or speech provider when those features are requested. Sign-in depends on the identity provider; external fonts may receive network metadata as part of the connection. Do not submit sensitive data you are not authorized to share. See the operator-entered disclosures below; unset fields are explicitly undisclosed. No data-residency guarantee is made here.')
      + paragraphs(`نافذة صلاحية ذاكرة الصوت ${retention.ttsCacheDays} أيام. عند تشغيل الصيانة الخاصة المعتمدة تُحذف سجلات استخدام الذكاء الاصطناعي الأقدم من ${retention.aiUsageDays} يوماً وعدّادات الأيام الأقدم من ${retention.dailyBudgetDays} أيام. يحتفظ أمر النسخ الاحتياطي بنسخه المحلية لمدة ${retention.backupDays} أيام ويحذف المنتهي منها بعد نسخة ناجحة. هذه إعدادات وليست دليلاً على تشغيل الجدولة؛ النسخ خارج الخادم لها سياسة منفصلة.`, `The audio cache validity window is ${retention.ttsCacheDays} days. When approved private maintenance runs, AI usage older than ${retention.aiUsageDays} days and daily counters older than ${retention.dailyBudgetDays} days are deleted. The backup command retains local completed dumps for ${retention.backupDays} days and prunes expired dumps after a successful backup. These settings do not prove that scheduling is active; off-host copies have a separate policy.`)
      + paragraphs('البيانات المحفوظة في الحساب ليست لها مدة حذف تلقائي عامة مُعدّة هنا. لطلبات الوصول أو التصحيح أو حذف الحساب وبياناته تواصل مع المشغّل عبر القنوات المنشورة؛ لا يوجد وعد بمدة استجابة أو مسار حذف آلي كامل. قد تبقى البيانات في النسخ الاحتياطية حتى انتهاء احتفاظها. سجلات الخادم والوكيل يضبطها المشغّل على حدة.', 'No general automatic expiry is configured here for saved account data. Contact the operator through published channels to request access, correction, or deletion of your account/data; there is no promised response time or complete automated account-erasure workflow. Copies may remain in backups until their retention expires. The operator configures proxy/server logs separately.')
      + paragraphs('تقارير أخطاء التطبيق تقتصر على رموز وفئات تقنية ومسارات نموذجية ومعرّف إصدار وموقع في ملف مبني. لا يُقصد بها جمع الرسائل الخام أو المستندات أو كلمات المرور أو رموز الدخول. التنبيهات الخارجية اختيارية ويجب على المشغّل مراجعة مستلمها واحتفاظها.', 'Application error reports are restricted to technical codes/categories, route templates, a release identifier and positions in a built asset. They are not intended to collect raw messages, documents, passwords or access tokens. External alerts are optional; the operator must review their recipient and retention.');
  } else if (page === 'terms') {
    content = paragraphs('هذه أداة مساعدة للتعلم وليست جهة تعليمية معتمدة أو بديلاً عن المعلم أو المشورة المهنية. قد تكون الأسئلة والإجابات والتقييمات المولّدة غير دقيقة؛ راجع مصادرها قبل الاعتماد عليها.', 'This is a study aid, not an accredited educational institution or a substitute for a teacher or professional advice. Generated questions, answers and grading can be inaccurate; verify them against your sources before relying on them.')
      + paragraphs('استخدم فقط مواد تملكها أو لديك حق معالجتها ومشاركتها. لا ترفع محتوى غير قانوني أو بيانات شخصية حساسة دون صلاحية، ولا تحاول تجاوز حدود الاستخدام أو الوصول إلى حسابات الآخرين أو تعطيل الخدمة.', 'Use only materials you own or are authorized to process and share. Do not submit unlawful content or sensitive personal data without authority, circumvent usage limits, access other accounts, or disrupt the service.')
      + paragraphs('توفر الميزات يعتمد على إعداد الخادم ومزودي الهوية والذكاء الاصطناعي والصوت. قد تطبق حدود للاستخدام وقد تتغير الخدمة؛ لا توجد هنا اتفاقية توافر أو وعد بحفظ غير محدود. احتفظ بنسخة من موادك المهمة.', 'Feature availability depends on server configuration and identity, AI and speech providers. Usage limits may apply and the service may change; no uptime agreement or unlimited-storage promise is offered here. Keep a copy of important materials.')
      + paragraphs('بيانات المشغّل ووسائل التواصل المنشورة أدناه هي المرجع للاستفسارات. لم يُحدّد هنا قانون حاكم أو اختصاص قضائي خاص بالمشغّل، ولا يُقصد بهذا النص إلغاء حقوق إلزامية. يجب أن يراجع المشغّل ملاءمة هذه الشروط قبل الإطلاق.', 'Published operator details and contact channels below are the reference for questions. No operator-specific governing law or jurisdiction has been specified here, and this text does not purport to waive mandatory rights. The operator must review the suitability of these terms before launch.');
  } else {
    content = paragraphs('للاستفسارات أو مشكلات الخدمة أو طلبات الخصوصية استخدم وسيلة التواصل المنشورة. لا ترسل كلمة مرور أو رمز دخول أو ملفاً حساساً. إن لم تُنشر وسيلة فالتواصل غير مُعدّ بعد؛ لا توجد مدة استجابة مضمونة.', 'Use the published channel for service questions, issues or privacy requests. Do not send passwords, access tokens or sensitive files. If no channel is published, contact is not yet configured; no response time is guaranteed.');
  }
  const navigation = Object.entries(config.paths).map(([key, url]) => `<a href="${escapeHtml(url)}">${escapeHtml(titles[key])}</a>`).join(' | ');
  const version = `<p>Policy version / إصدار السياسة: ${escapeHtml(config.policy.version || 'Not configured / غير مُعدّ')}<br>Owner review date / تاريخ مراجعة المشغّل: ${escapeHtml(config.policy.reviewedAt || 'Not recorded / غير مسجّل')}</p>`;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titles[page]} — Fast Learning</title></head><body><header><a href="${escapeHtml(normalizeBasePath(basePath) + '/')}">Fast Learning</a><nav aria-label="Policy pages / صفحات السياسات">${navigation}</nav></header><main><h1>${titles[page]}</h1>${review}${version}<article>${content}${page === 'privacy' ? providerDetails(config) : ''}</article><h2>Operator and support / المشغّل والدعم</h2>${contactDetails(config)}</main></body></html>`;
}
function legalPageHandler(page, options = {}) {
  return (_request, response) => {
    response.set('Cache-Control', 'no-store');
    return response.type('html').send(renderLegalPage(page, options));
  };
}
module.exports = { escapeHtml, publicEmail, publicHttpsUrl, normalizeBasePath, getPublicLegalConfig, renderLegalPage, legalPageHandler };
