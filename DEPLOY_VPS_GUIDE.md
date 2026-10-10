# 🚀 دليل تشغيل وربط التطبيق بقاعدة بيانات MySQL على سيرفرك (VPS)

مرحباً بك! تم تحديث التطبيق بالكامل ليصبح نظاماً متكاملاً يعتمد على الحسابات وقاعدة بيانات MySQL مع لوحة تحكم إدارية وميزة حفظ واستئناف الاختبارات وسرية تامة لمفتاح الذكاء الاصطناعي الخاص بك.

---

## 📋 المميزات الجديدة المضافة:
1. **ربط كامل بقاعدة بيانات MySQL** على سيرفرك الخاص، مع إنشاء الجداول تلقائياً عند أول تشغيل.
2. **نظام حسابات حصري عبر Google و Apple Sign-In** مع جلسات JWT آمنة.
3. **لوحة تحكم المشرف (Admin Dashboard)**:
   - تمكّنك بضغطة زر واحدة من منح أو سحب صلاحية استخدام مفتاح الذكاء الاصطناعي (`Gemini` أو `Vertex AI`) لأي مستخدم.
   - **أمان وسرية تامة**: مفتاحك مخزن في السيرفر أو قاعدة البيانات فقط ولا يظهر إطلاقاً في واجهة أو حساب المستخدم!
   - إحصائيات فورية (عدد المستخدمين، عدد الطلبات، المواد المحفوظة، وحالة السيرفر).
   - اختبار الاتصال المباشر بمفتاح المشرف للتأكد من جاهزيته.
4. **لوحة تحكم المستخدم (User Dashboard)**:
   - حفظ المواد الدراسية والاختبارات تلقائياً.
   - ميزة **استئناف الاختبار (Resume)** في أي وقت ومن أي جهاز لمتابعة الحل من نفس السؤال والنتيجة السابقة!
   - إمكانية إضافة المستخدم لمفتاحه الشخصي إذا لم يكن لديه صلاحية من المشرف.
5. **تسجيل دخول سريع للتجربة (Dev/Demo Login)** لتجربة لوحة المشرف وحسابات الطلاب فوراً دون انتظار إعدادات OAuth.

---

## 🛠️ خطوات التشغيل على سيرفر VPS (خطوة بخطوة):

### 1. نقل ملفات المشروع إلى السيرفر
يمكنك رفع الملفات عبر `scp` أو `rsync` أو Git إلى مسار موقعك على السيرفر:
```bash
# مثال عبر SCP:
scp -r * samantha@31.97.182.123:/home/villa.linkflow.page/public_html/fast-learning/
```

### 2. تجهيز قاعدة بيانات MySQL على السيرفر
قم بالدخول إلى MySQL على سيرفرك:
```bash
mysql -u root -p
```
ثم نفّذ الأوامر التالية لإنشاء قاعدة البيانات والمستخدم:
```sql
CREATE DATABASE IF NOT EXISTS fast_learning_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- إنشاء مستخدم خاص بالقاعدة (أو استخدام مستخدمك الحالي):
CREATE USER IF NOT EXISTS 'fast_user'@'localhost' IDENTIFIED BY 'كلمة_المرور_القوية_هنا';
GRANT ALL PRIVILEGES ON fast_learning_db.* TO 'fast_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
*(ملاحظة: الجداول ستُنشأ تلقائياً بمجرد تشغيل التطبيق لأول مرة عبر `db.js`، ويمكنك أيضاً استيراد `schema.sql` إذا أردت)*

### 3. إعداد ملف البيئة `.env`
على السيرفر، انسخ `.env.example` إلى `.env` وعدّل البيانات:
```bash
cp .env.example .env
nano .env
```
ضع بياناتك:
```env
PORT=3000
NODE_ENV=production

# بيانات MySQL
DB_HOST=localhost
DB_USER=fast_user
DB_PASSWORD=كلمة_المرور_التي_اخترتها
DB_NAME=fast_learning_db
DB_PORT=3306

# بريد المشرف (أي حساب يسجل بهذا البريد يصبح مديراً تلقائياً)
ADMIN_EMAILS=talyami@gmail.com,samantha@villa.linkflow.page

# مفتاح Gemini الرئيسي للمشرف (سري في السيرفر)
SERVER_GEMINI_API_KEY=AIzaSy...

# معرّفات تسجيل الدخول
GOOGLE_CLIENT_ID=معرف_جوجل_client_id.apps.googleusercontent.com
APPLE_CLIENT_ID=معرف_آبل_services_id
```

### 4. تثبيت الحزم وتشغيل التطبيق في الخلفية باستخدام PM2
```bash
cd /home/villa.linkflow.page/public_html/fast-learning/

# تثبيت الحزم
npm install

# تشغيل الخادم بواسطة PM2 ليعمل دائماً في الخلفية
pm2 start server.js --name "fast-learning"

# حفظ إعدادات PM2 ليعمل تلقائياً عند إعادة تشغيل السيرفر
pm2 save
pm2 startup
```

### 5. إعداد Nginx أو Apache كـ Reverse Proxy (اختياري / موصى به)
إذا كان موقعك يعمل عبر Nginx وتريد توجيهه للدومين مع SSL (HTTPS):
```nginx
location /fast-learning/ {
    proxy_pass http://localhost:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
}
```

---

## 👑 كيف تتحكم بالصلاحيات وتمنح مفتاحك للمستخدمين؟
1. ادخل إلى التطبيق وسجل دخول بحسابك المسجل في `ADMIN_EMAILS` (مثل `talyami@gmail.com`).
2. ستظهر لك أيقونة التاج الذهبي في الأعلى: **لوحة المشرف 👑**.
3. افتح لوحة المشرف، وستجد قائمة بجميع المستخدمين الذين سجلوا دخول بحسابات Google أو Apple.
4. أمام أي مستخدم، ستجد زر: **"مفتاح السيرفر (Server AI)"**:
   - اضغط عليه ليتحول إلى **أخضر (ممنوح)**.
   - فوراً، سيتمكن هذا المستخدم من توليد الاختبارات واستخدام الصوت الذكي بالاعتماد على مفتاحك المخزن في السيرفر، دون أن يرى المفتاح أو يعرف تفاصيله!
5. يمكنك في أي وقت سحب الصلاحية بضغطة زر واحدة.
