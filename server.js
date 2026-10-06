/**
 * عمارتي - السيرفر السحابي الموحد (بوت واتساب + الاستقبال والتفعيل الآلي للاشتراكات)
 * مصمم للتشغيل على Render.com مجاناً 24/7
 */

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { generateInvoiceHTML } = require('./invoice_template');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// إعدادات سوبابايز
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iowpdqulkujikzsjgebd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3BkcXVsa3VqaWt6c2pnZWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQ1NDYsImV4cCI6MjEwNDE3MDU0Nn0.26U1YKl_XFvTBu3r4jJJs5VrZr1vzr9DGrpgFsMTLEU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentQR = null;
let isConnected = false;
let sock = null;
const liveTransactions = [];

// مجلد حفظ الجلسة
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// ==================== تشغيل اتصال واتساب ====================
async function initWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: true,
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        isConnected = false;
        console.log('📱 تم إنشاء رمز QR جديد للبوت. تفضل بزيارة صفحة /qr لمسحه.');
      }

      if (connection === 'close') {
        isConnected = false;
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        console.log('⚠️ تم فقد الاتصال بواتساب. جاري إعادة المحاولة...');
        if (shouldReconnect) {
          setTimeout(initWhatsApp, 3000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        currentQR = null;
        console.log('✅ تم تسجيل الدخول والاتصال بواتساب بنجاح في السحابة!');
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // الاستماع لرسائل استعادة كلمة المرور
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) continue;

        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '';

        const match = text.match(/\b\d{5}\b/);
        if (!match) continue;

        const code = match[0];
        const senderJid = msg.key.remoteJid;
        const senderPhone = senderJid.replace(/[^\d]/g, '');

        console.log(`📩 استلام طلب تأكيد بكود: ${code} من رقم: ${senderPhone}`);

        try {
          const { data, error } = await supabase
            .from('building_settings')
            .select('building_id, value')
            .eq('key', 'whatsapp_reset_request');

          if (error || !data) continue;

          for (const row of data) {
            if (!row.value) continue;
            const req = JSON.parse(row.value);

            if (req.code === code && !req.is_verified) {
              req.is_verified = true;
              req.verified_at = new Date().toISOString();
              req.verified_from = senderPhone;

              await supabase
                .from('building_settings')
                .upsert({
                  building_id: row.building_id,
                  key: 'whatsapp_reset_request',
                  value: JSON.stringify(req),
                });

              console.log(`🎉 تم تأكيد عمارة: ${req.building_name} (${req.building_code}) بنجاح!`);

              await sock.sendMessage(senderJid, {
                text: `✅ مرحباً بك مسؤول عمارة (${req.building_name})!\nتم التحقق من رقم هاتفك بنجاح.\nتم فتح شاشة كتابة كلمة المرور الجديدة في التطبيق الآن.`,
              });
              break;
            }
          }
        } catch (err) {
          console.error('❌ خطأ في معالجة التأكيد:', err);
        }
      }
    });
  } catch (e) {
    console.error('Init WhatsApp Error:', e);
  }
}

initWhatsApp();

// ==================== محرك تحليل وتفعيل الدفع التلقائي ====================

function parseEgyptianPaymentSMS(text, defaultSender = 'Vodafone Cash') {
  if (!text) return null;
  let cleaned = text.replace(/[\u0660-\u0669]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

  let amount = null;
  const amountMatch = cleaned.match(/(?:مبلغ|بقيمة|تحويل|استلام)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:ج\.م|جم|ج|جنيه|جنيهات|EGP)/i) ||
                      cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:ج\.م|EGP)/i);
  if (amountMatch) amount = parseFloat(amountMatch[1]);

  let phone = null;
  const phoneMatch = cleaned.match(/\b(01[0125][0-9]{8})\b/);
  if (phoneMatch) phone = phoneMatch[1];

  let buildingCode = null;
  const codeMatch = cleaned.match(/BLD-?([0-9]{4})/i) || cleaned.match(/كود\s*([0-9]{4})/i);
  if (codeMatch) buildingCode = 'BLD-' + codeMatch[1];

  let transactionId = null;
  const txnMatch = cleaned.match(/(?:عملية|مرجع|رقم العملية|كود العملية|المرجع|Ref)\s*:?\s*([0-9A-Za-z]{5,16})/i);
  if (txnMatch) {
    transactionId = txnMatch[1];
  } else {
    transactionId = 'TXN-' + Date.now().toString().slice(-6);
  }

  let paymentMethod = defaultSender;
  if (/إنستاباي|انستاباي|InstaPay|IPN/i.test(cleaned)) paymentMethod = 'InstaPay';
  else if (/فودافون|كاش|Vodafone|VF/i.test(cleaned)) paymentMethod = 'Vodafone Cash';

  return { amount, phone, buildingCode, transactionId, paymentMethod, raw: text };
}

async function processPayment(parsed) {
  const result = {
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    parsed,
    matchedBuilding: null,
    activation: null,
    invoice: null,
    whatsappSent: false,
    status: 'failed',
    message: ''
  };

  if (!parsed.amount || parsed.amount <= 0) {
    result.message = 'لم يتم العثور على مبلغ صحيح في نص الرسالة';
    liveTransactions.unshift(result);
    return result;
  }

  // 1. المطابقة مع العمارة
  let building = null;
  if (parsed.buildingCode) {
    const { data } = await supabase.from('buildings').select('*').eq('code', parsed.buildingCode);
    if (data && data.length > 0) building = data[0];
  }

  if (!building && parsed.phone) {
    const { data } = await supabase.from('buildings').select('*').ilike('manager_phone', `%${parsed.phone.slice(-10)}%`);
    if (data && data.length > 0) building = data[0];
  }

  if (!building) {
    result.message = `تم استخراج المبلغ (${parsed.amount} ج.م) ورقم الهاتف (${parsed.phone || 'غير محدد'})، ولكن لم يتم العثور على عمارة مسجلة بهذا الهاتف أو الكود.`;
    liveTransactions.unshift(result);
    return result;
  }

  result.matchedBuilding = {
    id: building.id,
    name: building.name,
    code: building.code,
    manager_name: building.manager_name,
    manager_phone: building.manager_phone,
    apartments_count: building.apartments_count
  };

  // 2. حساب مدة الاشتراك
  let yearsCount = 1;
  if (parsed.amount >= 500) yearsCount = 5;
  else if (parsed.amount >= 360) yearsCount = 2;
  else if (parsed.amount >= 200) yearsCount = 1;

  const now = new Date();
  const startDate = new Date();
  const expiryDate = new Date();
  expiryDate.setFullYear(startDate.getFullYear() + yearsCount);

  const formatDate = d => {
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${day} / ${month} / ${d.getFullYear()}`;
  };

  // 3. تفعيل الاشتراك في سوبابايز
  const { data: subData, error: subError } = await supabase
    .from('building_subscriptions')
    .insert([{
      building_id: building.id,
      years_count: yearsCount,
      price_paid: parsed.amount,
      payment_method: parsed.paymentMethod,
      start_date: startDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      is_active: true,
      is_trial: false,
      notes: `تفعيل آلي فوري عبر رسالة ${parsed.paymentMethod} (مرجع: ${parsed.transactionId})`
    }])
    .select();

  const newSubId = (subData && subData[0]) ? subData[0].id : Date.now().toString().slice(-4);
  await supabase.from('buildings').update({ is_active: true }).eq('id', building.id);

  // 4. توليد الفاتورة الرسمية
  const invoiceNo = `INV-${startDate.getFullYear()}-${String(newSubId).padStart(4, '0')}`;
  const basePrice = yearsCount * 200;
  const discountAmount = Math.max(0, basePrice - parsed.amount);
  const discountPercent = basePrice > 0 ? Math.round((discountAmount / basePrice) * 100) : 0;

  const cleanPhone = (building.manager_phone || '').replace(/[^0-9]/g, '');
  const waPhone = cleanPhone.startsWith('01') ? '20' + cleanPhone.slice(1) : cleanPhone;

  const qrText = encodeURIComponent(`منظومة عمارتي للحلول البرمجية الذكية (Ammarty SaaS)\nفاتورة ترخيص رسمي رقم: ${invoiceNo}\nكود العمارة: ${building.code}\nاسم العقار: ${building.name}\nالمسؤول: أ/ ${building.manager_name}\nالمدة: ${yearsCount} سنوات\nالمبلغ المسدد: ${parsed.amount} ج.م\nالحالة: مسددة بالكامل ومعتمدة رسمياً`);
  const qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrText}`;

  const waMessage = `مرحباً أستاذ ${building.manager_name}، تحياتنا لك من إدارة تطبيق عمارتي 🏢✨\n\nتم بنجاح استلام مبلغ *${parsed.amount} ج.م* عبر ${parsed.paymentMethod} (مرجع: ${parsed.transactionId}) وتفعيل ترخيص عمارتكم الموقرة (${building.name} - كود: *${building.code}*) لمدة *${yearsCount} سنوات كاملة* حتى *${formatDate(expiryDate)}*.\n\n📋 *بيانات الفاتورة الرسمية:* رقم ${invoiceNo}\n\nنظام عمارتكم الآن نشط بالكامل، شكراً لثقتكم الغالية في عمارتي 🚀`;

  const invoiceData = {
    invoiceNo,
    issueDate: formatDate(startDate),
    paymentMethod: parsed.paymentMethod,
    txnRef: parsed.transactionId,
    managerName: `أ/ ${building.manager_name}`,
    buildingName: building.name,
    code: building.code,
    managerPhone: building.manager_phone,
    cleanPhone: waPhone,
    apartmentsCount: building.apartments_count,
    planName: yearsCount >= 5 ? 'باقة الـ 5 سنوات الذهبية' : `باقة ترخيص ${yearsCount} سنوات`,
    yearsCount,
    startDate: formatDate(startDate),
    expiryDate: formatDate(expiryDate),
    yearsCover: `${startDate.getFullYear()} - ${expiryDate.getFullYear()}`,
    basePrice,
    discountAmount,
    discountPercent,
    paidPrice: parsed.amount,
    remainingPrice: 0,
    amountInWords: `فقط وقدره ${parsed.amount} جنيه مصري لا غير`,
    whatsappMessage: waMessage
  };

  const logoPath = path.join(__dirname, 'assets', 'logo.png');
  const logoBase64 = fs.existsSync(logoPath)
    ? 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64')
    : '';

  const invoiceHTML = generateInvoiceHTML(invoiceData, {
    isStandaloneForScreenshot: false,
    logoBase64,
    qrDataUrl
  });

  const invoiceFilename = `invoice_${building.code}.html`;
  fs.writeFileSync(path.join(__dirname, invoiceFilename), invoiceHTML, 'utf8');

  // 5. إرسال رسالة واتساب للعميل فورياً إن كان البوت متصلاً
  if (isConnected && sock && waPhone) {
    try {
      const recipientJid = `${waPhone}@s.whatsapp.net`;
      await sock.sendMessage(recipientJid, { text: waMessage });
      result.whatsappSent = true;
      console.log(`📲 تم إرسال رسالة التأكيد عبر واتساب إلى: ${recipientJid}`);
    } catch (e) {
      console.error('Error sending WhatsApp message:', e);
    }
  }

  result.status = 'success';
  result.message = `تم تفعيل اشتراك ${building.name} (${building.code}) لمدة ${yearsCount} سنوات بنجاح!`;
  result.activation = {
    subId: newSubId,
    yearsCount,
    amount: parsed.amount,
    expiryDate: formatDate(expiryDate),
    method: parsed.paymentMethod
  };
  result.invoice = {
    invoiceNo,
    htmlUrl: `/invoices/${invoiceFilename}`,
    whatsappText: waMessage,
    waLink: `https://wa.me/${waPhone}?text=${encodeURIComponent(waMessage)}`
  };

  liveTransactions.unshift(result);
  return result;
}

// ==================== مسارات الـ API وصفحات الويب ====================

// استلام Webhook من تطبيق الـ SMS
app.post('/api/sms-webhook', async (req, res) => {
  try {
    const text = req.body.message || req.body.text || req.body.content || '';
    const sender = req.body.sender || req.body.from || 'Vodafone';

    console.log(`\n📥 استلام Webhook SMS جديد:`, text);
    const parsed = parseEgyptianPaymentSMS(text, sender);
    const outcome = await processPayment(parsed);
    res.json(outcome);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// شريط العمليات المباشر
app.get('/api/live-feed', (req, res) => {
  res.json(liveTransactions);
});

// عرض الفاتورة
app.get('/invoices/:filename', (req, res) => {
  const file = path.join(__dirname, path.basename(req.params.filename));
  if (fs.existsSync(file)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    fs.createReadStream(file).pipe(res);
  } else {
    res.status(404).send('الفاتورة غير موجودة');
  }
});

// الصفحة الرئيسية (لوحة المراقبة ومحاكي التجربة)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>سيرفر عمارتي السحابي - البوت والدفع الآلي</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px 20px; line-height: 1.6; }
        .card { background: #1e293b; max-width: 600px; margin: auto; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
        .badge { display: inline-block; padding: 6px 16px; border-radius: 50px; font-weight: bold; font-size: 13px; }
        .connected { background: #dcfce7; color: #166534; }
        .disconnected { background: #fef3c7; color: #92400e; }
        .btn { display: inline-flex; align-items: center; gap: 8px; background: #2563eb; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: bold; margin: 8px 4px; border: none; cursor: pointer; }
        .btn-wa { background: #25D366; }
        .btn:hover { opacity: 0.9; }
        .endpoint-box { background: #0b0f19; border: 1px dashed #334155; border-radius: 12px; padding: 14px; margin-top: 20px; text-align: right; font-size: 13px; color: #94a3b8; }
        .code { background: #000; color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-family: monospace; display: block; margin-top: 6px; direction: ltr; text-align: left; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🏢 سيرفر عمارتي السحابي الموحد</h2>
        <p style="color: #94a3b8; font-size: 14px;">نظام استقبال الدفع الآلي والتفعيل الفوري + بوت واتساب</p>
        <br>
        <div style="display:flex; justify-content:center; gap:12px; margin-bottom: 20px;">
          <div>
            <span style="font-size:12px; color:#94a3b8; display:block; margin-bottom:4px;">حالة اتصال واتساب:</span>
            <span class="badge ${isConnected ? 'connected' : 'disconnected'}">
              ${isConnected ? '✅ متصل ويعمل' : '⚠️ بانتظار مسح رمز QR'}
            </span>
          </div>
          <div>
            <span style="font-size:12px; color:#94a3b8; display:block; margin-bottom:4px;">محرك الدفع الآلي:</span>
            <span class="badge connected">
              ⚡ جاهز للاستقبال
            </span>
          </div>
        </div>

        <div>
          ${!isConnected ? '<a href="/qr" class="btn btn-wa"><i class="fa-brands fa-whatsapp"></i> مسح رمز QR لربط واتساب</a>' : ''}
        </div>

        <div class="endpoint-box">
          <strong>📲 رابط Webhook المباشر لهاتفك الحقيقي:</strong>
          <span>ضع هذا الرابط في تطبيق SMS Forwarder على الهاتف:</span>
          <span class="code">/api/sms-webhook</span>
        </div>
      </div>
    </body>
    </html>
  `);
});

// صفحة مسح رمز الـ QR
app.get('/qr', async (req, res) => {
  if (isConnected) return res.redirect('/');
  if (!currentQR) {
    return res.send(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="3">
        <title>جاري تجهيز الرمز...</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px; background:#0f172a; color:#fff;">
        <h3>⏳ جاري توليد رمز الـ QR... سيتم التحديث تلقائياً خلال ثوانٍ...</h3>
      </body>
      </html>
    `);
  }

  try {
    const qrImage = await QRCode.toDataURL(currentQR);
    res.send(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="15">
        <title>امسح رمز QR - بوت عمارتي</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f172a; color:#fff; text-align: center; padding: 40px 20px; }
          .box { background: #1e293b; max-width: 420px; margin: auto; padding: 30px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
          img { width: 260px; height: 260px; border-radius: 12px; }
          .instructions { text-align: right; background: #0f172a; padding: 15px; border-radius: 12px; font-size: 13px; color: #cbd5e1; line-height: 1.8; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2 style="color: #22c55e; margin-bottom: 5px;">📱 ربط واتساب السحابي</h2>
          <p style="color: #94a3b8; font-size: 13px;">امسح هذا الرمز مرة واحدة فقط من هاتفك</p>
          <img src="${qrImage}" alt="QR Code" />
          <div class="instructions">
            <b>طريقة المسح:</b><br>
            1. افتح تطبيق واتساب على هاتفك.<br>
            2. اضغط على القائمة (الثلاث نقاط) 👈 <b>الأجهزة المرتبطة</b>.<br>
            3. اضغط على <b>ربط جهاز</b> ووجّه الكاميرا إلى هذا الرمز.<br>
            <i>(يتم تحديث الرمز تلقائياً كل 15 ثانية).</i>
          </div>
          <br>
          <a href="/" style="color:#38bdf8; text-decoration:none; font-size:13px;">⬅️ العودة للرئيسية</a>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send('Error generating QR');
  }
});

app.listen(PORT, () => {
  console.log(`🚀 السيرفر السحابي يعمل على المنفذ: ${PORT}`);
});
