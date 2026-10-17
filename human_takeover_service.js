/**
 * عمارتي - محرك إدارة التحدث البشري والتحكم الذكي في البوت (Human Takeover Service)
 * 
 * الهدف:
 * 1. منع البوت من مقاطعة المحادثات عند قيام مدير النظام (المهندس محمود أحمد) بالرد على أي عميل.
 * 2. الكشف التلقائي عن الرسائل الصادرة من الأدمن (من الهاتف أو واتساب ويب) وتفعيل وضع التحدث البشري فوراً.
 * 3. إيقاف الردود الآلية للذكاء الاصطناعي (Gemini) مؤقتاً للشات لمنح الطرفين فرصة للتفاهم دون أي تشويش.
 * 4. دعم الأوامر السريعة في الشات (#تشغيل_البوت، #ايقاف_البوت) مع تفاعل الرموز التعبيرية (Reactions).
 * 5. التعرف على رغبة العميل في التحدث مع شخص بشري/خدمة العملاء وتحويله بلباقة وإشعار الأدمن.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// ملف حفظ الحالات المؤقتة لضمان استمرارها حتى لو أعيد تشغيل السيرفر
const STORAGE_FILE = path.join(__dirname, 'human_takeovers.json');

// الفترات الزمنية الافتراضية
const DEFAULT_TAKEOVER_MS = 30 * 60 * 1000; // 30 دقيقة عند إرسال الأدمن أي رسالة
const EXTENDED_TAKEOVER_MS = 24 * 60 * 60 * 1000; // 24 ساعة عند طلب الإيقاف اليدوي
const CUSTOMER_REQUEST_MS = 4 * 60 * 60 * 1000; // 4 ساعات عند طلب العميل التحدث مع شخص بشري

// إعداد سوبابايز لمزامنة الحالات السحابية عبر سيرفر Render
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iowpdqulkujikzsjgebd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3BkcXVsa3VqaWt6c2pnZWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQ1NDYsImV4cCI6MjEwNDE3MDU0Nn0.26U1YKl_XFvTBu3r4jJJs5VrZr1vzr9DGrpgFsMTLEU';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// مجموعة لتتبع كافة معرفات الرسائل التي أرسلها كود البوت
const botSentMessageIds = new Set();

// خريطة المحادثات النشطة في الوضع البشري: key = identifier (jid/phone), value = { expiresAt, reason, updatedAt }
const humanTakeovers = new Map();

/**
 * تحميل الحالات المحفوظة من القرص ومن سوبابايز
 */
function loadTakeoversFromDisk() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      const data = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
      const now = Date.now();
      for (const [key, val] of Object.entries(data)) {
        if (val && val.expiresAt && val.expiresAt > now) {
          humanTakeovers.set(key, val);
        }
      }
    }
  } catch (err) {
    console.error('[HumanTakeover] خطأ أثناء قراءة ملف الحفظ:', err.message);
  }
}

// مزامنة سحابية غير متزامنة من سوبابايز عند بدء التشغيل
async function syncTakeoversFromSupabase() {
  try {
    const { data, error } = await supabase
      .from('building_settings')
      .select('value')
      .eq('building_id', 83)
      .eq('key', 'active_human_takeovers')
      .maybeSingle();

    if (!error && data && data.value) {
      const remote = JSON.parse(data.value);
      const now = Date.now();
      let changed = false;
      for (const [key, val] of Object.entries(remote)) {
        if (val && val.expiresAt && val.expiresAt > now) {
          if (!humanTakeovers.has(key) || humanTakeovers.get(key).expiresAt < val.expiresAt) {
            humanTakeovers.set(key, val);
            changed = true;
          }
        }
      }
      if (changed) saveTakeoversToDisk();
    }
  } catch (_) {}
}

let supabaseSaveTimer = null;
/**
 * حفظ الحالات النشطة في القرص وسوبابايز
 */
function saveTakeoversToDisk() {
  try {
    const now = Date.now();
    const data = {};
    for (const [key, val] of humanTakeovers.entries()) {
      if (val && val.expiresAt && val.expiresAt > now) {
        data[key] = val;
      }
    }
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), 'utf8');

    // حفظ سحابي في سوبابايز لضمان استمرار الحالات حتى عند إعادة تشغيل سيرفر Render
    if (supabaseSaveTimer) clearTimeout(supabaseSaveTimer);
    supabaseSaveTimer = setTimeout(async () => {
      try {
        await supabase.from('building_settings').upsert({
          building_id: 83,
          key: 'active_human_takeovers',
          value: JSON.stringify(data),
          updated_at: new Date().toISOString()
        });
      } catch (_) {}
    }, 1000);
  } catch (err) {
    console.error('[HumanTakeover] خطأ أثناء حفظ الملف:', err.message);
  }
}

// تحميل الحالات عند بدء التشغيل
loadTakeoversFromDisk();
syncTakeoversFromSupabase();

/**
 * تنظيف المعرف أو رقم الهاتف للمقارنة الموحدة
 */
function normalizeChatId(jidOrPhone) {
  if (!jidOrPhone) return '';
  const str = String(jidOrPhone).trim();
  const digits = str.split('@')[0].split(':')[0].replace(/\D/g, '');
  return digits || str;
}

/**
 * تغليف دالة sock.sendMessage لتسجيل معرفات رسائل البوت تلقائياً
 */
function wrapSocketSendMessage(sock, baileys) {
  if (!sock || sock._isHumanTakeoverWrapped) return sock;

  const originalSendMessage = sock.sendMessage.bind(sock);

  sock.sendMessage = async (jid, content, options = {}) => {
    let msgId = options?.messageId;
    if (!msgId) {
      if (baileys && typeof baileys.generateMessageID === 'function') {
        msgId = baileys.generateMessageID();
      } else {
        msgId = '3EB0' + crypto.randomBytes(16).toString('hex').toUpperCase();
      }
    }

    botSentMessageIds.add(msgId);
    if (botSentMessageIds.size > 4000) {
      const oldest = botSentMessageIds.values().next().value;
      botSentMessageIds.delete(oldest);
    }

    return await originalSendMessage(jid, content, { ...options, messageId: msgId });
  };

  sock._isHumanTakeoverWrapped = true;
  return sock;
}

/**
 * فحص هل الرسالة مرسلة من البوت
 */
function isBotSentMessage(messageId) {
  if (!messageId) return false;
  return botSentMessageIds.has(messageId);
}

/**
 * تفعيل وضع التحدث البشري لشات معين
 */
function setHumanMode(jid, phone, durationMs = DEFAULT_TAKEOVER_MS, reason = 'تدخل بشري من الأدمن') {
  const expiresAt = Date.now() + durationMs;
  const payload = { expiresAt, reason, updatedAt: Date.now() };

  if (jid) {
    humanTakeovers.set(jid, payload);
    const cleanJid = normalizeChatId(jid);
    if (cleanJid) humanTakeovers.set(cleanJid, payload);
  }

  if (phone) {
    const cleanPhone = normalizeChatId(phone);
    if (cleanPhone) humanTakeovers.set(cleanPhone, payload);
  }

  saveTakeoversToDisk();
}

/**
 * إلغاء وضع التحدث البشري وإعادة تفعيل الرد الآلي
 */
function clearHumanMode(jid, phone) {
  if (jid) {
    humanTakeovers.delete(jid);
    const cleanJid = normalizeChatId(jid);
    if (cleanJid) humanTakeovers.delete(cleanJid);
  }

  if (phone) {
    const cleanPhone = normalizeChatId(phone);
    if (cleanPhone) humanTakeovers.delete(cleanPhone);
  }

  saveTakeoversToDisk();
}

/**
 * فحص هل المحادثة حالياً في وضع التحدث البشري (موقوفة للرد الآلي)
 */
function isHumanModeActive(jid, phone) {
  const now = Date.now();

  const keysToCheck = [jid, phone, normalizeChatId(jid), normalizeChatId(phone)].filter(Boolean);

  for (const k of keysToCheck) {
    if (humanTakeovers.has(k)) {
      const entry = humanTakeovers.get(k);
      if (entry && entry.expiresAt > now) {
        return true;
      }
      // منتهية الصلاحية
      humanTakeovers.delete(k);
    }
  }

  return false;
}

/**
 * جلب تفاصيل الوقت المتبقي لوضع التحدث البشري
 */
function getHumanModeDetails(jid, phone) {
  const now = Date.now();
  const keysToCheck = [jid, phone, normalizeChatId(jid), normalizeChatId(phone)].filter(Boolean);

  for (const k of keysToCheck) {
    if (humanTakeovers.has(k)) {
      const entry = humanTakeovers.get(k);
      if (entry && entry.expiresAt > now) {
        const remainingMinutes = Math.ceil((entry.expiresAt - now) / (60 * 1000));
        return {
          isActive: true,
          remainingMinutes,
          reason: entry.reason,
          expiresAt: new Date(entry.expiresAt)
        };
      }
    }
  }

  return { isActive: false, remainingMinutes: 0 };
}

/**
 * استخراج كافة المحادثات النشطة حالياً
 */
function getAllActiveTakeovers() {
  const now = Date.now();
  const list = [];
  const seen = new Set();

  for (const [key, val] of humanTakeovers.entries()) {
    if (val && val.expiresAt > now) {
      const clean = normalizeChatId(key);
      if (!seen.has(clean)) {
        seen.add(clean);
        list.push({
          target: key,
          cleanTarget: clean,
          remainingMinutes: Math.ceil((val.expiresAt - now) / (60 * 1000)),
          reason: val.reason,
          expiresAt: new Date(val.expiresAt)
        });
      }
    }
  }

  return list;
}

/**
 * فحص هل نص الرسالة يمثل رغبة العميل في التحدث مع شخص بشري
 */
function isRequestingHumanAgent(text) {
  if (!text) return false;
  const humanRequestRegex = /(?:خدمة\s*العملاء|شخص\s*بشري|حد\s*بشري|موظف|مسؤول|مسئول|مهندس\s*محمود|م\.\s*محمود|كلمني\s*فون|عايز\s*(?:أكلم|اكلم)|عاوز\s*(?:أكلم|اكلم)|محتاج\s*(?:أكلم|اكلم)|مش\s*عايز\s*بوت|مش\s*عاوز\s*بوت|انت\s*بوت|إنت\s*بوت|رقم\s*(?:الادارة|الإدارة|التواصل|الاتصال)|ممكن\s*أكلمك|ممكن\s*اكلمك)/i;
  return humanRequestRegex.test(text);
}

/**
 * معالجة رسالة صادرة من الأدمن مباشرة (fromMe = true وليست من البوت)
 */
async function handleAdminOutgoingMessage({ targetJid, text, msg, sock, logEvent }) {
  const cleanPhone = normalizeChatId(targetJid);
  const trimmedText = (text || '').trim();

  // 1. أمر استئناف الرد التلقائي فوراً
  if (/^#(?:تشغيل_البوت|تفعيل_البوت|شغل_البوت|تفعيل|تشغيل|resume)$/i.test(trimmedText)) {
    clearHumanMode(targetJid, cleanPhone);
    if (logEvent) {
      logEvent('تحكم البوت', `تم استئناف الرد التلقائي فوراً للشات: ${cleanPhone || targetJid}`, 'info');
    }
    try {
      if (sock && msg?.key) {
        await sock.sendMessage(targetJid, { react: { text: '▶️', key: msg.key } });
      }
    } catch (_) {}
    return { action: 'resumed', targetJid };
  }

  // 2. أمر إيقاف البوت 24 ساعة
  if (/^#(?:ايقاف_البوت|إيقاف_البوت|وقف_البوت|توقف_البوت|صامت|توقف|pause)$/i.test(trimmedText)) {
    setHumanMode(targetJid, cleanPhone, EXTENDED_TAKEOVER_MS, 'إيقاف يدوي من الأدمن 24 ساعة');
    if (logEvent) {
      logEvent('تحكم البوت', `تم إيقاف البوت لمدة 24 ساعة للشات: ${cleanPhone || targetJid}`, 'info');
    }
    try {
      if (sock && msg?.key) {
        await sock.sendMessage(targetJid, { react: { text: '⏸️', key: msg.key } });
      }
    } catch (_) {}
    return { action: 'paused_24h', targetJid };
  }

  // 3. أمر الاستعلام عن حالة البوت للشات
  if (/^#(?:حالة_البوت|حاله_البوت|status)$/i.test(trimmedText)) {
    const details = getHumanModeDetails(targetJid, cleanPhone);
    try {
      if (sock && msg?.key) {
        const emoji = details.isActive ? '⏸️' : '▶️';
        await sock.sendMessage(targetJid, { react: { text: emoji, key: msg.key } });
      }
    } catch (_) {}
    return { action: 'status_checked', targetJid, details };
  }

  // 4. رسالة عادية أرسلها الأدمن للعميل (نص، صورة، فويس، مستند...)
  // نفعل وضع التحدث البشري ونوقف البوت لمدة 30 دقيقة لمنع أي تداخل
  setHumanMode(targetJid, cleanPhone, DEFAULT_TAKEOVER_MS, 'محادثة بشرية جارية من المطور (30 دقيقة)');
  if (logEvent) {
    logEvent('تدخل بشري مكتشف', `المهندس محمود يراسل ${cleanPhone || targetJid} - تم إيقاف البوت تلقائياً لمدة 30 دقيقة`, 'info');
  }

  return { action: 'takeover_activated', targetJid };
}

module.exports = {
  wrapSocketSendMessage,
  isBotSentMessage,
  setHumanMode,
  clearHumanMode,
  isHumanModeActive,
  getHumanModeDetails,
  getAllActiveTakeovers,
  isRequestingHumanAgent,
  handleAdminOutgoingMessage,
  DEFAULT_TAKEOVER_MS,
  EXTENDED_TAKEOVER_MS,
  CUSTOMER_REQUEST_MS
};
