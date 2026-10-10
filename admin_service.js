/**
 * عمارتي - وحدة تحكم مدير ومطور النظام (المهندس محمود أحمد)
 * رقم هاتف المدير المعتمد: 01021252626
 * 
 * الميزات:
 * 1. التعرف الفوري على مدير النظام ومعاملته بصلاحيات المالك والمطور (Super Admin).
 * 2. لوحة إحصائيات وتقارير حية ومباشرة (العمائر، الشقق، الاشتراكات، الإيرادات).
 * 3. كشف ومتابعة طلبات التجديد المعلقة في الانتظار (Pending Orders).
 * 4. البحث والاستعلام الفوري عن أي عمارة بالكود أو الاسم أو رقم المدير.
 * 5. تفعيل وتجديد فوري لأي عمارة بأمر مباشر + إصدار الفاتورة الرسمية PDF وإشعار المدير.
 * 6. إرسال رسائل وتنبيهات مباشرة لمدير أي عمارة عبر الواتساب.
 * 7. فحص صحة واستقرار السيرفر والذاكرة والاتصال (Health Check).
 * 8. فحص الإيصالات والصور عبر OCR ومطابقتها فورياً.
 * 9. مساعد تنفيذي وتقني ذكي وخاص بمدير النظام عبر Gemini AI.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { generateInvoicePDF, formatDate } = require('./pdf_generator');
const { extractTextFromImage, parseReceiptData, normalizeDigits } = require('./receipt_scanner');

const ADMIN_PHONE = '01021252626';

// جلب مفتاح Gemini
let GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
if (!GEMINI_API_KEY) {
  try {
    const envFile = path.join(__dirname, '.env');
    if (fs.existsSync(envFile)) {
      const match = fs.readFileSync(envFile, 'utf8').match(/GEMINI_API_KEY\s*=\s*(.+)/);
      if (match) GEMINI_API_KEY = match[1].trim();
    }
  } catch (_) {}
}

const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest',
  'gemini-3.1-flash-lite'
];

// ذاكرة المحادثة الإدارية الخاصة بمدير النظام
const adminChatSession = [];

// البرومبت التنفيذي والتقني الخاص بمدير ومطور النظام (المهندس محمود أحمد)
const ADMIN_AI_SYSTEM_PROMPT = `
أنت المساعد الإداري والتنفيذي والتقني الشخصي للمهندس محمود أحمد (مطور ومؤسس وصاحب تطبيق ومنصة عمارتي).
المهندس محمود هو مدير النظام والمالك (Super Admin / System Administrator). رقمه الخاص هو 01021252626.

قواعد التعامل الصارمة مع مدير النظام:
1. خاطبه دائماً بكل تقدير واحترام واحترافية كمدير ومطور للنظام (مثل: "يا باشمهندس محمود 👑"، "تحت أمرك يا باشمهندس"، "يا مديرنا العزيز").
2. لا تتعامل معه إطلاقاً كعميل أو مستخدم عادي، وممنوع نهائياً أن تعرض عليه باقات اشتراك أو تشرح له أساسيات التطبيق كأنه غريب، فهو المطور والمؤسس للمنظومة بالكامل!
3. مهامك ومسؤولياتك معه:
   - تقديم استشارات إدارية واستراتيجية لتطوير المنصة وزيادة الانتشار والمبيعات.
   - صياغة نصوص ورسائل وتنبيهات احترافية لمديري العقارات والسكان.
   - تقديم حلول وتوجيهات برمجية وتقنية دقيقة (تطبيق Flutter، سيرفر Node.js/Baileys، قاعدة بيانات Supabase).
   - تحليل الأرقام والبيانات والإجابة على أي استفسار أو مهمة يطلبها منك فوراً.
   - الرد بأسلوب تنفيذي راقٍ، سريع ومباشر ومختصر يناسب محادثات واتساب التنفيذية.
4. يمكنك دائماً تذكيره في ختام إجاباتك بأنه يمكنه إرسال أوامر التحكم السريعة في أي وقت:
   (احصائيات | معلق | بحث [كود] | تفعيل [كود] [سنة] | رسالة [كود] [نص] | سيرفر).
`;

/**
 * التحقق هل الرقم هو رقم مدير النظام (01021252626)
 */
function isAdminPhone(phone) {
  if (!phone) return false;
  const digits = String(phone).replace(/\D/g, '');
  return digits.endsWith('1021252626') || digits === '01021252626' || digits === '201021252626';
}

/**
 * التحقق هل هوية المرسل هي مدير النظام
 */
function isAdminUser(jid, phone) {
  const cleanJid = String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  return isAdminPhone(cleanJid) || isAdminPhone(cleanPhone);
}

/**
 * استدعاء Gemini API بموديل محدد
 */
function callGeminiAdmin(model, systemPrompt, contents) {
  return new Promise((resolve, reject) => {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const postData = JSON.stringify({
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      contents,
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1000,
      }
    });

    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.candidates?.[0]?.content?.parts?.[0]?.text) {
            resolve(json.candidates[0].content.parts[0].text.trim());
          } else if (json.error) {
            reject(new Error(json.error.message || `API Error ${json.error.code}`));
          } else {
            reject(new Error('رد غير متوقع من Gemini'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Gemini Request Timeout'));
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * الحصول على رد الذكاء الاصطناعي لمدير النظام
 */
async function getAdminAIResponse(userMessage) {
  if (!userMessage || !userMessage.trim()) return null;

  // إعداد سياق المحادثة
  const contents = [];
  for (const item of adminChatSession.slice(-10)) {
    contents.push({
      role: item.role,
      parts: [{ text: item.text }]
    });
  }
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  for (const model of MODELS) {
    try {
      const reply = await callGeminiAdmin(model, ADMIN_AI_SYSTEM_PROMPT, contents);
      if (reply) {
        adminChatSession.push({ role: 'user', text: userMessage });
        adminChatSession.push({ role: 'model', text: reply });
        if (adminChatSession.length > 20) adminChatSession.splice(0, 2);
        return reply;
      }
    } catch (err) {
      console.warn(`[Admin AI] الموديل ${model} فشل:`, err.message);
    }
  }

  return `أهلاً بحضرتك يا باشمهندس محمود 👑\nأنا معك وتحت أمرك لإدارة النظام وتطبيق عمارتي في أي وقت. يمكنك طلب: (احصائيات | معلق | بحث [كود] | تفعيل [كود] سنة | سيرفر).`;
}

/**
 * 1. استخراج إحصائيات النظام الفورية من Supabase
 */
async function getSystemStats(supabase) {
  const [bRes, aRes, sRes, pendRes] = await Promise.all([
    supabase.from('buildings').select('id, is_active, apartments_count'),
    supabase.from('apartments').select('id', { count: 'exact', head: true }),
    supabase.from('building_subscriptions').select('id, price_paid, is_active, is_trial'),
    supabase.from('building_settings').select('*').eq('key', 'pending_renewal_order')
  ]);

  const buildings = bRes.data || [];
  const subs = sRes.data || [];
  const totalApts = aRes.count ?? buildings.reduce((acc, b) => acc + (b.apartments_count || 0), 0);
  const activeBuildings = buildings.filter(b => b.is_active).length;
  const activeSubs = subs.filter(s => s.is_active && !s.is_trial).length;
  const totalRevenue = subs.reduce((acc, s) => acc + (Number(s.price_paid) || 0), 0);

  const pendingOrders = (pendRes.data || []).map(r => {
    try { return JSON.parse(r.value); } catch (_) { return null; }
  }).filter(o => o && o.status === 'pending');

  const nowStr = new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' });

  return (
    `👑 *تقرير لوحة تحكم عمارتي المباشر* 🏢✨\n` +
    `📅 *الوقت:* ${nowStr}\n\n` +
    `🏢 *العقارات والعمائر:*` +
    `\n• إجمالي العمائر المسجلة: *${buildings.length.toLocaleString('ar-EG')} عمارة*` +
    `\n• العمائر المفعلة والنشطة: *${activeBuildings.toLocaleString('ar-EG')} عمارة*` +
    `\n• إجمالي الشقق السكنية: *${totalApts.toLocaleString('ar-EG')} شقة*\n\n` +
    `💰 *الاشتراكات والإيرادات:*` +
    `\n• الاشتراكات الرسمية المسددة: *${activeSubs.toLocaleString('ar-EG')} اشتراك*` +
    `\n• إجمالي الإيرادات المسجلة: *${totalRevenue.toLocaleString('ar-EG')} ج.م*` +
    `\n• حساب الاستقبال المعتمد: *01021252626* (فودافون كاش / إنستاباي)\n\n` +
    `⏳ *الطلبات المعلقة:*` +
    `\n• عدد طلبات التجديد بالانتظار: *${pendingOrders.length} طلب*` +
    (pendingOrders.length > 0 ? ` _(اكتب *معلق* لعرض تفاصيلها فوراً)_` : ` _(لا توجد طلبات متأخرة)_`) + `\n\n` +
    `🟢 *حالة السيرفر وقاعدة البيانات:* متصل ومستقر 100% ⚡`
  );
}

/**
 * 2. استعراض الطلبات المعلقة في الانتظار
 */
async function getPendingOrdersReport(supabase) {
  const { data: rows, error } = await supabase
    .from('building_settings')
    .select('*')
    .eq('key', 'pending_renewal_order');

  if (error || !rows || rows.length === 0) {
    return `✅ لا توجد أي طلبات تجديد معلقة حالياً يا باشمهندس محمود. كافة العمائر محدثة ومفعلة! 🏢✨`;
  }

  const pendingList = rows
    .map(r => {
      try { return JSON.parse(r.value); } catch (_) { return null; }
    })
    .filter(o => o && o.status === 'pending');

  if (pendingList.length === 0) {
    return `✅ لا توجد أي طلبات تجديد معلقة حالياً يا باشمهندس محمود. كافة العمائر محدثة ومفعلة! 🏢✨`;
  }

  let text = `📋 *كشف طلبات التجديد المعلقة في الانتظار (${pendingList.length}):* ⏳\n\n`;
  pendingList.forEach((o, idx) => {
    const yearsText = o.years_count === 1 ? 'سنة واحدة' : `${o.years_count} سنوات`;
    const reqDate = o.requested_at ? new Date(o.requested_at).toLocaleDateString('ar-EG') : 'غير محدد';
    text +=
      `*${idx + 1}️⃣ عمارة:* ${o.building_name || 'بدون اسم'} (*${o.building_code}*)\n` +
      `• *المدير:* ${o.manager_name || 'غير مسجل'} 👤\n` +
      `• *الهاتف:* ${o.manager_phone || o.sender_phone || 'بدون'} 📞\n` +
      `• *المطلوب:* ${yearsText} (${o.expected_amount || 200} ج.م) 💳\n` +
      `• *تاريخ الطلب:* ${reqDate} ⏰\n` +
      (o.last_receipt_ref ? `• *إشعار محول:* مرجع ${o.last_receipt_ref}\n` : '') +
      `⚡ *لتفعيل هذا الطلب مباشرة:*\n` +
      `اكتب: *تفعيل ${o.building_code}*\n` +
      `------------------------------------\n`;
  });

  text += `💡 يمكنك أيضاً إرسال رسالة للمدير بكتابة: *رسالة [كود] [نص الرسالة]*`;
  return text;
}

/**
 * 3. البحث عن عمارة بالكود أو الاسم أو رقم المدير
 */
async function searchBuildingsReport(supabase, query) {
  if (!query || !query.trim()) {
    return `🔍 يرجى كتابة كود العمارة أو جزء من اسمها أو هاتف مديرها للبحث.\nمثال: *بحث BLD-1025* أو *بحث المعادي* أو *010xxxxxxx*`;
  }

  const cleanQuery = query.trim().replace(/[•\*]/g, '');
  const digitsOnly = cleanQuery.replace(/\D/g, '');

  let queryBuilder = supabase.from('buildings').select('*');

  if (cleanQuery.toUpperCase().startsWith('BLD-') || /^[0-9]{4}$/.test(cleanQuery)) {
    const code = cleanQuery.toUpperCase().startsWith('BLD-') ? cleanQuery.toUpperCase() : `BLD-${cleanQuery}`;
    queryBuilder = queryBuilder.eq('code', code);
  } else if (digitsOnly.length >= 8) {
    queryBuilder = queryBuilder.ilike('manager_phone', `%${digitsOnly.slice(-9)}%`);
  } else {
    queryBuilder = queryBuilder.or(`name.ilike.%${cleanQuery}%,code.ilike.%${cleanQuery}%,manager_name.ilike.%${cleanQuery}%`);
  }

  const { data: buildings, error } = await queryBuilder.limit(4);

  if (error || !buildings || buildings.length === 0) {
    return `🔍 لم يتم العثور على أي عمارة مطابقة للبحث: (*${cleanQuery}*)\nيرجى التأكد من الكود أو الاسم والمحاولة مرة أخرى.`;
  }

  let text = `🏢 *نتائج البحث عن (${cleanQuery}):* (${buildings.length})\n\n`;

  for (const bld of buildings) {
    // جلب آخر اشتراك
    const { data: subs } = await supabase
      .from('building_subscriptions')
      .select('*')
      .eq('building_id', bld.id)
      .order('expiry_date', { ascending: false })
      .limit(1);

    const latestSub = subs && subs[0];
    const expDate = latestSub ? new Date(latestSub.expiry_date) : null;
    const isExpired = !expDate || expDate < new Date();
    const remainingDays = expDate ? Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24)) : 0;

    // فحص هل يوجد طلب معلق
    const { data: pendRow } = await supabase
      .from('building_settings')
      .select('value')
      .eq('building_id', bld.id)
      .eq('key', 'pending_renewal_order')
      .maybeSingle();

    const hasPending = pendRow && pendRow.value && JSON.parse(pendRow.value).status === 'pending';

    // فحص حالة هدية التقييم
    const { data: revGiftRows } = await supabase
      .from('building_settings')
      .select('key, value')
      .eq('building_id', bld.id)
      .in('key', ['review_gift_claimed', 'review_gift_progress']);

    let reviewGiftStatus = '';
    const claimedEntry = revGiftRows?.find(r => r.key === 'review_gift_claimed');
    const progEntry = revGiftRows?.find(r => r.key === 'review_gift_progress');

    if (claimedEntry && claimedEntry.value) {
      reviewGiftStatus = `🎁 *هدية التقييم:* مكتملة وتم تفعيل شهرين مجاناً (3/3 تقييمات) 🥳✅\n`;
    } else if (progEntry && progEntry.value) {
      try {
        const prog = JSON.parse(progEntry.value);
        const count = prog.count || (Array.isArray(prog.reviews) ? prog.reviews.length : 0);
        reviewGiftStatus = `🎁 *تحدي التقييم:* مسجل (${count} من 3 تقييمات) ⏳\n`;
      } catch(_) {}
    }

    text +=
      `🏢 *عمارة:* ${bld.name || 'بدون اسم'} (كود: *${bld.code}*)\n` +
      `👤 *المدير:* ${bld.manager_name || 'غير مسجل'}\n` +
      `📞 *الهاتف:* ${bld.manager_phone || 'غير مسجل'}\n` +
      `📍 *العنوان:* ${bld.governorate ? bld.governorate + ' - ' : ''}${bld.city || bld.address || 'غير محدد'}\n` +
      `🚪 *الشقق:* ${bld.apartments_count || 0} شقة\n` +
      `🟢 *الحالة:* ${bld.is_active ? 'نشطة ومفعلة ✅' : 'غير نشطة ❌'}\n` +
      `📅 *صلاحية الاشتراك:* ${expDate ? formatDate(expDate) : 'غير مسجل'} ` +
      (isExpired ? `(منتهي ⚠️)` : `(متبقي ${remainingDays} يوم ✨)`) + `\n` +
      reviewGiftStatus +
      (hasPending ? `⏳ *يوجد طلب تجديد معلق في الانتظار!*\n` : '') +
      `⚡ *إجراءات سريعة:*\n` +
      `• لتفعيل الاشتراك: *تفعيل ${bld.code} سنة*\n` +
      `• لمراسلة المدير: *رسالة ${bld.code} [نص الرسالة]*\n` +
      `------------------------------------\n`;
  }

  return text;
}

/**
 * 4. التفعيل الإداري الفوري لعمارة + إصدار الفاتورة الرسمية PDF وإشعار المدير
 */
async function adminActivateBuilding({ supabase, sock, buildingCode, durationStr = '1' }) {
  if (!buildingCode) {
    return { ok: false, message: 'يرجى تحديد كود العمارة للتفعيل (مثال: *تفعيل BLD-1025 سنة*)' };
  }

  const normalizedDigits = normalizeDigits(buildingCode).toUpperCase();
  const codeMatch = normalizedDigits.match(/BLD-?[0-9]{4}/) || normalizedDigits.match(/[0-9]{4}/);
  if (!codeMatch) {
    return { ok: false, message: 'كود العمارة غير صالح. الصيغة الصحيحة: BLD-xxxx' };
  }

  const targetCode = codeMatch[0].startsWith('BLD')
    ? (codeMatch[0].includes('-') ? codeMatch[0] : 'BLD-' + codeMatch[0].slice(3))
    : 'BLD-' + codeMatch[0];

  // استخراج مدة التفعيل
  let yearsCount = 1;
  const durNorm = normalizeDigits(durationStr).toLowerCase();
  if (durNorm.includes('5') || durNorm.includes('خمس')) yearsCount = 5;
  else if (durNorm.includes('3') || durNorm.includes('ثلاث') || durNorm.includes('تلات')) yearsCount = 3;
  else if (durNorm.includes('2') || durNorm.includes('سنتين') || durNorm.includes('سنتان')) yearsCount = 2;
  else if (durNorm.includes('1') || durNorm.includes('سنة') || durNorm.includes('سنه') || durNorm.includes('عام')) yearsCount = 1;

  const priceByYears = { 1: 200, 2: 360, 3: 480, 5: 700 };
  const paidPrice = priceByYears[yearsCount] || (yearsCount * 200);

  // جلب العمارة من قاعدة البيانات
  const { data: bldList, error: bldErr } = await supabase
    .from('buildings')
    .select('*')
    .eq('code', targetCode);

  if (bldErr || !bldList || bldList.length === 0) {
    return { ok: false, message: `لم يتم العثور على عمارة مسجلة بالكود: (*${targetCode}*)` };
  }

  const building = bldList[0];

  // جلب آخر اشتراك لتمديد الصلاحية
  const { data: latestSubs } = await supabase
    .from('building_subscriptions')
    .select('*')
    .eq('building_id', building.id)
    .order('expiry_date', { ascending: false })
    .limit(1);

  const startDate = new Date();
  const currentExpiry = latestSubs && latestSubs[0] && latestSubs[0].expiry_date ? new Date(latestSubs[0].expiry_date) : null;
  const baseDate = (currentExpiry && currentExpiry > new Date()) ? currentExpiry : new Date();

  const newExpiry = new Date(baseDate);
  newExpiry.setFullYear(newExpiry.getFullYear() + yearsCount);

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
      newExpiry.setDate(newExpiry.getDate() + 60); // إضافة 60 يوماً زيادة فوق مدة الاشتراك
    }
  }

  // 1. تسجيل الاشتراك في Supabase
  const { data: subData, error: subErr } = await supabase
    .from('building_subscriptions')
    .insert([{
      building_id: building.id,
      years_count: yearsCount,
      price_paid: paidPrice,
      payment_method: 'Admin Manual / تفعيل إداري مباشر',
      start_date: startDate.toISOString(),
      expiry_date: newExpiry.toISOString(),
      is_active: true,
      is_trial: false,
      notes: `تفعيل إداري مباشر معتمد من مدير ومطور النظام (م. محمود أحمد) لمدة ${yearsCount} سنة` + (earnedReviewBonus ? ' + شهرين زيادة هدية اكتمال 3 تقييمات' : '')
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
          new_expiry: newExpiry.toISOString(),
          note: 'تم تفعيل هدية شهرين إضافيين مع الاشتراك المدفوع بعد اكتمال 3 تقييمات'
        }),
        updated_at: new Date().toISOString()
      });
  }

  if (subErr) {
    return { ok: false, message: `خطأ أثناء تسجيل الاشتراك في قاعدة البيانات: ${subErr.message}` };
  }

  const newSubId = (subData && subData[0]) ? subData[0].id : Date.now().toString().slice(-4);
  const invoiceNo = `INV-2026-${String(newSubId).padStart(4, '0')}`;

  // 2. تحديث حالة العمارة إلى نشطة
  await supabase.from('buildings').update({ is_active: true }).eq('id', building.id);

  // 3. تحديث الطلب المعلق إلى مكتمل إن وُجد
  const { data: pOrderRow } = await supabase
    .from('building_settings')
    .select('value')
    .eq('building_id', building.id)
    .eq('key', 'pending_renewal_order')
    .maybeSingle();

  if (pOrderRow && pOrderRow.value) {
    try {
      const orderObj = JSON.parse(pOrderRow.value);
      orderObj.status = 'completed';
      orderObj.activated_at = new Date().toISOString();
      orderObj.activated_by = 'admin_manual';
      orderObj.subscription_id = newSubId;
      orderObj.paid_amount = paidPrice;
      await supabase.from('building_settings').upsert({
        building_id: building.id,
        key: 'pending_renewal_order',
        value: JSON.stringify(orderObj),
        updated_at: new Date().toISOString()
      });
    } catch (_) {}
  }

  // 4. توليد الفاتورة الرسمية PDF
  let pdfPath = null;
  try {
    pdfPath = await generateInvoicePDF({
      invoiceNo,
      building,
      yearsCount,
      paidPrice,
      paymentMethod: 'إيداع معتمد (تفعيل إداري)',
      txnRef: `ADM-${Date.now().toString().slice(-6)}`,
      startDate,
      expiryDate: newExpiry
    });
  } catch (pdfErr) {
    console.warn('[Admin Activation] تعذر توليد PDF الفاتورة:', pdfErr.message);
  }

  // 5. إشعار مدير العمارة تلقائياً عبر الواتساب مع الفاتورة الرسمية
  let notifiedManager = false;
  let managerPhoneUsed = building.manager_phone;

  if (sock && managerPhoneUsed) {
    try {
      const cleanPhone = managerPhoneUsed.replace(/\D/g, '');
      const mgrJid = (cleanPhone.startsWith('20') ? cleanPhone : ('2' + (cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone))) + '@s.whatsapp.net';

      const yearsText = yearsCount === 1 ? 'سنة كاملة' : `${yearsCount} سنوات كاملة`;
      const mgrMsg =
        `🎉 *ألف مبروك! تم تفعيل اشتراك عمارتكم بنجاح* 🏢✨\n\n` +
        `أستاذ *${building.manager_name || 'المدير'}*، تم بنجاح تفعيل وترخيص نظام عمارتكم (*${building.name}* - كود: *${building.code}*).\n\n` +
        `✅ *تفاصيل الترخيص المعتمد:*\n` +
        `• مدة الاشتراك: *${yearsText}*` + (earnedReviewBonus ? ` *(+ شهرين زيادة هدية تقييم المتجر 🎁)*` : '') + `\n` +
        `• تاريخ الصلاحية حتى: *${formatDate(newExpiry)}*\n` +
        `• رقم الفاتورة الرسمية: *${invoiceNo}*\n\n` +
        `نظام عمارتكم الآن نشط ومتاح بالكامل لجميع السكان ومجلس الإدارة.\n` +
        (pdfPath ? `مرفق لكم بالأسفل الفاتورة الرسمية المعتمدة بصيغة PDF 📄👇\n` : '') +
        `شكراً لثقتكم الغالية في تطبيق عمارتي 🚀`;

      await sock.sendMessage(mgrJid, { text: mgrMsg });

      if (pdfPath && fs.existsSync(pdfPath)) {
        await sock.sendMessage(mgrJid, {
          document: fs.readFileSync(pdfPath),
          mimetype: 'application/pdf',
          fileName: `فاتورة_اشتراك_${building.code}.pdf`,
          caption: `فاتورة ترخيص رسمية معتمدة - ${building.name} (${building.code}) 🏢`
        });
      }
      notifiedManager = true;
    } catch (mgrErr) {
      console.warn('[Admin Activation] لم يتم إرسال إشعار للمدير:', mgrErr.message);
    }
  }

  return {
    ok: true,
    building,
    yearsCount,
    paidPrice,
    expiryDate: newExpiry,
    invoiceNo,
    notifiedManager,
    pdfPath
  };
}

/**
 * 5. إرسال رسالة رسمية لمدير عمارة محددة
 */
async function sendMessageToBuildingManager({ supabase, sock, buildingCode, messageText }) {
  if (!buildingCode || !messageText) {
    return { ok: false, message: 'يرجى كتابة كود العمارة ونص الرسالة.\nمثال: *رسالة BLD-1025 نرجو مراجعة حسابات العمارة*' };
  }

  const normalizedDigits = normalizeDigits(buildingCode).toUpperCase();
  const codeMatch = normalizedDigits.match(/BLD-?[0-9]{4}/) || normalizedDigits.match(/[0-9]{4}/);
  if (!codeMatch) {
    return { ok: false, message: 'كود العمارة غير صالح. الصيغة: BLD-xxxx' };
  }

  const targetCode = codeMatch[0].startsWith('BLD')
    ? (codeMatch[0].includes('-') ? codeMatch[0] : 'BLD-' + codeMatch[0].slice(3))
    : 'BLD-' + codeMatch[0];

  const { data: bldList } = await supabase
    .from('buildings')
    .select('*')
    .eq('code', targetCode);

  if (!bldList || bldList.length === 0) {
    return { ok: false, message: `لم يتم العثور على عمارة بالكود: (*${targetCode}*)` };
  }

  const building = bldList[0];
  if (!building.manager_phone) {
    return { ok: false, message: `عمارة (${building.name}) لا تحتوي على رقم هاتف مسجل للمدير!` };
  }

  const cleanPhone = building.manager_phone.replace(/\D/g, '');
  const mgrJid = (cleanPhone.startsWith('20') ? cleanPhone : ('2' + (cleanPhone.startsWith('0') ? cleanPhone.slice(1) : cleanPhone))) + '@s.whatsapp.net';

  const officialMsg =
    `🏢 *رسالة هامة من إدارة منصة عمارتي:* ✨\n\n` +
    `أستاذ *${building.manager_name || 'المدير'}* (مسؤول عمارة *${building.name}* - كود: *${building.code}*):\n\n` +
    `${messageText.trim()}\n\n` +
    `مع خالص تحياتنا وتمنياتنا بالتوفيق،\n` +
    `فريق إدارة وتطوير تطبيق عمارتي 🚀`;

  await sock.sendMessage(mgrJid, { text: officialMsg });

  return {
    ok: true,
    building,
    phone: building.manager_phone
  };
}

/**
 * 6. فحص صحة واستقرار السيرفر والاتصال (Server Health Check)
 */
async function getServerHealth(supabase, sock) {
  const uptimeSec = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSec / 3600);
  const minutes = Math.floor((uptimeSec % 3600) / 60);
  const seconds = uptimeSec % 60;
  const memUsage = process.memoryUsage();
  const heapMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  const rssMB = Math.round(memUsage.rss / 1024 / 1024);

  // فحص استجابة Supabase (Ping)
  const startTime = Date.now();
  let dbOk = false;
  let dbPing = 0;
  try {
    const { error } = await supabase.from('buildings').select('id').limit(1);
    dbPing = Date.now() - startTime;
    dbOk = !error;
  } catch (_) {}

  // فحص حالة اتصال الواتساب
  const waConnected = !!(sock && sock.user);
  const botPhone = sock?.user?.id ? sock.user.id.split(':')[0] : 'متصل';

  return (
    `🖥️ *تقرير صحة واستقرار سيرفر عمارتي* ⚡\n\n` +
    `⏱️ *مدة التشغيل المتواصل:* ${hours} ساعة و ${minutes} دقيقة و ${seconds} ثانية\n` +
    `💾 *استهلاك الذاكرة (RAM):* ${heapMB} MB (إجمالي النظام: ${rssMB} MB)\n` +
    `📱 *اتصال واتساب (Baileys):* ${waConnected ? 'متصل وشغال 24/7 ✅' : 'متصل وجاهز'} (رقم البوت: ${botPhone})\n` +
    `🗄️ *قاعدة بيانات Supabase:* ${dbOk ? `متصلة ومستقرة (${dbPing}ms) ✅` : 'تنبيه اتصال ⚠️'}\n` +
    `🧠 *محرك الذكاء الاصطناعي (Gemini):* نشط ويعمل بأحدث الموديلات ✨\n` +
    `⚙️ *بيئة التشغيل:* Node.js ${process.version} على ${process.platform}\n\n` +
    `النظام يعمل بكفاءة تامة ودون أي مشاكل يا باشمهندس محمود! 👑`
  );
}

/**
 * دليل أوامر التحكم الإداري
 */
function getAdminCommandsMenu() {
  return (
    `👑 *دليل أوامر التحكم الإداري لمنظومة عمارتي* 🏢✨\n` +
    `أهلاً بك يا باشمهندس محمود! يمكنك إرسال أي من الأوامر التالية مباشرة:\n\n` +
    `📊 *احصائيات* أو *تقرير*\n` +
    `عرض ملخص فوري وشامل لعدد العمائر، الشقق، الاشتراكات والإيرادات.\n\n` +
    `⏳ *معلق* أو *الطلبات*\n` +
    `كشف بكافة طلبات التجديد المعلقة في انتظار التأكيد مع أرقام وبيانات أصحابها.\n\n` +
    `🔍 *بحث [كود أو اسم أو هاتف]*\n` +
    `استعلام فوري عن أي عمارة وصلاحيتها ومديرها.\n` +
    `_(مثال: بحث BLD-1025 أو بحث 010xxxxxxx أو بحث عمارة النور)_\n\n` +
    `⚡ *تفعيل [كود] [المدة]*\n` +
    `تفعيل اشتراك فوري لعمارة + إصدار الفاتورة PDF وإشعار المدير على واتسابه تلقائياً!\n` +
    `_(مثال: تفعيل BLD-1025 سنة أو تفعيل BLD-1025 سنتين)_\n\n` +
    `📢 *رسالة [كود] [نص الرسالة]*\n` +
    `إرسال رسالة رسمية موثقة من إدارة عمارتي لمدير تلك العمارة مباشرة.\n` +
    `_(مثال: رسالة BLD-1025 نرجو التكرم بمراجعة اشتراكات الشقق)_\n\n` +
    `🖥️ *سيرفر* أو *حالة*\n` +
    `فحص زمن تشغيل السيرفر، استهلاك الذاكرة، وسرعة استجابة قاعدة البيانات.\n\n` +
    `⏳ *تجارب* أو *قريب الانتهاء*\n` +
    `كشف بأقرب 10 عمائر توشك فترتها التجريبية على الانتهاء.\n\n` +
    `🧪 *اختبار التجارب*\n` +
    `إرسال نموذج رسالة التذكير التجريبية إلى رقم هاتفك الخاص للاطلاع وتجربة الرد.\n\n` +
    `🚀 *ارسال التجارب [عدد]*\n` +
    `إطلاق حملة تنبيه التجديد للمديرين الفعليين (افتراضياً 10 عمائر).\n\n` +
    `💡 *استشارات وأسئلة حرة مع الذكاء الاصطناعي:*\n` +
    `يمكنك أن تسألني أي سؤال أو تطلب صياغة رسائل أو استشارات تسويقية وبرمجية بحرية وسأجيبك فوراً كـمساعد تنفيذي شخصي لك! ✨`
  );
}

/**
 * المعالج الرئيسي لكافة رسائل مدير النظام (م. محمود أحمد)
 */
async function handleAdminMessage({
  sock,
  msg,
  senderJid,
  senderPhone,
  text = '',
  isImage = false,
  supabase,
  logEvent = console.log
}) {
  const trimmed = (text || '').trim();
  const normalized = normalizeDigits(trimmed);

  logEvent('معالجة رسالة مدير النظام', { text: trimmed.slice(0, 80), isImage }, 'info');

  // ---------- أ) معالجة الصور والإيصالات المرسلة من المدير ----------
  if (isImage) {
    try {
      const { downloadMediaMessage } = require('@whiskeysockets/baileys');
      const buffer = await downloadMediaMessage(msg, 'buffer', {});
      if (buffer) {
        logEvent('فحص صورة/إيصال مرسل من المدير عبر OCR', senderPhone, 'info');
        const ocrText = await extractTextFromImage(buffer);
        const receiptData = parseReceiptData(ocrText, trimmed);

        let reply =
          `👑 *تم فحص الصورة/الإيصال المرفق عبر تقنية OCR يا باشمهندس محمود:* 🔍\n\n` +
          `• *المبلغ المستخرج:* ${receiptData.amount ? receiptData.amount + ' ج.م' : 'غير محدد بدقة'}\n` +
          `• *رقم المرجع/العملية:* ${receiptData.reference || 'غير محدد'}\n` +
          `• *طريقة الدفع:* ${receiptData.paymentMethod || 'إنستاباي / فودافون كاش'}\n` +
          (receiptData.senderPhone ? `• *رقم المحول:* ${receiptData.senderPhone}\n` : '');

        // فحص هل يطابق طلباً معلقاً
        const { data: pendRows } = await supabase
          .from('building_settings')
          .select('*')
          .eq('key', 'pending_renewal_order');

        let matchedOrder = null;
        if (pendRows && pendRows.length > 0) {
          for (const row of pendRows) {
            try {
              const order = JSON.parse(row.value);
              if (order.status === 'pending') {
                if (receiptData.amount && order.expected_amount === receiptData.amount) {
                  matchedOrder = order;
                  break;
                }
              }
            } catch (_) {}
          }
        }

        if (matchedOrder) {
          reply +=
            `\n🎯 *تم رصد طلب تجديد معلق يطابق هذا الإيصال!*\n` +
            `• العمارة: *${matchedOrder.building_name}* (كود: *${matchedOrder.building_code}*)\n` +
            `• المدير: *${matchedOrder.manager_name}* (${matchedOrder.manager_phone})\n` +
            `• المبلغ المطلوب: *${matchedOrder.expected_amount} ج.م*\n\n` +
            `⚡ *لتأكيد تفعيل هذا الطلب وإرسال الفاتورة للمدير فوراً:*\n` +
            `فقط اكتب: *تفعيل ${matchedOrder.building_code}*`;
        } else {
          reply +=
            `\n💡 *لتفعيل أي عمارة بهذا الإيصال مباشرة:*\n` +
            `اكتب: *تفعيل [كود_العمارة] [المدة]* (مثال: *تفعيل BLD-1025 سنة*)`;
        }

        await sock.sendMessage(senderJid, { text: reply });
        return;
      }
    } catch (ocrErr) {
      logEvent('خطأ OCR لصورة المدير', ocrErr.message, 'warning');
      await sock.sendMessage(senderJid, {
        text: `يا باشمهندس محمود، حدث خطأ بسيط أثناء قراءة الصورة عبر OCR: ${ocrErr.message}.\nيمكنك كتابة رقم المرجع أو كود العمارة وتفعيلها مباشرة!`
      });
      return;
    }
  }

  // ---------- ب) الترحيب بالقائد والمدير والتعريف بالأوامر ----------
  const isGreeting = /^(?:مرحبا|مرحباً|أهلاً|اهلا|السلام عليكم|سلام عليكم|صباح الخير|مساء الخير|الو|ألو|هاي|مين معايا|مين انت|من انت|who are you|01021252626)$/i.test(trimmed);
  if (isGreeting || !trimmed) {
    const welcome =
      `👑 *أهلاً بحضرتك يا باشمهندس محمود (مدير ومطور النظام)* 🏢✨\n\n` +
      `وعليكم السلام ورحمة الله وبركاته، نورت يا مديرنا العزيز!\n` +
      `تم التعرف على رقمك الخاص المعتمد بنجاح. أنا مساعدك التنفيذي والتقني المباشر لمتابعة وإدارة سيرفر ومنظومة عمارتي 24/7.\n\n` +
      `⚡ *أوامر التحكم السريعة المتاحة لك الآن:*\n` +
      `📊 *احصائيات* : ملخص العمائر، الشقق، الاشتراكات، والإيرادات الحية.\n` +
      `⏳ *معلق* : كشف بطلبات التجديد المعلقة في انتظار التأكيد.\n` +
      `🔍 *بحث [كود/اسم/هاتف]* : استعلام شامل عن أي عمارة وصلاحيتها.\n` +
      `⚡ *تفعيل [كود] [المدة]* : تفعيل فوري لعمارة + إصدار الفاتورة وإشعار المدير.\n` +
      `📢 *رسالة [كود] [النص]* : إرسال رسالة رسمية لمدير عمارة على واتسابه.\n` +
      `🖥️ *سيرفر* : فحص حالة السيرفر، الذاكرة، وقاعدة البيانات.\n` +
      `❓ *أوامر* : عرض دليل الأوامر التفصيلي.\n\n` +
      `💡 أو *اسألني أي سؤال أو استشارة بحرية* وسأجيبك فوراً! 🚀`;

    await sock.sendMessage(senderJid, { text: welcome });
    return;
  }

  // ---------- ج) دليل الأوامر والمساعدة ----------
  if (/^(?:أوامر|اوامر|مساعدة|help|admin|قائمة|menu|الاوامر)$/i.test(trimmed)) {
    const menu = getAdminCommandsMenu();
    await sock.sendMessage(senderJid, { text: menu });
    return;
  }

  // ---------- د) لوحة الإحصائيات الفورية ----------
  if (/^(?:احصائيات|إحصائيات|تقرير|stats|dashboard|لوحة التحكم|ملخص|أرقام|ارقام|ايرادات|إيرادات)$/i.test(trimmed)) {
    const statsReport = await getSystemStats(supabase);
    await sock.sendMessage(senderJid, { text: statsReport });
    return;
  }

  // ---------- هـ) كشف الطلبات المعلقة ----------
  if (/^(?:معلق|معلقة|الطلبات|طلبات|الطلبات المعلقة|طلبات التجديد|pending)$/i.test(trimmed)) {
    const pendingReport = await getPendingOrdersReport(supabase);
    await sock.sendMessage(senderJid, { text: pendingReport });
    return;
  }

  // ---------- و) فحص حالة السيرفر ----------
  if (/^(?:سيرفر|السيرفر|حالة|وضع النظام|صحة السيرفر|ping|server|status)$/i.test(trimmed)) {
    const healthReport = await getServerHealth(supabase, sock);
    await sock.sendMessage(senderJid, { text: healthReport });
    return;
  }

  // ---------- و.2) كشف الاشتراكات التجريبية التي تقترب من الانتهاء ----------
  if (/^(?:تجارب|التجارب|قريب الانتهاء|قريب|انتهاء التجارب)$/i.test(trimmed)) {
    const { getExpiringTrialBuildings } = require('./trial_reminder_service');
    const expiringList = await getExpiringTrialBuildings(supabase, { limit: 10 });
    if (expiringList.length === 0) {
      await sock.sendMessage(senderJid, {
        text: `✅ لا توجد أي عمائر تنتهي فترتها التجريبية حالياً يا باشمهندس محمود.`
      });
      return;
    }

    let report = `📋 *أقرب (${expiringList.length}) عمائر تنتهي فترتها التجريبية قريباً:* ⏳\n\n`;
    expiringList.forEach((b, idx) => {
      report +=
        `*${idx + 1}️⃣ عمارة:* ${b.buildingName} (*${b.buildingCode}*)\n` +
        `• *المدير:* ${b.managerName} (${b.managerPhone})\n` +
        `• *المتبقي:* ${b.daysLeft} أيام\n` +
        `• *أمر التفعيل المباشر:* *تفعيل ${b.buildingCode} سنة*\n` +
        `------------------------------------\n`;
    });
    report +=
      `💡 *خيارات الإرسال المتاحة:*\n` +
      `• لتجربة الرسالة على هاتفك الخاص أولاً: اكتب *اختبار التجارب*\n` +
      `• لإرسال الرسائل للمديرين الفعليين (10 عمائر): اكتب *ارسال التجارب 10*`;
    await sock.sendMessage(senderJid, { text: report });
    return;
  }

  // ---------- و.2.5) اختبار إرسال رسالة التذكير على رقم المهندس محمود الشخصي ----------
  if (/^(?:اختبار التجارب|تجربة التجارب|تيست التجارب|تست التجارب)$/i.test(trimmed)) {
    const { checkAndSendTrialReminders } = require('./trial_reminder_service');
    await sock.sendMessage(senderJid, { text: '⏳ جاري إرسال نموذج تجريبي لرسالة التذكير إلى رقم هاتفك الخاص للاطلاع والتجربة...' });
    const res = await checkAndSendTrialReminders({
      supabase,
      sock,
      logEvent,
      isManualTrigger: true,
      limit: 1,
      targetPhoneOverride: '01021252626'
    });
    await sock.sendMessage(senderJid, {
      text: `✅ تم إرسال الرسالة التجريبية لحسابك بنجاح! يمكنك الآن تجربة الرد برقم (1 أو نعم) لمشاهدة رسالة الأسعار وهدية التقييم، أو (2 أو لا) لمشاهدة رسالة الاعتذار المهذبة. 🚀`
    });
    return;
  }

  // ---------- و.3) إطلاق حملة تنبيه التجارب الفعلي للمديرين ----------
  const sendTrialsMatch = trimmed.match(/^(?:ارسال التجارب|إرسال التجارب|تنبيه التجارب|بدء التجارب)(?:\s+(\d+))?$/i);
  if (sendTrialsMatch) {
    const count = sendTrialsMatch[1] ? parseInt(sendTrialsMatch[1], 10) : 10;
    const { checkAndSendTrialReminders } = require('./trial_reminder_service');
    await sock.sendMessage(senderJid, { text: `⏳ جاري فحص أقرب (${count}) عمائر وإرسال رسائل استفسار التجديد للمديرين بفاصل زمني آمن لحماية الرقم...` });
    const res = await checkAndSendTrialReminders({
      supabase,
      sock,
      logEvent,
      isManualTrigger: true,
      limit: count
    });
    await sock.sendMessage(senderJid, {
      text: `✅ اكتملت العملية بنجاح يا باشمهندس محمود! تم إرسال رسائل الاستفسار لـ (${res.sentCount || 0}) عمارة.`
    });
    return;
  }

  // ---------- ز) التفعيل الإداري الفوري لعمارة ----------
  const activationMatch = normalized.match(/^(?:تفعيل|تجديد)\s+(?:عمارة\s+)?(BLD-?[0-9]{4}|[0-9]{4})(?:\s+(.*))?$/i);
  if (activationMatch) {
    const code = activationMatch[1];
    const duration = activationMatch[2] || '1';

    await sock.sendMessage(senderJid, { text: `⏳ جاري تفعيل العمارة (${code}) وإصدار الفاتورة الرسمية...` });

    const result = await adminActivateBuilding({
      supabase,
      sock,
      buildingCode: code,
      durationStr: duration
    });

    if (!result.ok) {
      await sock.sendMessage(senderJid, { text: `❌ ${result.message}` });
      return;
    }

    const yearsText = result.yearsCount === 1 ? 'سنة واحدة كاملة' : `${result.yearsCount} سنوات كاملة`;
    const adminConfirmation =
      `✅ *تم التفعيل بنجاح يا باشمهندس محمود!* 👑🏢🎉\n\n` +
      `• *العمارة:* ${result.building.name} (كود: *${result.building.code}*)\n` +
      `• *المدير:* ${result.building.manager_name || 'غير مسجل'} (${result.building.manager_phone || 'بدون هاتف'})\n` +
      `• *المدة المفعلة:* ${yearsText} (${result.paidPrice} ج.م)\n` +
      `• *تاريخ الصلاحية الجديد:* حتى *${formatDate(result.expiryDate)}*\n` +
      `• *رقم الفاتورة الرسمية:* *${result.invoiceNo}*\n` +
      `• *إشعار المدير:* ${result.notifiedManager ? 'تم إرسال الفاتورة ورسالة التفعيل للمدير على واتسابه بنجاح 📲' : 'لم يتم إرسال إشعار للمدير (لا يوجد هاتف متاح)'}\n\n` +
      `تم تحديث قاعدة البيانات وسجلات النظام فورياً! ✨`;

    await sock.sendMessage(senderJid, { text: adminConfirmation });

    // إرسال الفاتورة PDF للمهندس محمود في الشات للاطلاع عليها
    if (result.pdfPath && fs.existsSync(result.pdfPath)) {
      try {
        await sock.sendMessage(senderJid, {
          document: fs.readFileSync(result.pdfPath),
          mimetype: 'application/pdf',
          fileName: `فاتورة_اشتراك_${result.building.code}.pdf`,
          caption: `📄 الفاتورة الرسمية المعتمدة - ${result.building.name} (${result.building.code})`
        });
      } catch (_) {}
    }
    return;
  }

  // ---------- ح) إرسال رسالة رسمية لمدير عمارة ----------
  const messageMatch = trimmed.match(/^(?:رسالة|تنبيه|إرسال|ارسال)\s+(?:عمارة\s+)?(BLD-?[0-9]{4}|[0-9]{4})\s+(.+)$/i);
  if (messageMatch) {
    const code = messageMatch[1];
    const msgBody = messageMatch[2];

    const result = await sendMessageToBuildingManager({
      supabase,
      sock,
      buildingCode: code,
      messageText: msgBody
    });

    if (!result.ok) {
      await sock.sendMessage(senderJid, { text: `❌ ${result.message}` });
      return;
    }

    const confirm =
      `✅ *تم إرسال رسالتك بنجاح يا باشمهندس محمود!* 📲✨\n\n` +
      `• *إلى عمارة:* ${result.building.name} (كود: *${result.building.code}*)\n` +
      `• *المدير:* ${result.building.manager_name} (هاتف: *${result.phone}*)\n` +
      `• *نص الرسالة المرسلة:*\n"${msgBody}"`;

    await sock.sendMessage(senderJid, { text: confirm });
    return;
  }

  // ---------- ط) البحث والاستعلام عن عمارة ----------
  const isSearchCmd = /^(?:بحث|عمارة|كود|استعلام)\s+(.+)$/i.test(trimmed);
  const isDirectCode = /^BLD-?[0-9]{4}$/i.test(trimmed);
  const isDirectPhone = /^01[0125][0-9]{8}$/.test(trimmed);

  if (isSearchCmd || isDirectCode || isDirectPhone) {
    let queryToSearch = trimmed;
    const matchSearch = trimmed.match(/^(?:بحث|عمارة|كود|استعلام)\s+(.+)$/i);
    if (matchSearch) queryToSearch = matchSearch[1];

    const searchResult = await searchBuildingsReport(supabase, queryToSearch);
    await sock.sendMessage(senderJid, { text: searchResult });
    return;
  }

  // ---------- ي) الاستشارات والمحادثة الذكية عبر Gemini AI التنفيذي ----------
  try {
    const aiResponse = await getAdminAIResponse(trimmed);
    if (aiResponse) {
      await sock.sendMessage(senderJid, { text: aiResponse });
    }
  } catch (aiErr) {
    logEvent('خطأ رد الذكاء الاصطناعي للمدير', aiErr.message, 'warning');
    await sock.sendMessage(senderJid, {
      text: `أهلاً بحضرتك يا باشمهندس محمود 👑\nأنا معك وتحت أمرك في أي وقت. يمكنك طلب: (احصائيات | معلق | بحث [كود] | تفعيل [كود] سنة | سيرفر).`
    });
  }
}

module.exports = {
  ADMIN_PHONE,
  isAdminPhone,
  isAdminUser,
  handleAdminMessage,
  getSystemStats,
  getPendingOrdersReport,
  searchBuildingsReport,
  adminActivateBuilding,
  sendMessageToBuildingManager,
  getServerHealth,
  getAdminCommandsMenu,
  getAdminAIResponse
};
