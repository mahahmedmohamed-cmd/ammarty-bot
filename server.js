/**
 * عمارتي - السيرفر السحابي الموحد والمتكامل
 * (بوت واتساب الذكي + محرك الاستقبال والتفعيل الفوري للاشتراكات + الفواتير الرسمية)
 * خالي من أي تكاليف أو عمولات بنكية أو منصات مدفوعة (100% Free)
 */

const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, downloadMediaMessage } = require('@whiskeysockets/baileys');
const { createClient } = require('@supabase/supabase-js');
const QRCode = require('qrcode');
const pino = require('pino');
const fs = require('fs');
const path = require('path');
const { generateInvoiceHTML } = require('./invoice_template');
const { extractTextFromImage, parseReceiptData, matchReceiptWithCollision, normalizeDigits } = require('./receipt_scanner');
const { generateInvoicePDF, formatDate, tafqeetEgyptianPounds } = require('./pdf_generator');
const { getAIResponse } = require('./customer_service_ai');
const { isAdminUser, handleAdminMessage } = require('./admin_service');
const { handleTrialReminderResponse, checkAndSendTrialReminders } = require('./trial_reminder_service');

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

// مجلد حفظ جلسة واتساب
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

function logEvent(title, detail, type = 'info') {
  const item = {
    time: new Date().toLocaleTimeString('ar-EG'),
    title,
    detail,
    type
  };
  liveTransactions.unshift(item);
  if (liveTransactions.length > 50) liveTransactions.pop();
  console.log(`[${item.time}] [${type.toUpperCase()}] ${title}: ${typeof detail === 'object' ? JSON.stringify(detail) : detail}`);
}

// نظام التعافي التلقائي وحذف الجلسات المشفرة التالفة فور رصدها لمنع تعليق البوت
const originalConsoleError = console.error;
console.error = function(...args) {
  const msg = args.map(a => String(a && a.stack || a)).join(' ');
  if (msg.includes('Bad MAC') || msg.includes('Over 2000 messages into the future') || msg.includes('Failed to decrypt message')) {
    const match = msg.match(/(?:async\s+|session-)?(\d+\.\d+|\d{10,})/);
    if (match) {
      const sessionId = match[1];
      const sessionFile = path.join(AUTH_DIR, `session-${sessionId}.json`);
      if (fs.existsSync(sessionFile)) {
        try {
          fs.unlinkSync(sessionFile);
          logEvent('معالجة ذاتية لجلسة واتساب', `تم حذف الجلسة التالفة (${sessionId}) لإعادة التفاوض النظيف تلقائياً`, 'info');
        } catch (_) {}
      }
    }
  }
  originalConsoleError.apply(console, args);
};

// ==================== إرسال عرض هدية تقييم المتجر بعد التفعيل ====================
const sentReviewOffers = new Map(); // targetJid -> timestamp

async function sendPostActivationReviewOffer(targetJid, managerName, buildingName, buildingId = null) {
  if (!targetJid) return;

  // فحص عدم التكرار للعميل الواحد خلال 24 ساعة
  const lastSent = sentReviewOffers.get(targetJid);
  if (lastSent && (Date.now() - lastSent) < 24 * 60 * 60 * 1000) {
    return;
  }
  sentReviewOffers.set(targetJid, Date.now());

  setTimeout(async () => {
    try {
      if (!sock || !isConnected || !targetJid) return;

      // إذا كانت العمارة قد حصلت بالفعل على هدية التقييم، لا نطلب التقييم مرة أخرى
      if (buildingId) {
        const { data: revGift } = await supabase
          .from('building_settings')
          .select('value')
          .eq('building_id', buildingId)
          .eq('key', 'review_gift_claimed')
          .maybeSingle();

        if (revGift && revGift.value) {
          logEvent('تخطي عرض التقييم', `العمارة (${buildingName || buildingId}) حصلت على هدية التقييم مسبقاً`, 'info');
          return;
        }
      }

      const reviewMsg =
        `🎁 *عرض الهدية الكبرى لعمارتكم من أسرة "عمارتي"!* 🌟🏢\n\n` +
        `أستاذ *${managerName || 'المدير'}*، رأيكم وتقييمكم أنتم وسكان عمارتكم يسعدنا ويهمنا جداً! ⭐⭐⭐⭐⭐\n\n` +
        `إذا قام **3 أفراد من عمارتكم** (حضرتك و2 من السكان أو الملاك) بكتابة تقييم إيجابي (5 نجوم) للتطبيق على متجر Google Play، يسعدنا أن نهدي عمارتكم **شهرين إضافيين مجاناً (60 يوماً)** تُضاف كزيادة مباشرة فوق مدة اشتراككم المدفوع (مثال: اشتراك سنة يصبح 14 شهراً بالكامل)! 🥳🎁\n\n` +
        `📌 *توضيح:* هذه الهدية هي بونص إضافي خاص يُمنح زيادة فوق مدة الاشتراك الرسمي ولا تُمنح كفترة منفصلة بدون اشتراك رسمي.\n\n` +
        `📲 *رابط تقييم التطبيق على متجر Google Play:*\n` +
        `https://play.google.com/store/apps/details?id=com.ammarty.ammarty\n\n` +
        `📸 *طريقة استلام الهدية:*\n` +
        `شارك رابط التقييم مع جيرانك في العمارة، وفور إرسال سكرين شوت لـ 3 تقييمات هنا في المحادثة، سيتم تلقائياً تمديد صلاحية عمارتكم شهرين إضافيين فوراً! ✨`;

      await sock.sendMessage(targetJid, { text: reviewMsg });
      logEvent('تم إرسال عرض هدية تقييم المتجر بعد التفعيل', { to: targetJid, building: buildingName }, 'success');
    } catch (err) {
      logEvent('خطأ إرسال عرض تقييم المتجر', err.message, 'warning');
    }
  }, 3500);
}

// ==================== تحليل رسائل الواتساب الواردة ====================

function parseRenewalWhatsAppMessage(text) {
  if (!text) return null;
  
  // التحقق من احتواء النص على نية التفعيل/التجديد أو كود عمارة
  const hasKeyword = /تفعيل|تجديد|اشتراك|عمارتي/i.test(text);
  const codeMatch = text.match(/BLD-?[0-9]{4}/i) || text.match(/كود\s*العمارة\s*:?\s*([^\n\r•]+)/i);

  if (!hasKeyword && !codeMatch) return null;

  // استخراج كود العمارة
  let buildingCode = null;
  if (codeMatch) {
    const raw = codeMatch[1] || codeMatch[0];
    const digits = raw.match(/[0-9]{4}/);
    if (digits) buildingCode = 'BLD-' + digits[0];
  }
  if (!buildingCode) return null;

  // اسم العمارة
  const nameMatch = text.match(/•?\s*عمارة\s*:?\s*([^\n\r•]+)/i);
  const buildingName = nameMatch ? nameMatch[1].trim() : '';

  // مدة الاشتراك
  const yearsMatch = text.match(/(?:مدة\s*الاشتراك\s*:?|المدة\s*:?|\b)([0-9]+)\s*(?:سنة|سنوات|عام|أعوام)/i);
  const years = yearsMatch ? parseInt(yearsMatch[1], 10) : 1;

  // المبلغ المطلوب
  const amountMatch = text.match(/(?:إجمالي\s*المبلغ|المبلغ)\s*:?\s*([0-9]+(?:\.[0-9]+)?)/i);
  let amount = amountMatch ? parseFloat(amountMatch[1]) : (years >= 5 ? 700 : (years === 3 ? 480 : (years === 2 ? 360 : years * 200)));

  return { buildingCode, buildingName, years, amount };
}

// ==================== حفظ واستعادة جلسة واتساب سحابياً في Supabase ====================

async function backupAuthStateToSupabase() {
  try {
    if (!fs.existsSync(AUTH_DIR)) return;
    const files = fs.readdirSync(AUTH_DIR);
    if (files.length === 0) return;
    const bundle = {};
    for (const f of files) {
      const fullPath = path.join(AUTH_DIR, f);
      if (fs.statSync(fullPath).isFile()) {
        bundle[f] = fs.readFileSync(fullPath).toString('base64');
      }
    }
    await supabase.from('building_settings').upsert({
      building_id: 83,
      key: 'baileys_session_backup',
      value: JSON.stringify(bundle),
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('[Auth Sync] فشل حفظ الجلسة في سوبابايز:', err.message);
  }
}

async function restoreAuthStateFromSupabase() {
  try {
    const credsPath = path.join(AUTH_DIR, 'creds.json');
    if (fs.existsSync(credsPath)) return; // الجلسة موجودة محلياً بالفعل
    const { data, error } = await supabase
      .from('building_settings')
      .select('value')
      .eq('key', 'baileys_session_backup')
      .maybeSingle();
    if (error || !data || !data.value) return;
    const bundle = JSON.parse(data.value);
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    for (const f in bundle) {
      fs.writeFileSync(path.join(AUTH_DIR, f), Buffer.from(bundle[f], 'base64'));
    }
    logEvent('استعادة الجلسة', 'تمت استعادة جلسة واتساب السحابية من سوبابايز بنجاح دون الحاجة لرمز QR!', 'success');
  } catch (err) {
    console.error('[Auth Sync] فشل استعادة الجلسة من سوبابايز:', err.message);
  }
}

// ==================== إعداد وتشغيل اتصال واتساب ====================

async function initWhatsApp() {
  try {
    await restoreAuthStateFromSupabase();
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

    const msgRetryCounterCache = new Map();
    const retryCache = {
      get: (k) => msgRetryCounterCache.get(k),
      set: (k, v) => msgRetryCounterCache.set(k, v),
      del: (k) => msgRetryCounterCache.delete(k),
    };
    const messageStore = new Map();

    sock = makeWASocket({
      auth: state,
      logger: pino({ level: 'warn' }),
      printQRInTerminal: true,
      msgRetryCounterCache: retryCache,
      getMessage: async (key) => {
        return messageStore.get(key.id) || undefined;
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        currentQR = qr;
        isConnected = false;
        try {
          QRCode.toFile(path.join(__dirname, 'latest_qr.png'), qr, { width: 400 });
        } catch (_) {}
        logEvent('واتساب', 'تم إنشاء رمز QR جديد. تفضل بزيارة صفحة /qr لمسحه', 'warning');
      }

      if (connection === 'close') {
        isConnected = false;
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logEvent('واتساب', `فقد الاتصال (${statusCode || 'غير محدد'}). إعادة المحاولة...`, 'warning');
        if (shouldReconnect) {
          setTimeout(initWhatsApp, 4000);
        }
      } else if (connection === 'open') {
        isConnected = true;
        currentQR = null;
        logEvent('واتساب', '✅ متصل ويعمل بنجاح 24/7 جاهز للرد والإرسال التلقائي!', 'success');
        backupAuthStateToSupabase();
      }
    });

    sock.ev.on('creds.update', async () => {
      await saveCreds();
      backupAuthStateToSupabase();
    });

    const processedMsgIds = new Set();

    // استقبال ومعالجة رسائل واتساب (اللحظية notify، أو المتأخرة أثناء انقطاع البوت append)
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify' && type !== 'append') return;

      for (const msg of messages) {
        if (!msg.message || msg.key.remoteJid.includes('@g.us')) continue;

        // تجاهل الرسائل الصادرة من البوت للآخرين، مع السماح برسائل المدير في المحادثة الذاتية (Message Yourself)
        if (msg.key.fromMe && !isAdminUser(msg.key.remoteJid, '')) continue;

        // منع تكرار معالجة الرسائل ذات نفس المعرف (ID deduplication)
        if (msg.key?.id) {
          if (processedMsgIds.has(msg.key.id)) continue;
          processedMsgIds.add(msg.key.id);
          if (processedMsgIds.size > 2000) {
            const oldest = processedMsgIds.values().next().value;
            processedMsgIds.delete(oldest);
          }
          if (msg.message) {
            messageStore.set(msg.key.id, msg.message);
            if (messageStore.size > 2000) {
              const oldKey = messageStore.keys().next().value;
              messageStore.delete(oldKey);
            }
          }
        }

        // تجاهل الرسائل القديمة جداً (أكثر من 12 ساعة) لتجنب تكرار الرد على محادثات الأيام السابقة عند المزامنة
        const rawTs = msg.messageTimestamp;
        if (rawTs) {
          const msgSec = typeof rawTs === 'number' ? rawTs : (rawTs.low || Number(rawTs));
          if (msgSec && (Date.now() - (msgSec * 1000)) > 12 * 60 * 60 * 1000) {
            continue;
          }
        }

        const senderJid = msg.key.remoteJid;
        const cleanSenderPhone = senderJid.split('@')[0].split(':')[0].replace(/\D/g, '');
        const senderPhone = cleanSenderPhone;
        const text =
          msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          msg.message.imageMessage?.caption ||
          msg.message.videoMessage?.caption ||
          msg.message.documentMessage?.caption ||
          msg.message.viewOnceMessage?.message?.imageMessage?.caption ||
          msg.message.viewOnceMessageV2?.message?.imageMessage?.caption ||
          '';

        const isImage = !!(
          msg.message?.imageMessage ||
          msg.message?.viewOnceMessage?.message?.imageMessage ||
          msg.message?.viewOnceMessageV2?.message?.imageMessage ||
          (msg.message?.documentMessage?.mimetype?.startsWith('image/'))
        );

        // ==================== 0. التحقق من مدير ومطور النظام (المهندس محمود أحمد) ====================
        if (isAdminUser(senderJid, senderPhone)) {
          logEvent('مدير ومطور النظام (م. محمود)', { from: senderPhone, text: text.slice(0, 80), isImage }, 'success');
          try {
            await handleAdminMessage({
              sock,
              msg,
              senderJid,
              senderPhone,
              text,
              isImage,
              supabase,
              logEvent
            });
          } catch (admErr) {
            logEvent('خطأ معالجة رسالة المدير', admErr.message, 'error');
            await sock.sendMessage(senderJid, {
              text: `أهلاً بحضرتك يا باشمهندس محمود 👑\nحدث خطأ غير متوقع أثناء معالجة الطلب: ${admErr.message}.\nالسيرفر يعمل بكامل كفاءته ويمكنك المحاولة مجدداً.`
            });
          }
          continue;
        }

        logEvent('رسالة واتساب واردة', { from: senderPhone, text: text.slice(0, 80) });

        // ---------- 1. فحص طلب تفعيل/تجديد الاشتراك من التطبيق ----------
        const renewal = parseRenewalWhatsAppMessage(text);
        if (renewal) {
          logEvent('طلب تجديد اشتراك تم رصده', renewal);

          try {
            // البحث عن العمارة في سوبابايز
            const { data: bldList, error: bldErr } = await supabase
              .from('buildings')
              .select('*')
              .eq('code', renewal.buildingCode);

            if (bldErr || !bldList || bldList.length === 0) {
              logEvent('تنبيه عمارة', `لم يتم العثور على عمارة بالكود: ${renewal.buildingCode}`, 'warning');
              await sock.sendMessage(senderJid, {
                text: `أهلاً بك أخي الكريم 🏢\nلم نتمكن من العثور على عمارة مسجلة بالكود (*${renewal.buildingCode}*).\nيرجى التأكد من كود العمارة داخل تطبيق عمارتي والمحاولة مرة أخرى.`
              });
              continue;
            }

            const building = bldList[0];

            // تسجيل طلب التجديد المعلق في سوبابايز
            const orderPayload = {
              building_id: building.id,
              building_code: building.code,
              building_name: building.name,
              manager_name: building.manager_name,
              manager_phone: building.manager_phone,
              sender_phone: senderPhone,
              sender_jid: senderJid,
              years_count: renewal.years,
              expected_amount: renewal.amount,
              status: 'pending',
              requested_at: new Date().toISOString()
            };

            await supabase
              .from('building_settings')
              .upsert({
                building_id: building.id,
                key: 'pending_renewal_order',
                value: JSON.stringify(orderPayload),
                updated_at: new Date().toISOString()
              });

            logEvent('تم تسجيل الطلب المعلق', `عمارة: ${building.name} (${building.code}) - مطلوب: ${renewal.amount} ج.م`);

            // الرد التلقائي الذكي على العميل ببيانات التحويل
            const yearsText = renewal.years === 1 ? 'سنة واحدة' : `${renewal.years} سنوات`;
            const replyMsg =
              `أهلاً بك أستاذ ${building.manager_name || 'المدير'} 🏢✨\n\n` +
              `تم بنجاح تسجيل طلب تفعيل اشتراك عمارتكم الموقرة (*${building.name}* - كود: *${building.code}*).\n\n` +
              `📋 *تفاصيل الطلب:*\n` +
              `• مدة الترخيص: *${yearsText}*\n` +
              `• القيمة الإجمالية: *${renewal.amount} ج.م*\n\n` +
              `💳 *بيانات السداد المعتمدة للتفعيل الفوري:*\n` +
              `• *فودافون كاش:* 01021252626\n` +
              `• *إنستاباي (InstaPay):* 01021252626\n\n` +
              `⚡ *ملاحظة هامة:* النظام مربوط آلياً مع السيرفر، فور إتمامك للتحويل سيتم التعرف على الدفعة وتفعيل اشتراك عمارتكم تلقائياً، وإصدار الفاتورة الرسمية المعتمدة وإرسالها لك هنا فوراً دون أي انتظار! 🚀`;

            await sock.sendMessage(senderJid, { text: replyMsg });
            logEvent('تم إرسال تعليمات الدفع', senderPhone, 'success');
            continue;
          } catch (err) {
            logEvent('خطأ معالجة التجديد', err.message, 'error');
          }
        }

        // ---------- 2. فحص إرسال صورة إيصال التحويل (OCR) أو إشعار سداد معلق ----------
        const isProofText = /(?:تم\s*التحويل|حولت|دفعت|تم\s*الدفع|مرفق\s*(?:إشعار|الايصال|الإيصال|الوصل)|المرجع|رقم\s*المعاملة|رقم\s*العملية)/i.test(text) ||
                            /\b(0244\d{8}|9d6e\w{4}|\d{10,16})\b/i.test(text);

        if (isImage || isProofText) {
          try {
            let ocrText = '';
            if (isImage) {
              try {
                const buffer = await downloadMediaMessage(msg, 'buffer', {});
                if (buffer) {
                  logEvent('بدء تحليل OCR للصورة الواردة', senderPhone);
                  ocrText = await extractTextFromImage(buffer);
                  logEvent('نتائج استخراج النصوص OCR', ocrText.slice(0, 150));
                }
              } catch (ocrErr) {
                logEvent('خطأ أثناء قراءة الصورة الواردة', ocrErr.message, 'warning');
              }
            }

            // فحص هل الصورة أو الرسالة هي سكرين شوت تقييم متجر Google Play
            const combinedContent = (text + ' ' + ocrText).toLowerCase();
            const isReviewIntent = /(?:تقييم|ريفيو|review|مراجعة|خمس\s*نجوم|5\s*نجوم|جوجل\s*بلاي|google\s*play|المتجر|سكرين\s*(?:التقييم|شوت)|قيمت|نجوم)/i.test(text);
            const isOcrReview = /(?:google\s*play|play\s*store|متجر|تقييم|مراجعة|خمس\s*نجوم|5\s*نجوم|stars|review|عمارتي)/i.test(ocrText);
            const hasPaymentMarkers = /(?:مبلغ|تحويل|جنيه|egp|instapay|فودافون\s*كاش|دفعت|محفظة|01021252626|alexbank|cib|بنك)/i.test(combinedContent);

            if ((isReviewIntent || isOcrReview) && !hasPaymentMarkers) {
              logEvent('تم رصد سكرين شوت تقييم المتجر', senderPhone, 'info');

              // 1. استخراج الأرقام لتحديد هوية العميل
              const cleanPhone = senderPhone.replace(/^20/, '0');
              const short9 = cleanPhone.slice(-9);

              // 2. البحث عن عمارة العميل
              // أ) البحث في مديري العمارات
              const { data: bldCandidates } = await supabase
                .from('buildings')
                .select('*, building_subscriptions(*)')
                .or(`manager_phone.eq.${senderPhone},manager_phone.eq.${cleanPhone},manager_phone.eq.+20${cleanPhone.slice(1)}`)
                .order('id', { ascending: false });

              let matchedBld = bldCandidates && bldCandidates.length > 0 ? bldCandidates[0] : null;
              let reviewerRole = 'مدير العمارة';
              let matchedResidentApt = null;
              let isManager = !!matchedBld;

              // ب) إذا لم يكن مديراً، البحث في جدول السكان والشقق (apartments)
              if (!matchedBld) {
                const { data: aptCandidates } = await supabase
                  .from('apartments')
                  .select('building_id, apt_number, owner_name, phone')
                  .ilike('phone', `%${short9}%`)
                  .limit(1);

                if (aptCandidates && aptCandidates.length > 0) {
                  matchedResidentApt = aptCandidates[0];
                  const { data: aptBld } = await supabase
                    .from('buildings')
                    .select('*, building_subscriptions(*)')
                    .eq('id', matchedResidentApt.building_id)
                    .maybeSingle();

                  if (aptBld) {
                    matchedBld = aptBld;
                    reviewerRole = `الساكن / شقة ${matchedResidentApt.apt_number || ''}`;
                    isManager = false;
                  }
                }
              }

              // ج) البحث عبر كود العمارة إذا ذكره العميل في النص أو الكابشن
              if (!matchedBld && text) {
                const codeMatch = text.match(/BLD-?[0-9]{4}/i) || text.match(/[0-9]{4}/);
                if (codeMatch) {
                  const digits = codeMatch[0].match(/[0-9]{4}/);
                  if (digits) {
                    const codeStr = 'BLD-' + digits[0];
                    const { data: codeBld } = await supabase
                      .from('buildings')
                      .select('*, building_subscriptions(*)')
                      .eq('code', codeStr)
                      .maybeSingle();

                    if (codeBld) {
                      matchedBld = codeBld;
                      reviewerRole = 'ساكن بالعمارة';
                      isManager = codeBld.manager_phone && codeBld.manager_phone.replace(/\D/g, '').endsWith(short9);
                    }
                  }
                }
              }

              // إذا تعذر تحديد العمارة إطلاقاً
              if (!matchedBld) {
                const guestThanksMsg =
                  `🎉 *شكراً جزيلاً لذوقكم وتقييمكم الرائع لتطبيق عمارتي على المتجر!* ⭐⭐⭐⭐⭐\n\n` +
                  `تم استلام سكرين شوت التقييم بنجاح 📸\n\n` +
                  `لحساب هذا التقييم ضمن تحدي عمارتكم (*3 تقييمات لكسب شهرين مجاناً 60 يوماً* لعمارتكم بالكامل)، يرجى كتابة *كود العمارة (مثل: BLD-1234)* أو *اسم العمارة المسجلة* لربط التقييم بعمارتكم واحتسابه فوراً في العداد! 🏢✨`;
                await sock.sendMessage(senderJid, { text: guestThanksMsg });
                logEvent('تم استلام سكرين شوت تقييم لعميل غير محدد الكود', senderPhone, 'info');
                continue;
              }

              // 3. فحص هل حصلت العمارة بالفعل على هدية التقييم مسبقاً
              const { data: claimedRow } = await supabase
                .from('building_settings')
                .select('value')
                .eq('building_id', matchedBld.id)
                .eq('key', 'review_gift_claimed')
                .maybeSingle();

              if (claimedRow && claimedRow.value) {
                const alreadyClaimedMsg =
                  `🎉 *شكراً جزيلاً لكم ولدعمكم المستمر!* ⭐⭐⭐⭐⭐\n\n` +
                  `عمارة (*${matchedBld.name}* - كود: *${matchedBld.code}*) قد حصلت بالفعل على هدية التقييم الكاملة (**شهرين مجاناً - 60 يوماً**) مسبقاً! 🥳🎁\n\n` +
                  `نعتز ونفخر جداً بثقتكم ووجودكم معنا في عائلة عمارتي 🏢✨`;
                await sock.sendMessage(senderJid, { text: alreadyClaimedMsg });
                logEvent('العمارة حصلت على الهدية مسبقاً', { building: matchedBld.code, phone: senderPhone }, 'info');
                continue;
              }

              // 4. قراءة سجل العداد الحالي للتقييمات
              const { data: progRow } = await supabase
                .from('building_settings')
                .select('value')
                .eq('building_id', matchedBld.id)
                .eq('key', 'review_gift_progress')
                .maybeSingle();

              let progress = { count: 0, reviews: [] };
              if (progRow && progRow.value) {
                try {
                  progress = JSON.parse(progRow.value);
                } catch (_) {}
              }
              if (!Array.isArray(progress.reviews)) {
                progress.reviews = [];
              }

              // 5. التحقق من منع تكرار نفس الرقم
              const alreadyReviewed = progress.reviews.some(r => {
                const rShort = String(r.phone || r.clean_phone || '').replace(/\D/g, '').slice(-9);
                return rShort === short9;
              });

              if (alreadyReviewed) {
                const currentCount = progress.reviews.length;
                const remainingCount = Math.max(0, 3 - currentCount);
                const duplicateMsg =
                  `🎉 *شكراً جزيلاً لحرصكم وذوقكم الراقي!* ⭐⭐⭐⭐⭐\n\n` +
                  `لقد قمت بالفعل بتسجيل تقييمك لصالح عمارة (*${matchedBld.name}* - كود: *${matchedBld.code}*) مسبقاً وهو محسوب في العداد ✅\n\n` +
                  `📊 *حالة تحدي الهدية لعمارتكم حتى الآن:*\n` +
                  `• المنجز: *${currentCount} من أصل 3 تقييمات* 🌟\n` +
                  `• المطلوب: متبقي *${remainingCount} ${remainingCount === 1 ? 'تقييم واحد فقط' : 'تقييمين'} من جيرانكم في العمارة* لتفعيل الشهرين المجانيين (60 يوماً) لعمارتكم بالكامل! 🎁🏢\n\n` +
                  `📲 شجع جيرانك وباقي سكان العمارة على كتابة تقييمهم وإرسال السكرين شوت هنا لإكمال التحدي:\n` +
                  `https://play.google.com/store/apps/details?id=com.ammarty.ammarty`;

                await sock.sendMessage(senderJid, { text: duplicateMsg });
                logEvent('تقييم مكرر لنفس الرقم', { building: matchedBld.code, phone: senderPhone }, 'info');
                continue;
              }

              // 6. إضافة التقييم الجديد للعداد وحفظه
              progress.reviews.push({
                phone: senderPhone,
                clean_phone: cleanPhone,
                role: reviewerRole,
                submitted_at: new Date().toISOString()
              });
              progress.count = progress.reviews.length;

              await supabase
                .from('building_settings')
                .upsert({
                  building_id: matchedBld.id,
                  key: 'review_gift_progress',
                  value: JSON.stringify(progress),
                  updated_at: new Date().toISOString()
                });

              // فحص هل تمتلك العمارة اشتراكاً رسمياً مدفوعاً أم أنها ما زالت في فترة التجربة المجانية
              const currentSubscriptions = matchedBld.building_subscriptions || [];
              const paidSubs = currentSubscriptions.filter(s => s.is_trial === false && (Number(s.price_paid) > 0 || Number(s.years_count) > 0));
              paidSubs.sort((a, b) => new Date(b.expiry_date || 0) - new Date(a.expiry_date || 0));
              const activePaidSub = paidSubs.length > 0 ? paidSubs[0] : null;
              const hasPaidPlan = !!activePaidSub;

              // 7. إذا كان العداد أقل من 3 (التقييم الأول أو الثاني)
              if (progress.count < 3) {
                const remaining = 3 - progress.count;
                let progressMsg = '';

                if (hasPaidPlan) {
                  progressMsg =
                    `🎉 *شكراً جزيلاً لذوقكم وتقييمكم الرائع لتطبيق عمارتي!* ⭐⭐⭐⭐⭐\n\n` +
                    `تم بنجاح توثيق تقييمكم لصالح عمارة (*${matchedBld.name}* - كود: *${matchedBld.code}*)! 🥳✨\n\n` +
                    `📊 *عداد تحدي الهدية الكبرى:*\n` +
                    `✅ تم تسجيل: *${progress.count} من أصل 3 تقييمات* (${reviewerRole}) 🌟\n` +
                    `⏳ متبقي: *${remaining} ${remaining === 1 ? 'تقييم واحد فقط' : 'تقييمين'} من جيرانكم في العمارة* لتفعيل الهدية (**شهرين إضافيين مجاناً - 60 يوماً**) كزيادة رسمية فوق مدة اشتراككم المدفوع الحالي! 🎁🏢\n\n` +
                    `📲 شاركوا رابط التطبيق مع باقي السكان في جروب العمارة ليقوموا بالتقييم وإرسال السكرين شوت هنا:\n` +
                    `https://play.google.com/store/apps/details?id=com.ammarty.ammarty\n\n` +
                    `خطوة واحدة تفصلكم عن الهدية! 🚀`;
                } else {
                  progressMsg =
                    `🎉 *شكراً جزيلاً لذوقكم وتقييمكم الرائع لتطبيق عمارتي!* ⭐⭐⭐⭐⭐\n\n` +
                    `تم بنجاح توثيق تقييمكم لصالح عمارة (*${matchedBld.name}* - كود: *${matchedBld.code}*)! 🥳✨\n\n` +
                    `📊 *عداد تحدي الهدية المسجل لعمارتكم:*\n` +
                    `✅ تم تسجيل: *${progress.count} من أصل 3 تقييمات* (${reviewerRole}) 🌟\n` +
                    `⏳ متبقي: *${remaining} ${remaining === 1 ? 'تقييم واحد فقط' : 'تقييمين'} من جيرانكم في العمارة* لاكتمال التحدي! 🎁🏢\n\n` +
                    `⚠️ *توضيح هام بخصوص الهدية:* 🎁\n` +
                    `هدية **الشهرين الإضافيين (60 يوماً)** هي ميزة خاصة تُمنح **زيادة فوق مدة الاشتراك الرسمي المدفوع** عند الاشتراك في أي باقة رسمية (سنة، سنتين، 3 سنوات) ولا تُمنح كفترة منفصلة بدون اشتراك رسمي.\n` +
                    `بمجرد اشتراك وتفعيل عمارتكم، ستتم تلقائياً إضافة الشهرين الهدية كزيادة فورية فوق مدة باقتكم (مثال: اشتراك سنة = 14 شهراً بالكامل)! 🏢✨\n\n` +
                    `📲 شاركوا رابط التطبيق مع باقي السكان ليقوموا بالتقييم لإكمال التحدي:\n` +
                    `https://play.google.com/store/apps/details?id=com.ammarty.ammarty`;
                }

                await sock.sendMessage(senderJid, { text: progressMsg });
                logEvent('تم تسجيل تقييم جديد في التحدي', { building: matchedBld.code, count: progress.count, phone: senderPhone }, 'success');

                // إشعار لمدير العمارة إذا كان المقيم شخصاً آخر غير المدير
                if (!isManager && matchedBld.manager_phone) {
                  try {
                    const mgrPhoneClean = matchedBld.manager_phone.replace(/\D/g, '').replace(/^0/, '20');
                    const mgrJid = `${mgrPhoneClean}@s.whatsapp.net`;
                    const mgrNotifyMsg =
                      `📢 *إشعار تحدي الهدية لعمارة (${matchedBld.name})* 🏢\n\n` +
                      `أستاذ *${matchedBld.manager_name || 'المدير'}*، قام أحد سكان عمارتكم (${reviewerRole}) للتو بإرسال تقييم 5 نجوم على Google Play! ⭐⭐⭐⭐⭐\n\n` +
                      `📊 العداد الحالي: *${progress.count} من 3 تقييمات*\n` +
                      `⏳ متبقي فقط: *${remaining} تقييم* لكسب **شهرين زيادة فوق الاشتراك المدفوع (60 يوماً)** لعمارتكم بالكامل!\n\n` +
                      `شجع باقي السكان ليكتبوا تقييمهم ويرسلوا السكرين شوت هنا في الشات 🚀`;
                    await sock.sendMessage(mgrJid, { text: mgrNotifyMsg });
                  } catch (errMgr) {
                    logEvent('تعذر إرسال إشعار التقييم للمدير', errMgr.message, 'warning');
                  }
                }
                continue;
              }

              // 8. اكتمل التحدي! وصول التقييم رقم 3! 🥳🎉
              if (hasPaidPlan) {
                // العمارة مشتركة بالفعل باشتراك مدفوع -> تمديد 60 يوماً فوراً فوق اشتراكها
                const baseDate = activePaidSub.expiry_date
                  ? new Date(Math.max(new Date(activePaidSub.expiry_date).getTime(), Date.now()))
                  : new Date();

                const newExpiry = new Date(baseDate);
                newExpiry.setDate(newExpiry.getDate() + 60);

                await supabase
                  .from('building_subscriptions')
                  .update({
                    expiry_date: newExpiry.toISOString(),
                    notes: (activePaidSub.notes ? activePaidSub.notes + ' | ' : '') + 'تمت إضافة هدية شهرين مجاناً (60 يوماً) زيادة فوق الاشتراك الرسمي بعد اكتمال 3 تقييمات'
                  })
                  .eq('id', activePaidSub.id);

                await supabase.from('buildings').update({ is_active: true }).eq('id', matchedBld.id);

                await supabase
                  .from('building_settings')
                  .upsert({
                    building_id: matchedBld.id,
                    key: 'review_gift_claimed',
                    value: JSON.stringify({
                      status: 'claimed',
                      bonus_days: 60,
                      building_id: matchedBld.id,
                      building_code: matchedBld.code,
                      building_name: matchedBld.name,
                      manager_name: matchedBld.manager_name,
                      manager_phone: matchedBld.manager_phone,
                      reviewers: progress.reviews,
                      claimed_at: new Date().toISOString(),
                      new_expiry: newExpiry.toISOString(),
                      note: 'تم تفعيل هدية شهرين مجاناً (60 يوماً) زيادة فوق الاشتراك الرسمي بعد اكتمال 3 تقييمات'
                    }),
                    updated_at: new Date().toISOString()
                  });

                const formattedNewExpiry = formatDate(newExpiry);

                // إرسال رسالة التهنئة الكبرى لصاحب التقييم الثالث
                const goalAchievedMsg =
                  `🎉🎊 *ألف مبرووووك! اكتمل تحدي التقييم لعمارتكم بنجاح!* 🌟⭐⭐⭐⭐⭐\n\n` +
                  `بفضل تقييمكم المميز، اكتمل الآن تقييم **3 أفراد من عمارة (*${matchedBld.name}* - كود: *${matchedBld.code}*)** على متجر Google Play! 🥳✨\n\n` +
                  `🎁 *تم رسمياً تفعيل الهدية لعمارتكم:* **شهرين إضافيين مجاناً (60 يوماً)**.\n` +
                  `📅 تمت إضافتها كزيادة رسمية فوق مدة اشتراككم المدفوع الحالي ليصبح تاريخ الانتهاء الجديد: *${formattedNewExpiry}* في تطبيق عمارتي دون أي تكلفة إضافية! 🏢🎉\n\n` +
                  `كل الشكر والتقدير لكم ولجميع جيرانكم في العمارة على هذا الدعم الرائع 🚀`;

                await sock.sendMessage(senderJid, { text: goalAchievedMsg });

                // إشعار مدير العمارة إذا كان شخصاً آخر
                if (!isManager && matchedBld.manager_phone) {
                  try {
                    const mgrPhoneClean = matchedBld.manager_phone.replace(/\D/g, '').replace(/^0/, '20');
                    const mgrJid = `${mgrPhoneClean}@s.whatsapp.net`;
                    const mgrCelebrationMsg =
                      `🎉🎊 *بشرى سارة لمدير العمارة أستاذ ${matchedBld.manager_name || 'المدير'}!* 🌟🏢\n\n` +
                      `يسعدنا إبلاغ سيادتكم باكتمال تحدي الهدية لعمارة (*${matchedBld.name}*) بتسجيل **3 تقييمات 5 نجوم** من سكان وإدارة العمارة على متجر Google Play! ⭐⭐⭐⭐⭐\n\n` +
                      `🎁 *تم تفعيل الهدية رسمياً:* **شهرين إضافيين مجاناً (60 يوماً)** أُضيفت كزيادة رسمية فوق مدة اشتراككم المدفوع ليصبح تاريخ الانتهاء الجديد: *${formattedNewExpiry}*! 🥳✨\n\n` +
                      `دمتم في أمان الله ورعايته، وتمنياتنا لجميع السكان بتجربة ممتازة 🌸`;
                    await sock.sendMessage(mgrJid, { text: mgrCelebrationMsg });
                  } catch (errMgr) {}
                }

                // إشعار لمدير النظام والمالك م/ محمود أحمد (01021252626)
                try {
                  const adminJid = '201021252626@s.whatsapp.net';
                  const adminMsg =
                    `🎁 *إشعار نظام: اكتمال تحدي تقييم المتجر وتفعيل الهدية (شهرين زيادة)* 🏢\n\n` +
                    `• العمارة: *${matchedBld.name}* (${matchedBld.code})\n` +
                    `• المدير: ${matchedBld.manager_name} (${matchedBld.manager_phone})\n` +
                    `• المنجز: 3 تقييمات مكتملة ✅\n` +
                    `• تاريخ الانتهاء الجديد: *${formattedNewExpiry}*\n` +
                    `• تمت إضافة 60 يوماً زيادة فوق الاشتراك المدفوع بنجاح.`;
                  await sock.sendMessage(adminJid, { text: adminMsg });
                } catch (errAdmin) {}

                logEvent('تم اكتمال تحدي تقييم المتجر وتفعيل شهرين زيادة فوق الاشتراك المدفوع', { building: matchedBld.code }, 'success');
              } else {
                // العمارة لم تشترك بعد (ما زالت تجربة مجانية أو غير مدفوعة)
                // يتم حجز الهدية رسمياً وإضافتها تلقائياً فور سداد الاشتراك
                await supabase
                  .from('building_settings')
                  .upsert({
                    building_id: matchedBld.id,
                    key: 'review_gift_pending_subscription',
                    value: JSON.stringify({
                      status: 'ready_for_bonus',
                      bonus_days: 60,
                      building_id: matchedBld.id,
                      building_code: matchedBld.code,
                      building_name: matchedBld.name,
                      manager_name: matchedBld.manager_name,
                      manager_phone: matchedBld.manager_phone,
                      reviewers: progress.reviews,
                      completed_at: new Date().toISOString(),
                      note: 'اكتملت 3 تقييمات وجاهزة للإضافة فور سداد الاشتراك الرسمي المدفوع'
                    }),
                    updated_at: new Date().toISOString()
                  });

                const pendingSubNotice =
                  `🎉🎊 *رائع جداً! اكتمل تحدي التقييم لعمارتكم بنجاح (3 من 3 تقييمات)!* 🌟⭐⭐⭐⭐⭐\n\n` +
                  `أستاذ *${matchedBld.manager_name || 'المدير'}*، تم بنجاح توثيق تقييمات الـ 3 أفراد وحجز هدية عمارتكم (*${matchedBld.name}* - كود: *${matchedBld.code}*): **شهرين إضافيين مجاناً (60 يوماً)** في حسابكم! 🥳🎁\n\n` +
                  `📌 *توضيح هام لتفعيل الهدية:* 🎁\n` +
                  `نظام الهدية يمنح الشهرين **زيادة فوق مدة الاشتراك الرسمي المدفوع** لعمارتكم (ولا يُمنح كفترة منفصلة بدون اشتراك رسمي).\n` +
                  `لذلك، بمجرد اشتراككم في أي باقة رسمية (سنة، سنتين، 3 سنوات)، سيقوم النظام آلياً بإضافة الشهرين الهدية كزيادة فورية فوق مدة الاشتراك مباشرة (مثال: باقة سنة = 14 شهراً بالكامل)! 🏢✨\n\n` +
                  `📋 *باقات الاشتراك الرسمية لعمارتكم:*\n` +
                  `• سنة: 200 ج.م (+ شهرين هدية = 14 شهراً) 🌟\n` +
                  `• سنتان: 360 ج.م (+ شهرين هدية = 26 شهراً)\n` +
                  `• 3 سنوات: 480 ج.م (+ شهرين هدية = 38 شهراً)\n\n` +
                  `💳 التحويل عبر إنستاباي أو فودافون كاش على الرقم المعتمد: *01021252626*\n` +
                  `وفور إرسال إيصال التحويل، سيتم فورياً تفعيل الاشتراك الرسمي شاملاً الشهرين الهدية معاً! 🚀`;

                await sock.sendMessage(senderJid, { text: pendingSubNotice });

                if (!isManager && matchedBld.manager_phone) {
                  try {
                    const mgrPhoneClean = matchedBld.manager_phone.replace(/\D/g, '').replace(/^0/, '20');
                    const mgrJid = `${mgrPhoneClean}@s.whatsapp.net`;
                    await sock.sendMessage(mgrJid, { text: pendingSubNotice });
                  } catch (errMgr) {}
                }

                try {
                  const adminJid = '201021252626@s.whatsapp.net';
                  const adminMsg =
                    `🎁 *إشعار نظام: اكتمل تحدي التقييم (بانتظار تفعيل الاشتراك الرسمي)* 🏢\n\n` +
                    `• العمارة: *${matchedBld.name}* (${matchedBld.code})\n` +
                    `• المدير: ${matchedBld.manager_name} (${matchedBld.manager_phone})\n` +
                    `• المنجز: 3 تقييمات مكتملة ومحجوزة لإضافة 60 يوماً زيادة فور سداد الاشتراك المدفوع ✅`;
                  await sock.sendMessage(adminJid, { text: adminMsg });
                } catch (errAdmin) {}

                logEvent('اكتملت 3 تقييمات وبانتظار سداد الاشتراك لإضافة الشهرين', { building: matchedBld.code }, 'info');
              }
              continue;
            }

            // إذا لم تكن سكرين شوت تقييم، فهي إيصال تحويل مالي
            if (isImage) {
              await sock.sendMessage(senderJid, {
                text: `⏳ تم استلام صورة الإيصال بنجاح وجاري التأكد من معلومات الدفع بالحساب`
              });
            }

            const receiptData = parseReceiptData(ocrText, text);
            logEvent('بيانات الإيصال المحللة', {
              amount: receiptData.amount,
              reference: receiptData.reference,
              recipientOk: receiptData.isAuthorizedRecipient,
              method: receiptData.paymentMethod
            });

            // جلب طلبات التجديد المعلقة من سوبابايز
            const { data: pendingRows } = await supabase
              .from('building_settings')
              .select('building_id, value, updated_at')
              .eq('key', 'pending_renewal_order');

            const pendingOrders = [];
            if (pendingRows) {
              for (const r of pendingRows) {
                try {
                  const o = JSON.parse(r.value);
                  if (o.status === 'pending') {
                    o._row_updated_at = r.updated_at;
                    pendingOrders.push(o);
                  }
                } catch (_) {}
              }
            }

            // جلب سجلات رسائل البنوك الحقيقية من سوبابايز للتحقق الأمني
            const { data: bankRows } = await supabase
              .from('building_settings')
              .select('building_id, key, value')
              .like('key', 'bank_txn_%');

            const bankTransactions = [];
            if (bankRows) {
              for (const r of bankRows) {
                try {
                  const b = JSON.parse(r.value);
                  b._key = r.key;
                  bankTransactions.push(b);
                } catch (_) {}
              }
            }

            // جلب أي دفعات محجوزة بسبب التزامن (Ambiguous Payments)
            const { data: ambRows } = await supabase
              .from('building_settings')
              .select('building_id, key, value')
              .like('key', 'ambiguous_payment_%');

            const ambiguousPayments = [];
            if (ambRows) {
              for (const r of ambRows) {
                try {
                  const amb = JSON.parse(r.value);
                  amb._key = r.key;
                  ambiguousPayments.push(amb);
                } catch (_) {}
              }
            }

            // مطابقة الإيصال مع المعاملات البنكية الفعلية والطلبات المعلقة
            const match = matchReceiptWithCollision({
              receiptData,
              senderPhone,
              senderJid,
              userText: text,
              pendingOrders,
              ambiguousPayments,
              bankTransactions
            });

            if (match.isConfirmed && match.clientOrder) {
              const matchedOrder = match.clientOrder;
              const { data: bldList } = await supabase
                .from('buildings')
                .select('*')
                .eq('id', matchedOrder.building_id);

              if (bldList && bldList.length > 0) {
                const building = bldList[0];
                const resolvedTxnId = match.matchedBankTxn?.transaction_id || match.matchedAmbiguous?.transaction_id || receiptData.reference || ('REF-' + Date.now().toString().slice(-6));
                const paidAmount = match.matchedBankTxn?.amount || match.matchedAmbiguous?.amount || receiptData.amount || matchedOrder.expected_amount || 200;
                const payMethod = match.matchedBankTxn?.payment_method || match.matchedAmbiguous?.payment_method || receiptData.paymentMethod || 'InstaPay';
                const yearsCount = matchedOrder.years_count || 1;

                const startDate = new Date();
                const expiryDate = new Date();
                expiryDate.setFullYear(startDate.getFullYear() + yearsCount);

                // فحص هل العمارة مؤهلة لهدية التقييم (شهرين إضافيين زيادة فوق مدة الاشتراك)
                const { data: revGiftRows } = await supabase
                  .from('building_settings')
                  .select('key, value')
                  .eq('building_id', building.id)
                  .in('key', ['review_gift_claimed', 'review_gift_progress', 'review_gift_pending_subscription']);

                const hasClaimedGift = revGiftRows?.some(r => r.key === 'review_gift_claimed');
                const progRow = revGiftRows?.find(r => r.key === 'review_gift_progress');
                const pendGiftRow = revGiftRows?.find(r => r.key === 'review_gift_pending_subscription');

                let earnedReviewBonus = false;
                if (!hasClaimedGift) {
                  let pCount = pendGiftRow ? 3 : 0;
                  if (progRow && progRow.value) {
                    try {
                      const p = JSON.parse(progRow.value);
                      pCount = Math.max(pCount, p.count || (p.reviews ? p.reviews.length : 0));
                    } catch (_) {}
                  }
                  if (pCount >= 3) {
                    earnedReviewBonus = true;
                    expiryDate.setDate(expiryDate.getDate() + 60); // إضافة 60 يوماً زيادة فوق مدة الاشتراك
                  }
                }

                // 1. تفعيل الاشتراك في سوبابايز
                const { data: subData } = await supabase
                  .from('building_subscriptions')
                  .insert([{
                    building_id: building.id,
                    years_count: yearsCount,
                    price_paid: paidAmount,
                    payment_method: payMethod,
                    start_date: startDate.toISOString(),
                    expiry_date: expiryDate.toISOString(),
                    is_active: true,
                    is_trial: false,
                    notes: `تفعيل ذكي مؤكد عبر مطابقة التحويل البنكي الفعلي (مرجع: ${resolvedTxnId})` + (earnedReviewBonus ? ' + شهرين زيادة هدية اكتمال 3 تقييمات' : '')
                  }])
                  .select();

                if (earnedReviewBonus) {
                  await supabase
                    .from('building_settings')
                    .upsert({
                      building_id: building.id,
                      key: 'review_gift_claimed',
                      value: JSON.stringify({
                        status: 'claimed',
                        bonus_days: 60,
                        building_id: building.id,
                        building_code: building.code,
                        claimed_at: new Date().toISOString(),
                        new_expiry: expiryDate.toISOString(),
                        note: 'تم تفعيل هدية شهرين إضافيين مع الاشتراك المدفوع بعد اكتمال 3 تقييمات'
                      }),
                      updated_at: new Date().toISOString()
                    });
                }

                const newSubId = (subData && subData[0]) ? subData[0].id : Date.now().toString().slice(-4);
                await supabase.from('buildings').update({ is_active: true }).eq('id', building.id);

                // 2. تحديث الطلب المعلق إلى مكتمل
                matchedOrder.status = 'completed';
                matchedOrder.activated_at = new Date().toISOString();
                matchedOrder.subscription_id = newSubId;
                matchedOrder.paid_amount = paidAmount;
                matchedOrder.transaction_id = resolvedTxnId;

                await supabase
                  .from('building_settings')
                  .upsert({
                    building_id: building.id,
                    key: 'pending_renewal_order',
                    value: JSON.stringify(matchedOrder),
                    updated_at: new Date().toISOString()
                  });

                // 3. تعليم المعاملة البنكية كمطالب بها (claimed) لمنع تكرار استخدامها
                if (match.matchedBankTxn) {
                  match.matchedBankTxn.status = 'claimed';
                  match.matchedBankTxn.claimed_by = building.id;
                  match.matchedBankTxn.claimed_at = new Date().toISOString();
                  await supabase
                    .from('building_settings')
                    .upsert({
                      building_id: 83,
                      key: match.matchedBankTxn._key || ('bank_txn_' + match.matchedBankTxn.transaction_id),
                      value: JSON.stringify(match.matchedBankTxn),
                      updated_at: new Date().toISOString()
                    });
                  logEvent('تم ربط واستهلاك المعاملة البنكية بنجاح', resolvedTxnId, 'success');
                }

                // 4. حذف سجل التزامن إن وُجد
                if (match.matchedAmbiguous) {
                  await supabase
                    .from('building_settings')
                    .delete()
                    .eq('key', match.matchedAmbiguous._key || ('ambiguous_payment_' + match.matchedAmbiguous.transaction_id));
                  logEvent('تم حل التزامن وحذف الدفعة المعلقة', resolvedTxnId, 'success');
                }

                // 5. توليد الفاتورة الرسمية PDF
                const invoiceNo = `INV-2026-${String(newSubId).padStart(4, '0')}`;
                let pdfPath = null;
                try {
                  pdfPath = await generateInvoicePDF({
                    invoiceNo,
                    building,
                    yearsCount,
                    paidPrice: paidAmount,
                    paymentMethod: payMethod,
                    txnRef: resolvedTxnId,
                    startDate,
                    expiryDate
                  });
                } catch (pErr) {
                  logEvent('خطأ أثناء توليد PDF', pErr.message, 'warning');
                }

                // 6. إرسال رسالة التهنئة الرسمية للعميل
                const yearsText = yearsCount === 1 ? 'سنة كاملة' : `${yearsCount} سنوات كاملة`;
                const successMsg =
                  `🎉 *ألف مبروك! تم التحقق من الإيداع البنكي وتفعيل ترخيص عمارتكم بنجاح* 🏢✨\n\n` +
                  `أستاذ *${building.manager_name || 'المدير'}*، تم بنجاح التحقق من الإشعار البنكي ومطابقة عملية السداد (رقم المرجع: *${resolvedTxnId}*).\n\n` +
                  `✅ *تفاصيل الترخيص المعتمد:*\n` +
                  `• العمارة: *${building.name}* (كود: *${building.code}*)\n` +
                  `• مدة الاشتراك: *${yearsText}*` + (earnedReviewBonus ? ` *(+ شهرين زيادة هدية تقييم المتجر 🎁)*` : '') + `\n` +
                  `• تاريخ الصلاحية حتى: *${formatDate(expiryDate)}*\n` +
                  `• رقم الفاتورة الرسمية: *${invoiceNo}*\n\n` +
                  `نظام عمارتكم الآن نشط ومتاح بالكامل لجميع السكان ومجلس الإدارة.\n` +
                  (pdfPath ? `مرفق لكم بالأسفل الفاتورة الرسمية المعتمدة بصيغة PDF 📄👇\n` : '') +
                  `شكراً لثقتكم الغالية في تطبيق عمارتي 🚀`;

                await sock.sendMessage(senderJid, { text: successMsg });

                // إرسال ملف الفاتورة PDF كوثيقة رسمية
                if (pdfPath && fs.existsSync(pdfPath)) {
                  try {
                    await sock.sendMessage(senderJid, {
                      document: fs.readFileSync(pdfPath),
                      mimetype: 'application/pdf',
                      fileName: `فاتورة_اشتراك_${building.code}.pdf`,
                      caption: `فاتورة ترخيص رسمية معتمدة - ${building.name} (${building.code}) 🏢`
                    });
                    logEvent('تم تسليم ملف PDF الفاتورة بنجاح', { code: building.code, to: senderPhone }, 'success');
                  } catch (docErr) {
                    logEvent('خطأ أثناء إرسال مستند PDF', docErr.message, 'warning');
                  }
                }

                // إرسال عرض هدية تقييم المتجر (شهرين مجاناً) بعد التفعيل
                sendPostActivationReviewOffer(senderJid, building.manager_name, building.name, building.id);

                // إذا كان هناك عملاء آخرين متزامنين في نفس الدفعة، نرسل لهم إشعار توضيحي
                if (match.matchedAmbiguous && Array.isArray(match.matchedAmbiguous.candidates)) {
                  for (const cand of match.matchedAmbiguous.candidates) {
                    if (cand.building_id !== building.id) {
                      const candJid = cand.sender_jid || (cand.sender_phone ? `${cand.sender_phone}@s.whatsapp.net` : null);
                      if (candJid) {
                        const noticeOther =
                          `ℹ️ أهلاً بك أستاذ *${cand.manager_name || 'المدير'}* 🏢\n` +
                          `نود إحاطتكم بأنه تم التحقق من الإيصال السابق وتأكيد التفعيل لصالح عمارة أخرى مسجلة لدينا.\n\n` +
                          `إذا كنت قد قمت بالتحويل بالفعل لعمارتكم (*${cand.building_name}*)، يرجى التكرم بإرسال صورة إيصال التحويل الخاص بك أو كتابة رقم المعاملة ليتم التحقق منها وتفعيل عمارتكم فوراً! 🚀`;
                        await sock.sendMessage(candJid, { text: noticeOther });
                      }
                    }
                  }
                }

                continue;
              }
            } else if (match.awaitingBankConfirmation) {
              // العميل أرسل إيصالاً لحسابنا ولكن إشعار البنك لم يصل بعد، نحفظ رقم المرجع ونرسل رسالة طمأنة
              if (match.clientOrder) {
                match.clientOrder.last_receipt_ref = receiptData.reference;
                match.clientOrder.last_receipt_amount = receiptData.amount;
                match.clientOrder.last_receipt_at = new Date().toISOString();
                await supabase
                  .from('building_settings')
                  .upsert({
                    building_id: match.clientOrder.building_id,
                    key: 'pending_renewal_order',
                    value: JSON.stringify(match.clientOrder),
                    updated_at: new Date().toISOString()
                  });
              }

              const waitMsg =
                `⏳ أهلاً بك أستاذ *${match.clientOrder.manager_name || 'المدير'}* 🏢\n\n` +
                `تم استلام صورة الإيصال بنجاح وجاري التأكد من معلومات الدفع بالحساب ومطابقتها مع الإشعار البنكي.\n\n` +
                `🔍 *الخطوة المتبقية للتفعيل اللحظي:* \n` +
                `نحن الآن في انتظار وصول إشعار السداد اللحظي من بنك الإسكندرية / المحفظة للتأكيد البنكي ومطابقة المعاملة (عادة ما يستغرق من دقيقة لبضع دقائق).\n\n` +
                `⚡ *تفعيل تلقائي فوري:* فور وصول إشعار البنك، سيقوم النظام بتفعيل اشتراك عمارتكم (*${match.clientOrder.building_name}*) تلقائياً، وإصدار الفاتورة الرسمية المعتمدة وإرسالها لك هنا فوراً دون أي انتظار! 🚀`;

              await sock.sendMessage(senderJid, { text: waitMsg });
              logEvent('إشعار انتظار تأكيد البنك للعميل', { to: senderPhone, ref: receiptData.reference });
              continue;
            } else if (isImage) {
              // إذا أرسل صورة ولكن لم يتطابق مع أي دفعة معلقة
              let replyNote = '';
              if (match.clientOrder) {
                replyNote = `⚠️ أهلاً بك أستاذ *${match.clientOrder.manager_name || 'المدير'}* 🏢\n` +
                  `تم فحص الصورة، ولكن البيانات أو رقم المستلم لا يتطابق مع حساب عمارتي المعتمد أو لم نتمكن من قراءة الإيصال بدقة.\n\n` +
                  `💡 *لتفعيل عمارة (${match.clientOrder.building_name}) فورياً:*\n` +
                  `يرجى التأكد من التحويل لرقم الحساب المعتمد (01021252626)، وإرسال سكرين شوت واضحة للعملية أو كتابة **رقم المعاملة / المرجع** كنص هنا في المحادثة.`;
              } else {
                replyNote = `أهلاً بك أخي الكريم 🏢\n` +
                  `تم استلام الصورة بنجاح، ولكن لا يوجد طلب تفعيل اشتراك معلق مسجل لرقمك حالياً.\n` +
                  `يرجى الدخول لتطبيق عمارتي واختيار تجديد الاشتراك أولاً أو كتابة كود عمارتكم هنا للمتابعة.`;
              }
              await sock.sendMessage(senderJid, { text: replyNote });
              continue;
            } else if (match.clientOrder) {
              // أرسل نصاً مثل "تم التحويل" بدون صورة وبدون رقم مرجع
              await sock.sendMessage(senderJid, {
                text: `شكراً لك أستاذ ${match.clientOrder.manager_name || 'المدير'}! ⏳\nتم استلام إشعارك، وبانتظار وصول إشعار البنك/المحفظة لتفعيل عمارة *${match.clientOrder.building_name}* فورياً.\n\n💡 *ملاحظة:* لتسريع التفعيل فوراً يرجى إرسال صورة إيصال التحويل (سكرين شوت) أو كتابة رقم المرجع هنا.`
              });
              continue;
            }
          } catch (err) {
            logEvent('خطأ أثناء معالجة الإيصال بالذكاء الاصطناعي', err.message, 'error');
          }
        }

        // ---------- 3. كود استعادة كلمة المرور المكون من 5 أرقام ----------
        const codeMatch = text.match(/\b\d{5}\b/);
        if (codeMatch) {
          const resetCode = codeMatch[0];
          try {
            const { data, error } = await supabase
              .from('building_settings')
              .select('building_id, value')
              .eq('key', 'whatsapp_reset_request');

            if (!error && data) {
              for (const row of data) {
                if (!row.value) continue;
                const req = JSON.parse(row.value);
                if (req.code === resetCode && !req.is_verified) {
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

                  logEvent('تم تأكيد كلمة المرور', `${req.building_name} (${req.building_code})`, 'success');
                  await sock.sendMessage(senderJid, {
                    text: `✅ مرحباً بك مسؤول عمارة (${req.building_name})!\nتم التحقق من رقم هاتفك بنجاح.\nتم فتح شاشة كتابة كلمة المرور الجديدة في التطبيق الآن.`,
                  });
                  break;
                }
              }
            }
          } catch (err) {
            logEvent('خطأ كود كلمة المرور', err.message, 'error');
          }
          continue;
        }

        // ---------- 3.5 فحص الرد على عرض تجديد الاشتراك التجريبي (نعم / لا) ----------
        try {
          const handledTrialReply = await handleTrialReminderResponse({
            supabase,
            sock,
            senderJid,
            senderPhone,
            text,
            logEvent
          });
          if (handledTrialReply) continue;
        } catch (trErr) {
          logEvent('خطأ معالجة رد التجربة', trErr.message, 'warning');
        }

        // ---------- 4. خدمة العملاء والرد الذكي بالذكاء الاصطناعي (Gemini) ----------
        if (text && text.trim().length > 1) {
          try {
            logEvent('طلب مساعدة ذكي عبر الذكاء الاصطناعي', { from: senderPhone, text: text.slice(0, 60) });
            const aiReply = await getAIResponse(senderPhone, text);
            if (aiReply) {
              const replyText = typeof aiReply === 'object' ? aiReply.text : aiReply;
              const hasImage = typeof aiReply === 'object' && aiReply.sendImage;
              let imgBuffer = typeof aiReply === 'object' ? aiReply.imageBuffer : null;

              if (!imgBuffer && typeof aiReply === 'object' && aiReply.imagePath && fs.existsSync(aiReply.imagePath)) {
                try {
                  imgBuffer = fs.readFileSync(aiReply.imagePath);
                } catch (_) {}
              }

              if (hasImage && imgBuffer) {
                const imgName = aiReply.filename || (aiReply.imagePath ? path.basename(aiReply.imagePath) : 'screenshot.png');
                logEvent('إرسال لقطة شاشة توضيحية للعميل', { to: senderPhone, image: imgName }, 'info');
                await sock.sendMessage(senderJid, {
                  image: imgBuffer,
                  caption: replyText || '📱 لقطة شاشة توضيحية من داخل التطبيق'
                });
              } else if (replyText) {
                await sock.sendMessage(senderJid, { text: replyText });
              }

              logEvent('تم الرد عبر المساعد الذكي', {
                to: senderPhone,
                preview: (replyText || '').slice(0, 60),
                hasImage: hasImage && !!imgBuffer
              }, 'success');
            }
          } catch (aiErr) {
            logEvent('خطأ أثناء رد المساعد الذكي', aiErr.message, 'warning');
          }
        }
      }
    });

  } catch (e) {
    logEvent('Init WhatsApp Error', e.message, 'error');
  }
}

initWhatsApp();

// ==================== الجدولة التلقائية لتنبيهات الاشتراكات التجريبية ====================
// فحص دوري كل ساعتين، وإرسال التنبيهات تلقائياً في الفترة الصباحية (بين 11:00 ص و 13:00 م بتوقيت مصر)
setInterval(async () => {
  try {
    if (!sock || !isConnected) return;
    const now = new Date();
    const cairoHour = (now.getUTCHours() + 2) % 24; // توقيت القاهرة (UTC+2)
    if (cairoHour >= 11 && cairoHour <= 13) {
      logEvent('فحص التنبيهات المجدول', 'بدء الفحص اليومي للاشتراكات التجريبية التي تقترب من الانتهاء...');
      await checkAndSendTrialReminders({ supabase, sock, logEvent });
    }
  } catch (cronErr) {
    logEvent('خطأ الجدولة التلقائية للتجارب', cronErr.message, 'warning');
  }
}, 2 * 60 * 60 * 1000);

// ==================== مراقب صندوق الإرسال الآلي (Outbox Poller) ====================
// محرك متزامن محكم يمنع التكرار نهائياً (Sequential Loop + In-Memory Lock + Immediate DB Lock)

let isOutboxPolling = false;
const activeOutboxBuildingIds = new Set();

async function pollOutbox() {
  if (isOutboxPolling) return;
  if (!isConnected || !sock) {
    setTimeout(pollOutbox, 4000);
    return;
  }

  isOutboxPolling = true;
  try {
    const { data: outboxRows, error } = await supabase
      .from('building_settings')
      .select('building_id, value')
      .eq('key', 'whatsapp_outbox');

    if (!error && outboxRows && outboxRows.length > 0) {
      for (const row of outboxRows) {
        if (!row.value) continue;
        let order = null;
        try {
          order = JSON.parse(row.value);
        } catch (_) {
          continue;
        }

        // معالجة فقط الطلبات التي في حالة queued ولم يتم قفلها في الذاكرة
        if (order && order.status === 'queued') {
          if (activeOutboxBuildingIds.has(row.building_id)) continue;
          activeOutboxBuildingIds.add(row.building_id);

          try {
            // خطوة حرجة 1: قفل الطلب فوراً في قاعدة البيانات لمنع أي تكرار
            order.status = 'processing';
            order.processing_at = new Date().toISOString();
            await supabase
              .from('building_settings')
              .upsert({
                building_id: row.building_id,
                key: 'whatsapp_outbox',
                value: JSON.stringify(order),
                updated_at: new Date().toISOString()
              });

            const targetJid = order.target_jid || (order.target_phone ? `${order.target_phone.replace(/^0/, '20')}@s.whatsapp.net` : null);
            if (!targetJid) {
              order.status = 'failed';
              order.error = 'No valid target JID or phone';
              await supabase
                .from('building_settings')
                .upsert({
                  building_id: row.building_id,
                  key: 'whatsapp_outbox',
                  value: JSON.stringify(order),
                  updated_at: new Date().toISOString()
                });
              continue;
            }

            logEvent('معالجة رسالة من صندوق الإرسال', `عمارة: ${order.building_code || 'إشعار'} إلى: ${targetJid}`);

            let waMsg;
            if (order.is_plain_text && order.message_text) {
              waMsg = order.message_text;
            } else {
              const yearsText = order.years_count === 1 ? 'سنة كاملة' : `${order.years_count} سنوات كاملة`;
              waMsg =
                `🎉 *ألف مبروك! تم تفعيل ترخيص عمارتكم بنجاح* 🏢✨\n\n` +
                `أستاذ *${order.manager_name || 'المدير'}*، تم بنجاح استلام مبلغ *${order.amount} ج.م* عبر ${order.payment_method} (رقم العملية: *${order.transaction_id || 'سداد معتمد'}*).\n\n` +
                `✅ *تفاصيل الترخيص المعتمد:*\n` +
                `• العمارة: *${order.building_name}* (كود: *${order.building_code}*)\n` +
                `• مدة الاشتراك: *${yearsText}*\n` +
                `• تاريخ الصلاحية حتى: *${order.expiry_date}*\n` +
                `• رقم الفاتورة الرسمية: *${order.invoice_no}*\n\n` +
                `نظام عمارتكم الآن نشط ومتاح بالكامل لجميع السكان ومجلس الإدارة.\n` +
                `مرفق لكم بالأسفل الفاتورة الرسمية المعتمدة بصيغة PDF 📄👇\n` +
                `شكراً لثقتكم الغالية في تطبيق عمارتي 🚀`;
            }

            // إرسال النص
            await sock.sendMessage(targetJid, { text: waMsg });
            logEvent('تم إرسال رسالة من صندوق الإرسال', { to: targetJid }, 'success');

            // إذا كانت رسالة تفعيل رسمية ولها فاتورة
            if (!order.is_plain_text && order.invoice_no && order.building_code) {
              try {
                const bld = {
                  code: order.building_code,
                  name: order.building_name,
                  manager_name: order.manager_name,
                  manager_phone: order.target_phone,
                  apartments_count: order.apartments_count || 0
                };
                const pdfPath = await generateInvoicePDF({
                  invoiceNo: order.invoice_no,
                  building: bld,
                  yearsCount: order.years_count || 1,
                  paidPrice: order.amount || 200,
                  paymentMethod: order.payment_method || 'InstaPay',
                  txnRef: order.transaction_id,
                  expiryDate: order.expiry_date ? new Date(order.expiry_date.split('/').reverse().join('-')) : null
                });
                if (pdfPath && fs.existsSync(pdfPath)) {
                  await sock.sendMessage(targetJid, {
                    document: fs.readFileSync(pdfPath),
                    mimetype: 'application/pdf',
                    fileName: `فاتورة_اشتراك_${order.building_code}.pdf`,
                    caption: `فاتورة ترخيص رسمية معتمدة - ${order.building_name} (${order.building_code}) 🏢`
                  });
                  logEvent('تم إرفاق وتسليم ملف PDF الفاتورة عبر صندوق الإرسال', order.building_code, 'success');
                }

                // إرسال عرض هدية تقييم المتجر إذا لم تكن العمارة قد حصلت عليها بالفعل
                sendPostActivationReviewOffer(targetJid, order.manager_name, order.building_name, row.building_id);
              } catch (pErr) {
                logEvent('تنبيه PDF بصندوق الإرسال', pErr.message, 'warning');
              }
            }

            // تحديث الحالة النهائية إلى sent
            order.status = 'sent';
            order.sent_at = new Date().toISOString();
            await supabase
              .from('building_settings')
              .upsert({
                building_id: row.building_id,
                key: 'whatsapp_outbox',
                value: JSON.stringify(order),
                updated_at: new Date().toISOString()
              });

          } catch (sendErr) {
            logEvent('خطأ أثناء إرسال رسالة واتساب من الصندوق', sendErr.message, 'error');
            order.status = 'failed';
            order.error = sendErr.message;
            await supabase
              .from('building_settings')
              .upsert({
                building_id: row.building_id,
                key: 'whatsapp_outbox',
                value: JSON.stringify(order),
                updated_at: new Date().toISOString()
              });
          } finally {
            activeOutboxBuildingIds.delete(row.building_id);
          }
        }
      }
    }
  } catch (err) {
    // تجاهل أخطاء الاتصال الدورية
  } finally {
    isOutboxPolling = false;
    setTimeout(pollOutbox, 4000);
  }
}

// بدء المراقب المتسلسل الآمن
setTimeout(pollOutbox, 4000);

// ==================== محرك تحليل وتفعيل الدفع التلقائي ====================

function parseEgyptianPaymentSMS(text, defaultSender = 'Vodafone Cash') {
  if (!text) return null;
  let cleaned = text.replace(/[\u0660-\u0669]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

  let amount = null;
  const amountMatch = cleaned.match(/(?:مبلغ|بقيمة|تحويل|استلام)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:ج\.م|جم|ج|جنيه|جنيهات|EGP)/i) ||
                      cleaned.match(/(?:مبلغ|بقيمة|إيداع|إضافة|credited with|استلام)\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                      cleaned.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:ج\.م|EGP)/i);
  if (amountMatch) amount = parseFloat(amountMatch[1]);

  let phone = null;
  const phoneMatch = cleaned.match(/\b(01[0125][0-9]{8})\b/);
  if (phoneMatch) phone = phoneMatch[1];

  let buildingCode = null;
  const codeMatch = cleaned.match(/BLD-?([0-9]{4})/i) || cleaned.match(/كود\s*([0-9]{4})/i);
  if (codeMatch) buildingCode = 'BLD-' + codeMatch[1];

  let transactionId = null;
  const txnMatch = cleaned.match(/(?:رقم العملية|كود العملية|رقم المعاملة|عملية رقم|معاملة رقم|المرجع|مرجع|عملية|معاملة|Ref|Txn)\s*:?\s*([0-9A-Za-z]{5,20})/i);
  if (txnMatch) transactionId = txnMatch[1];
  else transactionId = 'TXN-' + Date.now().toString().slice(-6);

  let senderName = null;
  const nameMatch = cleaned.match(/من\s+([^\d\n,،]+?)\s+(?:يوم|بتاريخ|في)/);
  if (nameMatch) senderName = nameMatch[1].trim();

  let paymentMethod = defaultSender;
  if (/إنستاباي|انستاباي|InstaPay|IPN|اللحظية|Alex|إسكندرية/i.test(cleaned) || /Alex|ALEXBANK/i.test(defaultSender)) paymentMethod = 'InstaPay';
  else if (/فودافون|كاش|Vodafone|VF/i.test(cleaned) || /VF|Vodafone/i.test(defaultSender)) paymentMethod = 'Vodafone Cash';

  return { amount, phone, buildingCode, transactionId, senderName, paymentMethod, raw: text };
}

async function processPayment(parsed) {
  const result = {
    timestamp: new Date().toLocaleTimeString('ar-EG'),
    parsed,
    matchedBuilding: null,
    activation: null,
    status: 'failed',
    message: ''
  };

  if (!parsed.amount || parsed.amount <= 0) {
    result.message = 'الرسالة لا تحتوي على مبلغ تحويل مالي صالح.';
    result.status = 'ignored_not_a_payment';
    logEvent('رسالة تم تجاهلها', result.message, 'warning');
    return result;
  }

  // حفظ المعاملة البنكية دائماً في سوبابايز للتوثيق ومنع التزوير
  try {
    await supabase.from('building_settings').upsert({
      building_id: 83,
      key: 'bank_txn_' + parsed.transactionId,
      value: JSON.stringify({
        transaction_id: parsed.transactionId,
        amount: parsed.amount,
        phone: parsed.phone,
        sender_name: parsed.senderName || null,
        payment_method: parsed.paymentMethod,
        raw_sms: parsed.raw,
        received_at: new Date().toISOString(),
        status: 'unclaimed'
      }),
      updated_at: new Date().toISOString()
    });
    logEvent('تم حفظ سجل المعاملة البنكية', parsed.transactionId, 'success');
  } catch (saveErr) {
    logEvent('خطأ أثناء حفظ سجل المعاملة البنكية', saveErr.message, 'warning');
  }

  // 1. استراتيجية المطابقة الذكية مع العمارة:
  let matchedBuilding = null;
  let matchedPendingOrder = null;

  // أ) المطابقة المباشرة إذا ذُكر كود العمارة
  if (parsed.buildingCode) {
    const { data } = await supabase.from('buildings').select('*').eq('code', parsed.buildingCode);
    if (data && data.length > 0) matchedBuilding = data[0];
  }

  // ب) المطابقة عبر طلبات التجديد المعلقة في سوبابايز (أعلى دقة للواتساب)
  if (!matchedBuilding) {
    const { data: pendingRows } = await supabase
      .from('building_settings')
      .select('building_id, value, updated_at')
      .eq('key', 'pending_renewal_order');

    if (pendingRows && pendingRows.length > 0) {
      // 1. مطابقة الهاتف (هاتف الراسل على واتساب أو هاتف المسؤول)
      if (parsed.phone) {
        const last9 = parsed.phone.slice(-9);
        for (const row of pendingRows) {
          try {
            const o = JSON.parse(row.value);
            if (o.status === 'pending' && (o.sender_phone?.endsWith(last9) || o.manager_phone?.endsWith(last9))) {
              matchedPendingOrder = o;
              break;
            }
          } catch (_) {}
        }
      }

      // 2. إذا لم يتطابق الهاتف، فحص مرجع الإيصال المحفوظ أو تطابق المبلغ
      if (!matchedPendingOrder) {
        const matchingOrders = [];
        for (const row of pendingRows) {
          try {
            const o = JSON.parse(row.value);
            if (o.status === 'pending') {
              // تطابق صريح برقم المرجع من الإيصال
              if (o.last_receipt_ref && parsed.transactionId && o.last_receipt_ref.toLowerCase() === parsed.transactionId.toLowerCase()) {
                matchedPendingOrder = o;
                break;
              }
              if (Math.abs(o.expected_amount - parsed.amount) < 1) {
                const orderTime = new Date(o.requested_at || row.updated_at).getTime();
                const diffMinutes = (Date.now() - orderTime) / (1000 * 60);
                if (diffMinutes <= 120) {
                  matchingOrders.push(o);
                }
              }
            }
          } catch (_) {}
        }

        if (!matchedPendingOrder && matchingOrders.length === 1) {
          matchedPendingOrder = matchingOrders[0];
        } else if (!matchedPendingOrder && matchingOrders.length > 1) {
          // رصد تزامن طلبين أو أكثر بنفس المبلغ وبدون رقم هاتف!
          logEvent('تزامن طلبين بنفس المبلغ', `عدد الطلبات: ${matchingOrders.length} - تعليق التفعيل التلقائي ومطالبة العملاء بإيصال التحويل`, 'warning');

          const ambPayload = {
            transaction_id: parsed.transactionId,
            amount: parsed.amount,
            payment_method: parsed.paymentMethod,
            received_at: new Date().toISOString(),
            candidates: matchingOrders
          };

          await supabase
            .from('building_settings')
            .upsert({
              building_id: 83,
              key: 'ambiguous_payment_' + parsed.transactionId,
              value: JSON.stringify(ambPayload),
              updated_at: new Date().toISOString()
            });

          // إرسال تنبيه فوري عبر واتساب لكل عميل من المتزامنين
          for (const cand of matchingOrders) {
            const targetJid = cand.sender_jid || (cand.sender_phone ? `${cand.sender_phone}@s.whatsapp.net` : null);
            if (!targetJid) continue;

            const notifyMsg =
              `⚠️ أهلاً بك أستاذ *${cand.manager_name || 'المدير'}* 🏢\n\n` +
              `تم رصد استلام تحويل بمبلغ *${parsed.amount} ج.م* عبر ${parsed.paymentMethod}، وتوجد طلبات تجديد أخرى مسجلة بنفس المبلغ في نفس التوقيت.\n\n` +
              `🔒 *لتأكيد ربط التحويل بعمارتكم وتفعيلها فوراً:* \n` +
              `يرجى التكرم بـ *إرسال صورة إيصال التحويل (سكرين شوت من إنستاباي)* أو كتابة رقم المعاملة هنا الآن.\n\n` +
              `سيقوم النظام الذكي بفحص صورة الإيصال ومطابقتها وتفعيل اشتراك عمارتكم (*${cand.building_name}*) وإصدار الفاتورة الرسمية في ثوانٍ! 🚀`;

            if (isConnected && sock) {
              await sock.sendMessage(targetJid, { text: notifyMsg });
            } else {
              await supabase
                .from('building_settings')
                .upsert({
                  building_id: cand.building_id,
                  key: 'whatsapp_outbox',
                  value: JSON.stringify({
                    id: 'outbox_' + Date.now() + '_' + cand.building_id,
                    target_jid: targetJid,
                    message_text: notifyMsg,
                    is_plain_text: true,
                    status: 'queued',
                    created_at: new Date().toISOString()
                  }),
                  updated_at: new Date().toISOString()
                });
            }
          }

          result.status = 'held_for_receipt_verification';
          result.message = `تم رصد تزامن ${matchingOrders.length} طلبات بنفس المبلغ (${parsed.amount} ج.م). تم تعليق التفعيل التلقائي ومطالبة العملاء بإرسال إيصال التحويل على واتساب.`;
          return result;
        }
      }

      if (matchedPendingOrder) {
        const { data: bldData } = await supabase.from('buildings').select('*').eq('id', matchedPendingOrder.building_id);
        if (bldData && bldData.length > 0) matchedBuilding = bldData[0];
      }
    }
  }

  // ج) المطابقة التقليدية عبر هاتف مسؤول العمارة المسجل
  if (!matchedBuilding && parsed.phone) {
    const { data } = await supabase.from('buildings').select('*').ilike('manager_phone', `%${parsed.phone.slice(-9)}%`);
    if (data && data.length > 0) matchedBuilding = data[0];
  }

  // إذا لم نجد عمارة مسجلة إطلاقاً (مثل تحويل لتطبيق طلباتي أو شخصي)، نتجاهل العملية بأمان تام
  if (!matchedBuilding) {
    result.status = 'ignored_unrelated_payment';
    result.message = `تم استخراج المبلغ (${parsed.amount} ج.م) ولكن لا توجد عمارة مسجلة في عمارتي بهذا الهاتف (${parsed.phone || 'غير محدد'}) أو الكود. تم التجاهل بأمان لحماية البيانات.`;
    logEvent('تم التجاهل بأمان', result.message, 'info');
    return result;
  }

  // 2. تحديد مدة الاشتراك
  let yearsCount = 1;
  if (matchedPendingOrder && matchedPendingOrder.years_count) {
    yearsCount = matchedPendingOrder.years_count;
  } else if (parsed.amount >= 700) {
    yearsCount = 5;
  } else if (parsed.amount >= 480) {
    yearsCount = 3;
  } else if (parsed.amount >= 360) {
    yearsCount = 2;
  } else if (parsed.amount >= 200) {
    yearsCount = 1;
  }

  const startDate = new Date();
  const expiryDate = new Date();
  expiryDate.setFullYear(startDate.getFullYear() + yearsCount);

  // فحص هل العمارة مؤهلة لهدية التقييم (شهرين إضافيين زيادة فوق مدة الاشتراك)
  const { data: revGiftRows } = await supabase
    .from('building_settings')
    .select('key, value')
    .eq('building_id', matchedBuilding.id)
    .in('key', ['review_gift_claimed', 'review_gift_progress', 'review_gift_pending_subscription']);

  const hasClaimedGift = revGiftRows?.some(r => r.key === 'review_gift_claimed');
  const progRow = revGiftRows?.find(r => r.key === 'review_gift_progress');
  const pendGiftRow = revGiftRows?.find(r => r.key === 'review_gift_pending_subscription');

  let earnedReviewBonus = false;
  if (!hasClaimedGift) {
    let pCount = pendGiftRow ? 3 : 0;
    if (progRow && progRow.value) {
      try {
        const p = JSON.parse(progRow.value);
        pCount = Math.max(pCount, p.count || (p.reviews ? p.reviews.length : 0));
      } catch (_) {}
    }
    if (pCount >= 3) {
      earnedReviewBonus = true;
      expiryDate.setDate(expiryDate.getDate() + 60); // إضافة 60 يوماً زيادة فوق مدة الاشتراك
    }
  }

  // 3. تفعيل الاشتراك في سوبابايز
  const { data: subData, error: subError } = await supabase
    .from('building_subscriptions')
    .insert([{
      building_id: matchedBuilding.id,
      years_count: yearsCount,
      price_paid: parsed.amount,
      payment_method: parsed.paymentMethod,
      start_date: startDate.toISOString(),
      expiry_date: expiryDate.toISOString(),
      is_active: true,
      is_trial: false,
      notes: `تفعيل آلي فوري عبر رسالة ${parsed.paymentMethod} (مرجع: ${parsed.transactionId})` + (earnedReviewBonus ? ' + شهرين زيادة هدية اكتمال 3 تقييمات' : '')
    }])
    .select();

  if (earnedReviewBonus) {
    await supabase
      .from('building_settings')
      .upsert({
        building_id: matchedBuilding.id,
        key: 'review_gift_claimed',
        value: JSON.stringify({
          status: 'claimed',
          bonus_days: 60,
          building_id: matchedBuilding.id,
          building_code: matchedBuilding.code,
          claimed_at: new Date().toISOString(),
          new_expiry: expiryDate.toISOString(),
          note: 'تم تفعيل هدية شهرين إضافيين مع الاشتراك المدفوع بعد اكتمال 3 تقييمات'
        }),
        updated_at: new Date().toISOString()
      });
  }

  const newSubId = (subData && subData[0]) ? subData[0].id : Date.now().toString().slice(-4);
  await supabase.from('buildings').update({ is_active: true }).eq('id', matchedBuilding.id);

  // تحديث حالة الطلب المعلق إلى completed
  if (matchedPendingOrder) {
    matchedPendingOrder.status = 'completed';
    matchedPendingOrder.activated_at = new Date().toISOString();
    matchedPendingOrder.subscription_id = newSubId;
    matchedPendingOrder.paid_amount = parsed.amount;

    await supabase
      .from('building_settings')
      .upsert({
        building_id: matchedBuilding.id,
        key: 'pending_renewal_order',
        value: JSON.stringify(matchedPendingOrder),
        updated_at: new Date().toISOString()
      });
  }

  // تحديث حالة المعاملة البنكية إلى claimed
  try {
    await supabase.from('building_settings').upsert({
      building_id: 83,
      key: 'bank_txn_' + parsed.transactionId,
      value: JSON.stringify({
        transaction_id: parsed.transactionId,
        amount: parsed.amount,
        phone: parsed.phone,
        sender_name: parsed.senderName || null,
        payment_method: parsed.paymentMethod,
        raw_sms: parsed.raw,
        received_at: new Date().toISOString(),
        status: 'claimed',
        claimed_by: matchedBuilding.id,
        claimed_at: new Date().toISOString()
      }),
      updated_at: new Date().toISOString()
    });
    logEvent('تم تعليم المعاملة البنكية كمطالب بها', parsed.transactionId, 'success');
  } catch (_) {}

  // 4. إنشاء الفاتورة الرسمية وتجهيز مهمة الإرسال عبر واتساب
  const invoiceNo = `INV-2026-${String(newSubId).padStart(4, '0')}`;
  const targetJid = matchedPendingOrder?.sender_jid ||
                    (matchedPendingOrder?.sender_phone ? `${matchedPendingOrder.sender_phone}@s.whatsapp.net` : null) ||
                    (matchedBuilding.manager_phone ? `20${matchedBuilding.manager_phone.replace(/^0/, '')}@s.whatsapp.net` : null);
  const targetPhone = matchedPendingOrder?.sender_phone || matchedBuilding.manager_phone;

  const outboxPayload = {
    id: 'outbox_' + Date.now(),
    target_jid: targetJid,
    target_phone: targetPhone,
    building_id: matchedBuilding.id,
    building_code: matchedBuilding.code,
    building_name: matchedBuilding.name,
    manager_name: matchedBuilding.manager_name,
    years_count: yearsCount,
    amount: parsed.amount,
    payment_method: parsed.paymentMethod,
    transaction_id: parsed.transactionId,
    invoice_no: invoiceNo,
    expiry_date: formatDate(expiryDate),
    status: 'queued',
    created_at: new Date().toISOString()
  };

  // حفظ مهمة الإرسال في سوبابايز
  await supabase
    .from('building_settings')
    .upsert({
      building_id: matchedBuilding.id,
      key: 'whatsapp_outbox',
      value: JSON.stringify(outboxPayload),
      updated_at: new Date().toISOString()
    });

  // إذا كان البوت متصلاً محلياً الآن، أرسل الرسالة فورياً دون انتظار المجدول
  if (isConnected && sock && targetJid) {
    try {
      const yearsText = yearsCount === 1 ? 'سنة كاملة' : `${yearsCount} سنوات كاملة`;
      const instantMsg =
        `🎉 *ألف مبروك! تم تفعيل ترخيص عمارتكم بنجاح* 🏢✨\n\n` +
        `أستاذ *${matchedBuilding.manager_name || 'المدير'}*، تم بنجاح استلام مبلغ *${parsed.amount} ج.م* عبر ${parsed.paymentMethod} (رقم العملية: *${parsed.transactionId}*).\n\n` +
        `✅ *تفاصيل الترخيص المعتمد:*\n` +
        `• العمارة: *${matchedBuilding.name}* (كود: *${matchedBuilding.code}*)\n` +
        `• مدة الاشتراك: *${yearsText}*\n` +
        `• تاريخ الصلاحية حتى: *${formatDate(expiryDate)}*\n` +
        `• رقم الفاتورة الرسمية: *${invoiceNo}*\n\n` +
        `نظام عمارتكم الآن نشط ومتاح بالكامل لجميع السكان ومجلس الإدارة.\n` +
        `شكراً لثقتكم الغالية في تطبيق عمارتي 🚀`;

      await sock.sendMessage(targetJid, { text: instantMsg });

      try {
        const pdfPath = await generateInvoicePDF({
          invoiceNo,
          building: matchedBuilding,
          yearsCount,
          paidPrice: parsed.amount,
          paymentMethod: parsed.paymentMethod,
          txnRef: parsed.transactionId,
          startDate,
          expiryDate
        });
        if (pdfPath && fs.existsSync(pdfPath)) {
          await sock.sendMessage(targetJid, {
            document: fs.readFileSync(pdfPath),
            mimetype: 'application/pdf',
            fileName: `فاتورة_اشتراك_${matchedBuilding.code}.pdf`,
            caption: `فاتورة ترخيص رسمية معتمدة - ${matchedBuilding.name} (${matchedBuilding.code}) 🏢`
          });
          logEvent('تم إرفاق وتسليم ملف PDF الفاتورة الفوري', matchedBuilding.code, 'success');
        }

        // إرسال عرض هدية تقييم المتجر (شهرين مجاناً) بعد التفعيل
        sendPostActivationReviewOffer(targetJid, matchedBuilding.manager_name, matchedBuilding.name, matchedBuilding.id);
      } catch (pErr) {
        logEvent('تنبيه PDF في التفعيل الفوري', pErr.message, 'warning');
      }

      outboxPayload.status = 'sent';
      outboxPayload.sent_at = new Date().toISOString();
      await supabase
        .from('building_settings')
        .upsert({
          building_id: matchedBuilding.id,
          key: 'whatsapp_outbox',
          value: JSON.stringify(outboxPayload),
          updated_at: new Date().toISOString()
        });
      logEvent('تم الإرسال الفوري لرسالة التفعيل', targetJid, 'success');
    } catch (e) {
      logEvent('خطأ إرسال واتساب فوري', e.message, 'warning');
    }
  }

  result.status = 'success';
  result.message = `تم تفعيل اشتراك ${matchedBuilding.name} (${matchedBuilding.code}) لمدة ${yearsCount} سنوات بنجاح!`;
  result.activation = {
    subId: newSubId,
    yearsCount,
    amount: parsed.amount,
    expiryDate: formatDate(expiryDate),
    method: parsed.paymentMethod,
    invoiceNo
  };

  logEvent('نجاح تفعيل الاشتراك', result.message, 'success');
  return result;
}

// ==================== مسارات الـ API ولوحة المراقبة ====================

// استلام Webhook من تطبيق SMS Forwarder
app.post('/api/sms-webhook', async (req, res) => {
  try {
    const text = req.body.message || req.body.text || req.body.content || req.body.body || '';
    const sender = req.body.sender || req.body.from || 'Vodafone';

    logEvent('استلام Webhook SMS جديد', { sender, text });
    const parsed = parseEgyptianPaymentSMS(text, sender);
    const outcome = await processPayment(parsed);
    // إرجاع HTTP 200 دائماً حتى لا يظهر خطأ بالتطبيق
    res.status(200).json(outcome);
  } catch (err) {
    res.status(200).json({ status: 'error', message: err.message });
  }
});

// شريط الأحداث المباشر
app.get('/api/live-feed', (req, res) => {
  res.json(liveTransactions);
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
        <h3>⏳ جاري إنشاء رمز الـ QR... سيتم التحديث تلقائياً خلال ثوانٍ...</h3>
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
          .box { background: #1e293b; max-width: 440px; margin: auto; padding: 30px; border-radius: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
          img { width: 260px; height: 260px; border-radius: 12px; }
          .instructions { text-align: right; background: #0f172a; padding: 15px; border-radius: 12px; font-size: 13px; color: #cbd5e1; line-height: 1.8; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="box">
          <h2 style="color: #22c55e; margin-bottom: 5px;">📱 ربط بوت واتساب عمارتي</h2>
          <p style="color: #94a3b8; font-size: 13px;">امسح هذا الرمز مرة واحدة فقط من تطبيق واتساب</p>
          <img src="${qrImage}" alt="QR Code" />
          <div class="instructions">
            <b>طريقة المسح:</b><br>
            1. افتح تطبيق واتساب على هاتفك.<br>
            2. اضغط على القائمة (الثلاث نقاط) 👈 <b>الأجهزة المرتبطة</b>.<br>
            3. اضغط على <b>ربط جهاز</b> ووجّه الكاميرا إلى هذا الرمز.<br>
            <i>(يتجدد الرمز تلقائياً كل 15 ثانية).</i>
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

// نقطة إعادة ضبط وربط جلسة واتساب من الصفر في حال تلف مفاتيح التشفير القديمة
app.get('/relink', async (req, res) => {
  logEvent('إعادة تعيين الجلسة', 'طلب إعادة ربط واتساب وإنشاء رمز QR جديد نظيف...', 'warning');
  try {
    if (sock) {
      try { sock.end(new Error('Relink requested')); } catch (_) {}
    }
    isConnected = false;
    currentQR = null;

    const backupDir = path.join(__dirname, `auth_info_baileys_backup_${Date.now()}`);
    if (fs.existsSync(AUTH_DIR)) {
      try {
        fs.renameSync(AUTH_DIR, backupDir);
      } catch (e) {
        const files = fs.readdirSync(AUTH_DIR);
        for (const file of files) {
          try { fs.unlinkSync(path.join(AUTH_DIR, file)); } catch (_) {}
        }
      }
    }
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    try {
      await supabase.from('building_settings').delete().eq('key', 'baileys_session_backup');
    } catch (_) {}

    setTimeout(() => {
      initWhatsApp();
    }, 1200);

    res.redirect('/qr');
  } catch (err) {
    res.status(500).send('Error resetting session: ' + err.message);
  }
});

// نقطة جلب أقرب العمائر التي توشك فترتها التجريبية على الانتهاء
app.get('/api/trial-reminders', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '10', 10);
    const list = await getExpiringTrialBuildings(supabase, { limit });
    res.json({ ok: true, count: list.length, list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// نقطة إرسال نموذج تجريبي لرقم م. محمود (01021252626)
app.post('/api/trial-reminders/test', async (req, res) => {
  try {
    if (!sock || !isConnected) {
      return res.status(400).json({ ok: false, error: 'واتساب غير متصل حالياً' });
    }
    const result = await checkAndSendTrialReminders({
      supabase,
      sock,
      logEvent,
      isManualTrigger: true,
      limit: 1,
      targetPhoneOverride: '01021252626'
    });
    res.json({ ok: true, message: 'تم إرسال الرسالة التجريبية إلى رقمك الخاص بنجاح', result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// نقطة إرسال التنبيهات الفعلية لأقرب N عمائر
app.post('/api/trial-reminders/send-live', async (req, res) => {
  try {
    if (!sock || !isConnected) {
      return res.status(400).json({ ok: false, error: 'واتساب غير متصل حالياً' });
    }
    const limit = parseInt(req.body?.limit || req.query?.limit || '10', 10);
    const result = await checkAndSendTrialReminders({
      supabase,
      sock,
      logEvent,
      isManualTrigger: true,
      limit
    });
    res.json({ ok: true, message: `تم إرسال التنبيهات لـ ${result.sentCount} عمارة بنجاح`, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// نقطة فحص الحالة البرمجية المباشرة (Health Status API)
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    connected: isConnected,
    status: isConnected ? 'online' : 'waiting_qr',
    uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    liveEventsCount: liveTransactions.length
  });
});

// الصفحة الرئيسية (لوحة المراقبة)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>سيرفر عمارتي المتكامل - البوت والدفع الآلي</title>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #f8fafc; text-align: center; padding: 40px 20px; line-height: 1.6; }
        .card { background: #1e293b; max-width: 650px; margin: auto; padding: 30px; border-radius: 20px; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); }
        .badge { display: inline-block; padding: 6px 16px; border-radius: 50px; font-weight: bold; font-size: 13px; }
        .connected { background: #dcfce7; color: #166534; }
        .disconnected { background: #fef3c7; color: #92400e; }
        .btn { display: inline-flex; align-items: center; gap: 8px; background: #2563eb; color: white; padding: 10px 20px; border-radius: 10px; text-decoration: none; font-weight: bold; margin: 8px 4px; border: none; cursor: pointer; }
        .btn-wa { background: #25D366; }
        .btn-warning { background: #d97706; }
        .btn-purple { background: #7c3aed; }
        .btn:hover { opacity: 0.9; }
        .section-box { background: #0b0f19; border: 1px solid #334155; border-radius: 12px; padding: 14px; margin-top: 20px; text-align: right; font-size: 13px; color: #94a3b8; }
        .endpoint-box { background: #0b0f19; border: 1px dashed #334155; border-radius: 12px; padding: 14px; margin-top: 20px; text-align: right; font-size: 13px; color: #94a3b8; }
        .code { background: #000; color: #38bdf8; padding: 4px 8px; border-radius: 6px; font-family: monospace; display: block; margin-top: 6px; direction: ltr; text-align: left; }
        .feed { text-align: right; margin-top: 25px; background: #090d16; border-radius: 12px; padding: 15px; font-size: 13px; max-height: 250px; overflow-y: auto; }
        .feed-item { padding: 8px 0; border-bottom: 1px solid #1e293b; }
      </style>
      <script>
        async function runTrialTest() {
          if (!confirm('هل تريد إرسال رسالة تذكير تجريبية لهاتفك الخاص (01021252626)؟')) return;
          try {
            const res = await fetch('/api/trial-reminders/test', { method: 'POST' });
            const data = await res.json();
            alert(data.message || (data.ok ? 'تم الإرسال بنجاح' : 'حدث خطأ: ' + data.error));
            location.reload();
          } catch(e) { alert('خطأ في الاتصال: ' + e.message); }
        }
        async function runTrialLive(count) {
          if (!confirm('تأكيد: هل تريد إرسال رسائل استفسار التجديد لأقرب ' + count + ' عمائر فعلياً؟')) return;
          try {
            const res = await fetch('/api/trial-reminders/send-live?limit=' + count, { method: 'POST' });
            const data = await res.json();
            alert(data.message || (data.ok ? 'تم الإرسال بنجاح' : 'حدث خطأ: ' + data.error));
            location.reload();
          } catch(e) { alert('خطأ في الاتصال: ' + e.message); }
        }
      </script>
    </head>
    <body>
      <div class="card">
        <h2>🏢 سيرفر عمارتي المتكامل للتحكم والتفعيل</h2>
        <p style="color: #94a3b8; font-size: 14px;">التكامل التلقائي المغلق (تطبيق عمارتي ⟷ بوت واتساب ⟷ محرك الرسائل البنكية ⟷ سوبابايز)</p>
        <br>
        <div style="display:flex; justify-content:center; gap:16px; margin-bottom: 20px;">
          <div>
            <span style="font-size:12px; color:#94a3b8; display:block; margin-bottom:4px;">حالة بوت واتساب:</span>
            <span class="badge ${isConnected ? 'connected' : 'disconnected'}">
              ${isConnected ? '✅ متصل ويعمل 24/7' : '⚠️ بانتظار مسح رمز QR'}
            </span>
          </div>
          <div>
            <span style="font-size:12px; color:#94a3b8; display:block; margin-bottom:4px;">محرك الدفع السحابي:</span>
            <span class="badge connected">
              ⚡ جاهز للاستقبال
            </span>
          </div>
        </div>

        <div style="display:flex; justify-content:center; gap:12px; align-items:center; flex-wrap:wrap;">
          ${!isConnected ? '<a href="/qr" class="btn btn-wa"><i class="fa-brands fa-whatsapp"></i> مسح رمز QR لربط واتساب</a>' : '<span style="color:#22c55e; font-weight:bold;"><i class="fa-solid fa-circle-check"></i> واتساب متصل وجاهز للاستقبال والإرسال</span>'}
          <a href="/relink" class="btn" style="background:#dc2626; color:#fff; text-decoration:none; padding:9px 16px; border-radius:10px; font-size:13px; font-weight:bold; box-shadow:0 4px 12px rgba(220,38,38,0.3);" onclick="return confirm('هل تريد قطع الجلسة الحالية وإنشاء رمز QR جديد لمسحه وإعادة المزامنة النظيفة؟')">🔄 إعادة ربط واتساب (رمز QR جديد)</a>
        </div>

        <div class="section-box">
          <strong style="color:#38bdf8; display:block; margin-bottom:6px;"><i class="fa-solid fa-bullhorn"></i> حملة متابعة الاشتراكات التجريبية (أقرب 10 عمائر):</strong>
          <span style="display:block; margin-bottom:10px;">إرسال استفسار التجديد المهذب بنظام الخيارين (1: نعم، وضح لي / 2: لا، شكراً):</span>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button onclick="runTrialTest()" class="btn btn-purple" style="font-size:13px; padding:8px 14px;"><i class="fa-solid fa-flask"></i> 🧪 تجربة إرسال لهاتفي (01021252626)</button>
            <button onclick="runTrialLive(10)" class="btn btn-warning" style="font-size:13px; padding:8px 14px;"><i class="fa-solid fa-paper-plane"></i> 🚀 إرسال لأقرب 10 عمائر</button>
            <a href="/api/trial-reminders?limit=10" target="_blank" class="btn" style="font-size:13px; padding:8px 14px; background:#475569;"><i class="fa-solid fa-eye"></i> كشف الـ 10 عمائر (JSON)</a>
          </div>
        </div>

        <div class="endpoint-box">
          <strong>📲 روابط الـ Webhook المعتمدة:</strong>
          <span>سيرفر كلاود فلير السحابي الدائم:</span>
          <span class="code">https://ammarty-pay.mah-ahmed-moha.workers.dev/api/sms-webhook</span>
          <span style="margin-top:8px; display:block;">أو السيرفر المحلي المباشر:</span>
          <span class="code">http://localhost:${PORT}/api/sms-webhook</span>
        </div>

        <div class="feed">
          <strong style="color: #38bdf8; display:block; margin-bottom: 8px;"><i class="fa-solid fa-list-check"></i> سجل العمليات المباشر:</strong>
          ${liveTransactions.length === 0 ? '<div style="color:#64748b;">لا توجد عمليات مسجلة بعد...</div>' : ''}
          ${liveTransactions.map(t => `
            <div class="feed-item">
              <span style="color: #64748b;">[${t.time}]</span> 
              <strong style="color: ${t.type === 'success' ? '#4ade80' : (t.type === 'error' ? '#f87171' : '#38bdf8')}">${t.title}:</strong> 
              <span>${typeof t.detail === 'object' ? JSON.stringify(t.detail) : t.detail}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `);
});

process.on('uncaughtException', (err) => {
  logEvent('استثناء غير معالج (تم الحفاظ على استمرار البوت)', err?.message || String(err), 'warning');
});

process.on('unhandledRejection', (reason) => {
  logEvent('رفض غير معالج (تم الحفاظ على استمرار البوت)', reason?.message || String(reason), 'warning');
});

app.listen(PORT, () => {
  logEvent('تشغيل السيرفر', `سيرفر عمارتي المتكامل يعمل على المنفذ: ${PORT}`, 'success');
});

