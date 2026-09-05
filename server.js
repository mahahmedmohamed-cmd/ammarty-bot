/**
 * عمارتي - السيرفر السحابي لبوت التأكيد التلقائي عبر واتساب
 * مصمم للتشغيل على Render.com مجاناً 24/7
 */

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// إعدادات سوبابايز
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iowpdqulkujikzsjgebd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3BkcXVsa3VqaWt6c2pnZWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQ1NDYsImV4cCI6MjEwNDE3MDU0Nn0.26U1YKl_XFvTBu3r4jJJs5VrZr1vzr9DGrpgFsMTLEU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentQR = null;
let isConnected = false;
let sock = null;

// مجلد حفظ الجلسة
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

async function initWhatsApp() {
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
      console.log('📱 تم إنشاء رمز QR جديد. تفضل بزيارة صفحة /qr لمسحه.');
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

  // الاستماع للرسائل الواردة
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

            console.log(`🎉 تم تأكيد العمارة: ${req.building_name} (${req.building_code}) بنجاح!`);

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
}

// تشغيل البوت
initWhatsApp();

// ==================== صفحات الويب (Express) ====================

// الصفحة الرئيسية: حالة البوت
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>بوت عمارتي السحابي</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #f8fafc; text-align: center; padding: 50px 20px; }
        .card { background: white; max-width: 500px; margin: auto; padding: 30px; border-radius: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .badge { display: inline-block; padding: 8px 16px; border-radius: 50px; font-weight: bold; }
        .connected { background: #dcfce7; color: #166534; }
        .disconnected { background: #fef3c7; color: #92400e; }
        a.btn { display: inline-block; background: #25D366; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🏢 بوت عمارتي - السيرفر السحابي</h2>
        <p>حالة الاتصال بواتساب:</p>
        <span class="badge ${isConnected ? 'connected' : 'disconnected'}">
          ${isConnected ? '✅ متصل ويعمل بنجاح في السحابة' : '⚠️ بانتظار مسح رمز QR'}
        </span>
        <br><br>
        ${
          !isConnected
            ? '<a href="/qr" class="btn">📱 مسح رمز QR من هاتفك</a>'
            : '<p style="color: #64748b;">البوت متصل ويستمع لطلبات التأكيد تلقائياً على مدار الساعة.</p>'
        }
      </div>
    </body>
    </html>
  `);
});

// صفحة مسح رمز الـ QR
app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.redirect('/');
  }

  if (!currentQR) {
    return res.send(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="refresh" content="3">
        <title>جاري تجهيز الرمز...</title>
      </head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
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
          body { font-family: system-ui, sans-serif; background: #f0fdf4; text-align: center; padding: 40px 20px; }
          .box { background: white; max-width: 420px; margin: auto; padding: 30px; border-radius: 24px; box-shadow: 0 4px 25px rgba(0,0,0,0.06); }
          img { width: 260px; height: 260px; }
          .instructions { text-align: right; background: #f8fafc; padding: 15px; border-radius: 12px; font-size: 13px; color: #475569; line-height: 1.8; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2 style="color: #15803d; margin-bottom: 5px;">📱 ربط واتساب السحابي</h2>
          <p style="color: #64748b; font-size: 13px;">امسح هذا الرمز مرة واحدة فقط من هاتفك</p>
          <img src="${qrImage}" alt="QR Code" />
          <div class="instructions">
            <b>طريقة المسح:</b><br>
            1. افتح تطبيق واتساب على هاتفك.<br>
            2. اضغط على القائمة (الثلاث نقاط) 👈 <b>الأجهزة المرتبطة</b>.<br>
            3. اضغط على <b>ربط جهاز</b> ووجّه الكاميرا إلى هذا الرمز.<br>
            <i>(يتم تحديث الرمز تلقائياً كل 15 ثانية).</i>
          </div>
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
