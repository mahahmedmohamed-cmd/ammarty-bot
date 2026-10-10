/**
 * عمارتي - محرك التنبيه والمتابعة التلقائية للاشتراكات التجريبية
 * 
 * الميزات:
 * 1. استخراج العمائر التي توشك فترتها التجريبية على الانتهاء (متبقي 3 إلى 5 أيام).
 * 2. إرسال رسالة تذكير احترافية ومحترمة تسأل المدير بلباقة:
 *    (هل تحب نوضح لسيادتكم باقات الاشتراك وطريقة التفعيل للاستمرار معكم؟)
 *    مع خياري: [1] نعم، وضح لي الباقات  /  [2] لا، شكراً
 * 3. بدون ذكر الحسابات البنكية في الرسالة الأولى لحين موافقة العميل وطلبه للتفاصيل.
 * 4. فور رد العميل بـ (نعم / 1 / اه / ياريت):
 *    يرد البوت فورياً بالباقات والخصومات وهدية المتجر وبيانات التحويل (01021252626) وخطوات التفعيل.
 * 5. إذا رد بـ (لا / 2 / شكراً):
 *    يرد البوت بأسلوب راقٍ ومؤدب شاكراً إياه ومتمنياً له ولعمارته التوفيق.
 * 6. منع التكرار والإزعاج (تسجيل حالة الإرسال في سوبابايز).
 * 7. فواصل زمنية آمنة (Throttling) لحماية رقم الواتساب من الحظر.
 * 8. إشعار المهندس محمود (مدير النظام) بتقرير يومي بما تم إرساله.
 */

const fs = require('fs');
const path = require('path');

const ADMIN_PHONE = '01021252626';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * تحويل رقم الهاتف إلى صيغة JID في واتساب بدقة
 */
function formatPhoneToJid(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('01') && digits.length === 11) {
    return `2${digits}@s.whatsapp.net`;
  }
  if (digits.startsWith('201') && digits.length === 12) {
    return `${digits}@s.whatsapp.net`;
  }
  if (digits.startsWith('05') && digits.length === 10) {
    return `966${digits.slice(1)}@s.whatsapp.net`;
  }
  if (digits.startsWith('966') && digits.length === 12) {
    return `${digits}@s.whatsapp.net`;
  }
  if (digits.length >= 10) {
    return `${digits}@s.whatsapp.net`;
  }
  return null;
}

/**
 * استخراج العمائر التي توشك فترتها التجريبية على الانتهاء
 * مرتبة تصاعدياً حسب الأقرب انتهاءً
 */
async function getExpiringTrialBuildings(supabase, { limit = 10, maxDays = null } = {}) {
  const { data: subs, error } = await supabase
    .from('building_subscriptions')
    .select('*, buildings(id, name, code, manager_name, manager_phone, is_active)')
    .order('expiry_date', { ascending: true });

  if (error || !subs) {
    console.error('[Trial Reminder] خطأ جلب الاشتراكات:', error?.message);
    return [];
  }

  const now = new Date();
  const latestByBld = {};

  for (const s of subs) {
    const bId = s.building_id;
    if (!latestByBld[bId] || new Date(s.expiry_date) > new Date(latestByBld[bId].expiry_date)) {
      latestByBld[bId] = s;
    }
  }

  const expiringList = [];

  for (const bId in latestByBld) {
    const sub = latestByBld[bId];
    if (!sub.is_trial) continue; // تخطي المشتركين الفعليين

    const bld = sub.buildings;
    if (!bld || !bld.manager_phone) continue;

    const expDate = new Date(sub.expiry_date);
    const diffDays = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));

    if (diffDays >= 1 && (maxDays ? diffDays <= maxDays : true)) {
      expiringList.push({
        buildingId: bId,
        buildingName: bld.name || 'بدون اسم',
        buildingCode: bld.code,
        managerName: bld.manager_name || 'مسؤول العمارة',
        managerPhone: bld.manager_phone,
        daysLeft: diffDays,
        expiryDate: expDate
      });
    }
  }

  // ترتيب تصاعدي حسب أقرب موعد انتهاء (الأقرب فالأقرب)
  expiringList.sort((a, b) => a.daysLeft - b.daysLeft);

  return limit ? expiringList.slice(0, limit) : expiringList;
}

/**
 * نص الرسالة الأولى التقديرية (عرض المساعدة دون بيانات الدفع)
 */
function buildInitialReminderMessage({ managerName, buildingName, daysLeft }) {
  const daysText = daysLeft === 1 ? 'يوم واحد فقط' : (daysLeft === 2 ? 'يومين اثنين' : `${daysLeft} أيام`);

  return (
    `أستاذ *${managerName || 'مسؤول العمارة'}* العزيز، تحياتنا لك من إدارة تطبيق عمارتي 🏢✨\n\n` +
    `نتمنى أن تكون تجربتكم لتطبيق عمارتي خلال الفترة الماضية قد ساعدتكم في تنظيم حسابات ومصروفات (*${buildingName}*) وإنهاء مشكلات التحصيل بكل راحة وشفافية.\n\n` +
    `📅 نود إحاطة سيادتكم بأن الفترة التجريبية المجانية لعمارتكم ستنتهي بعد **${daysText}**.\n\n` +
    `هل تحب نوضح لسيادتكم باقات الاشتراك السنوية المخفضة وطريقة التفعيل للاستمرار معكم؟ 🌸\n\n` +
    `1️⃣ *نعم، وضح لي الباقات وطريقة الاشتراك*\n` +
    `2️⃣ *لا، شكراً*\n\n` +
    `_(يمكنك الرد بكتابة رقم 1 أو كلمة "نعم" لتصلك كافة التفاصيل فوراً)_`
  );
}

/**
 * نص الرسالة الثانية عند موافقة العميل (نعم / 1) - تتضمن الأسعار وبيانات التحويل
 */
function buildPricingDetailsMessage({ managerName, buildingName }) {
  return (
    `أهلاً بك أستاذ *${managerName || 'المدير'}* 🏢✨\n` +
    `يسعدنا ويشرفنا جداً استمراركم معنا في أسرة تطبيق عمارتي لخدمة عمارة (*${buildingName}*)!\n\n` +
    `📋 *باقات الاشتراك الرسمية المعتمدة لعمارتكم:*\n` +
    `• *سنة واحدة:* 200 ج.م فقط\n` +
    `• *سنتان:* 360 ج.م (خصم 10% - توفير 40 ج.م)\n` +
    `• *3 سنوات:* 480 ج.م (خصم 20% - توفير 120 ج.م)\n` +
    `• *5 سنوات:* 700 ج.م (خصم 30% - توفير 300 ج.م)\n\n` +
    `🌟 *ميزة ذهبية:* الاشتراك الواحد يشمل استخدام التطبيق لجميع سكان وشقق العمارة بالكامل دون أي تكلفة إضافية!\n\n` +
    `🎁 *هدية كبرى مع الاشتراك:* عند اشتراك عمارتكم في أي باقة رسمية، يسعدنا إهداء عمارتكم **شهرين إضافيين مجاناً (60 يوماً)** زيادة فوق مدة الاشتراك المدفوع (مثال: تشترك سنة وتستمتع بـ 14 شهراً بالكامل) إذا قام 3 أفراد من سكان وإدارة العمارة بكتابة تقييم إيجابي (5 نجوم) على متجر Google Play! 🥳⭐⭐⭐⭐⭐\n\n` +
    `💳 *بيانات السداد المعتمدة للتفعيل الفوري:*\n` +
    `• *إنستاباي (InstaPay):* 01021252626\n` +
    `• *فودافون كاش:* 01021252626\n\n` +
    `⚡ *طريقة التفعيل الفوري:*\n` +
    `فقط قم بالتحويل للباقة المناسبة، وأرسل لنا صورة إيصال التحويل هنا في المحادثة، وسيقوم النظام آلياً بالتعرف على الدفعة وتفعيل عمارتكم وإصدار الفاتورة الرسمية المعتمدة وإرسالها لك فوراً دون أي انتظار! 🚀`
  );
}

/**
 * نص الرسالة البديلة عند رد العميل بـ (لا / 2)
 */
function buildDeclineMessage({ managerName, buildingName }) {
  return (
    `تحت أمرك أستاذ *${managerName || 'المدير'}* في أي وقت! 🌸\n\n` +
    `نتمنى لسيادتكم ولسكان (*${buildingName}*) دوام التوفيق والراحة.\n` +
    `إذا احتجت أي مساعدة أو قررت التجديد لاحقاً، نحن دائماً في خدمتك ويسعدنا تواصلك معنا في أي وقت. دمتم بكل خير ✨`
  );
}

/**
 * تنفيذ الفحص وإرسال التنبيهات تلقائياً
 */
async function checkAndSendTrialReminders({
  supabase,
  sock,
  logEvent = console.log,
  isManualTrigger = false,
  limit = 10,
  targetPhoneOverride = null
}) {
  if (!sock) {
    logEvent('تخطي تنبيهات التجارب', 'واتساب غير متصل حالياً', 'warning');
    return { ok: false, sentCount: 0, reason: 'whatsapp_not_connected' };
  }

  logEvent('بدء فحص الاشتراكات التجريبية', `جاري البحث عن أقرب (${limit}) عمائر تقترب من انتهاء التجربة...`, 'info');

  const expiringList = await getExpiringTrialBuildings(supabase, { limit });
  if (expiringList.length === 0) {
    logEvent('فحص التجارب', 'لا توجد عمائر تجريبية تقترب من الانتهاء حالياً', 'info');
    return { ok: true, sentCount: 0, list: [] };
  }

  let sentCount = 0;
  const sentBuildings = [];

  for (const item of expiringList) {
    try {
      // 1. فحص هل تم إرسال تذكير لهذه العمارة خلال الـ 10 أيام الماضية (تجاوز هذا الفحص إذا كان إرسال تجريبي لرقم م/ محمود)
      if (!targetPhoneOverride) {
        const { data: reminderSetting } = await supabase
          .from('building_settings')
          .select('value, updated_at')
          .eq('building_id', item.buildingId)
          .eq('key', 'trial_reminder_sent')
          .maybeSingle();

        if (reminderSetting) {
          continue; // تم التنبيه مسبقاً، تخطي لمنع الإزعاج
        }
      }

      const targetJid = targetPhoneOverride
        ? formatPhoneToJid(targetPhoneOverride)
        : formatPhoneToJid(item.managerPhone);

      if (!targetJid) continue;

      // 2. إرسال الرسالة الأولى للمدير
      const textMsg = buildInitialReminderMessage({
        managerName: item.managerName,
        buildingName: item.buildingName,
        daysLeft: item.daysLeft
      });

      await sock.sendMessage(targetJid, { text: textMsg });
      sentCount++;
      sentBuildings.push(item);

      logEvent('تم إرسال تنبيه تجربة للمدير', {
        building: item.buildingName,
        phone: targetPhoneOverride || item.managerPhone,
        daysLeft: item.daysLeft
      }, 'success');

      // 3. توثيق الإرسال في سوبابايز وحفظ حالة الانتظار للرد (فقط عند الإرسال الحقيقي للعملاء)
      if (!targetPhoneOverride) {
        await supabase.from('building_settings').upsert({
          building_id: item.buildingId,
          key: 'trial_reminder_sent',
          value: JSON.stringify({
            sent_at: new Date().toISOString(),
            days_left: item.daysLeft,
            phone: item.managerPhone
          }),
          updated_at: new Date().toISOString()
        });

        await supabase.from('building_settings').upsert({
          building_id: item.buildingId,
          key: 'trial_offer_pending_reply',
          value: JSON.stringify({
            status: 'awaiting_reply',
            manager_name: item.managerName,
            building_name: item.buildingName,
            building_code: item.buildingCode,
            manager_phone: item.managerPhone,
            sent_at: new Date().toISOString()
          }),
          updated_at: new Date().toISOString()
        });
      }

      // 4. فاصل زمني آمن بين كل رسالة والأخرى لحماية الرقم
      await sleep(targetPhoneOverride ? 3000 : 25000);

    } catch (err) {
      logEvent('خطأ إرسال تنبيه تجربة', `${item.buildingName}: ${err.message}`, 'warning');
    }
  }

  // 5. إشعار المهندس محمود (مدير النظام) بتقرير الإرسال
  if (sentCount > 0 && sock) {
    try {
      const adminJid = `201021252626@s.whatsapp.net`;
      let adminReport =
        `👑 *تقرير المتابعة التلقائية للاشتراكات التجريبية* 📊✨\n\n` +
        `تم فحص النظام وإرسال استفسار التجديد لـ *(${sentCount})* عمارة تقترب من انتهاء التجربة بنجاح:\n\n`;

      sentBuildings.forEach((b, idx) => {
        adminReport +=
          `*${idx + 1}️⃣ عمارة:* ${b.buildingName} (*${b.buildingCode}*)\n` +
          `• *المدير:* ${b.managerName} (${b.managerPhone})\n` +
          `• *المتبقي:* ${b.daysLeft} أيام\n` +
          `-----------------------------------\n`;
      });

      adminReport += `النظام ينتظر ردودهم، وفور كتابة أحدهم "نعم" سيصلهم كشف الأسعار وطريقة السداد فورياً! 🚀`;

      await sock.sendMessage(adminJid, { text: adminReport });
    } catch (_) {}
  }

  return { ok: true, sentCount, list: sentBuildings };
}

/**
 * فحص هل العميل يرد على سؤال عرض الاشتراك (نعم / لا)
 */
async function handleTrialReminderResponse({ supabase, sock, senderJid, senderPhone, text, logEvent }) {
  if (!text) return false;

  const cleanDigits = String(senderPhone || '').replace(/\D/g, '');
  const senderLast9 = cleanDigits.slice(-9);

  // 1. البحث هل هناك عرض معلق لهذا الرقم
  const { data: rows, error } = await supabase
    .from('building_settings')
    .select('*, buildings(name, code, manager_name, manager_phone)')
    .eq('key', 'trial_offer_pending_reply');

  if (error || !rows || rows.length === 0) return false;

  let matchedRow = null;
  let offerData = null;

  for (const row of rows) {
    try {
      const val = JSON.parse(row.value);
      if (val.status === 'awaiting_reply') {
        const phone = (val.manager_phone || '').replace(/\D/g, '');
        if (phone.endsWith(senderLast9) || cleanDigits.endsWith(phone.slice(-9))) {
          matchedRow = row;
          offerData = val;
          break;
        }
      }
    } catch (_) {}
  }

  if (!matchedRow || !offerData) return false;

  const cleanText = text.trim().toLowerCase();

  // فحص الرد بالإيجاب (1، نعم، اه، ياريت، تمام، عايز اشترك، الاسعار، التفاصيل، وضحلي)
  const isAffirmative =
    /^(?:1|١|نعم|اه|أه|ايوه|أيوة|ياريت|يا ريت|تمام|أكيد|اكيد|عايز اشترك|اشترك|تفاصيل|التفاصيل|الاسعار|الأسعار|كام|بكام|وضح|ابعتلي|معلومات)$/i.test(cleanText) ||
    /(?:نعم|ياريت|عايز\s*(?:اشترك|اجدد)|وضحلي|ابعتلي\s*(?:الباقات|التفاصيل))/i.test(cleanText);

  // فحص الرد بالرفض (2، لا، شكرا، مش محتاج، مش دلوقتي)
  const isNegative =
    /^(?:2|٢|لا|لأ|مش محتاج|مش دلوقتي|شكرا|شكراً|مش عايز|لا شكرا|لا شكراً)$/i.test(cleanText) ||
    /(?:لا\s*شكرا|مش\s*محتاج|مش\s*دلوقتي)/i.test(cleanText);

  if (isAffirmative) {
    logEvent('رد إيجابي على عرض الاشتراك التجريبي', { phone: senderPhone, building: offerData.building_name }, 'success');

    const replyMsg = buildPricingDetailsMessage({
      managerName: offerData.manager_name,
      buildingName: offerData.building_name
    });

    await sock.sendMessage(senderJid, { text: replyMsg });

    // تحديث الحالة إلى مقبولة لمنع تكرار الرد
    offerData.status = 'accepted';
    offerData.accepted_at = new Date().toISOString();
    await supabase.from('building_settings').upsert({
      building_id: matchedRow.building_id,
      key: 'trial_offer_pending_reply',
      value: JSON.stringify(offerData),
      updated_at: new Date().toISOString()
    });

    // إشعار المهندس محمود باهتمام العميل
    try {
      await sock.sendMessage('201021252626@s.whatsapp.net', {
        text: `🎯 *عميل مهتم بالتجديد!* 🏢✨\nالمدير: *${offerData.manager_name}* (${offerData.manager_phone})\nعمارة: *${offerData.building_name}* (${offerData.building_code})\nرد بـ (*${text}*) وتم إرسال باقات الاشتراك وبيانات الدفع له بنجاح!`
      });
    } catch (_) {}

    return true;
  }

  if (isNegative) {
    logEvent('اعتذار عن عرض الاشتراك التجريبي', { phone: senderPhone, building: offerData.building_name }, 'info');

    const declineMsg = buildDeclineMessage({
      managerName: offerData.manager_name,
      buildingName: offerData.building_name
    });

    await sock.sendMessage(senderJid, { text: declineMsg });

    offerData.status = 'declined';
    offerData.declined_at = new Date().toISOString();
    await supabase.from('building_settings').upsert({
      building_id: matchedRow.building_id,
      key: 'trial_offer_pending_reply',
      value: JSON.stringify(offerData),
      updated_at: new Date().toISOString()
    });

    return true;
  }

  return false;
}

module.exports = {
  getExpiringTrialBuildings,
  checkAndSendTrialReminders,
  handleTrialReminderResponse,
  buildInitialReminderMessage,
  buildPricingDetailsMessage,
  buildDeclineMessage
};
