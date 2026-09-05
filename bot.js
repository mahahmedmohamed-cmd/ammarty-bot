/**
 * عمارتي - بوت التأكيد التلقائي عبر واتساب (مجاني 100%)
 * 
 * يستمع لرسائل واتساب الواردة. عندما يرسل المستخدم كود التحقق (5 أرقام)،
 * يتحقق البوت تلقائياً من رقم الراسل ويحدث قاعدة البيانات في سوبابايز فورياً!
 */

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

// إعدادات سوبابايز
const SUPABASE_URL = 'https://iowpdqulkujikzsjgebd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3BkcXVsa3VqaWt6c2pnZWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQ1NDYsImV4cCI6MjEwNDE3MDU0Nn0.26U1YKl_XFvTBu3r4jJJs5VrZr1vzr9DGrpgFsMTLEU';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 يرجى مسح رمز الـ QR التالي من تطبيق واتساب (الأجهزة المرتبطة):');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('⚠️ تم فقد الاتصال بواتساب. جاري إعادة الاتصال تلقائياً...');
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === 'open') {
      console.log('\n======================================================');
      console.log('✅ تم تسجيل الدخول والاتصال بواتساب بنجاح!');
      console.log('🤖 بوت عمارتي يعمل الآن ويستمع لرسائل التأكيد التلقائية...');
      console.log('======================================================\n');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // الاستماع للرسائل الواردة
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // تجاهل الرسائل الصادرة من البوت نفسه أو رسائل المجموعات
      if (!msg.message || msg.key.fromMe || msg.key.remoteJid.includes('@g.us')) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';

      // استخراج الكود المكون من 5 أرقام
      const match = text.match(/\b\d{5}\b/);
      if (!match) continue;

      const code = match[0];
      const senderJid = msg.key.remoteJid;
      const senderPhone = senderJid.replace(/[^\d]/g, '');

      console.log(`📩 استلام رسالة تحتوي على كود: ${code} من رقم: ${senderPhone}`);

      try {
        // 1. البحث في سوبابايز عن طلب يحتوي على هذا الكود
        const { data, error } = await supabase
          .from('building_settings')
          .select('building_id, value')
          .eq('key', 'whatsapp_reset_request');

        if (error || !data) continue;

        for (const row of data) {
          if (!row.value) continue;
          const req = JSON.parse(row.value);

          if (req.code === code && !req.is_verified) {
            // تحديث الطلب كـ مؤكد فورياً
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

            console.log(`🎉 نجاح! تم تأكيد عمارة: ${req.building_name} (${req.building_code}) لرقم: ${senderPhone}`);

            // الرد التلقائي على هاتف العميل
            await sock.sendMessage(senderJid, {
              text: `✅ مرحباً بك مسؤول عمارة ${req.building_name}!\nتم التحقق من رقم هاتفك بنجاح.\nتم فتح شاشة كتابة كلمة المرور الجديدة في التطبيق الآن.`,
            });
            break;
          }
        }
      } catch (err) {
        console.error('❌ خطأ أثناء معالجة الطلب:', err.message);
      }
    }
  });
}

connectToWhatsApp();
