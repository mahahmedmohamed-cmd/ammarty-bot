/**
 * عمارتي - محرك خدمة العملاء والدعم الفني الذكي 24/7 عبر Google Gemini
 * يجيب على استفسارات العملاء، يشرح مميزات التطبيق، ويحل المشاكل الفنية بأسلوب ودود واحترافي
 * يدعم الاستئذان قبل إرسال لقطات الشاشة مع تعليقات توضيحية مختصرة ومفيدة
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iowpdqulkujikzsjgebd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlvd3BkcXVsa3VqaWt6c2pnZWJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg1OTQ1NDYsImV4cCI6MjEwNDE3MDU0Nn0.26U1YKl_XFvTBu3r4jJJs5VrZr1vzr9DGrpgFsMTLEU';
let defaultSupabase = null;
function getSupabaseClient(customClient = null) {
  if (customClient) return customClient;
  if (!defaultSupabase) {
    defaultSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return defaultSupabase;
}

// مسار مجلد لقطات الشاشة الحقيقية للتطبيق
// الأولوية دائماً لمجلد البوت الداخلي لضمان العمل على السيرفر السحابي (Render) حتى عند إغلاق جهاز الكمبيوتر
const LOCAL_SCREENSHOTS_DIR = path.resolve(__dirname, 'screenshots');
const FALLBACK_SCREENSHOTS_DIR = path.resolve(__dirname, '../app_tour_knowledge/screenshots');
const SCREENSHOTS_DIR = fs.existsSync(LOCAL_SCREENSHOTS_DIR) ? LOCAL_SCREENSHOTS_DIR : FALLBACK_SCREENSHOTS_DIR;

// قاعدة بيانات توضيحات لقطات الشاشة (نقاط توضيحية مختصرة جداً بدون إطالة)
const SCREENSHOT_DETAILS = {
  '10_pay_pressed.png': {
    title: 'شاشة تسجيل السداد ومشاركة إيصال الواتساب',
    description: 'تسجيل دفعة سداد للشقة ومشاركة إيصال معتمد عبر واتساب',
    notes: '• اضغط على زر "سداد" الأخضر أمام رقم الشقة.\n• اضغط "مشاركة الإيصال عبر واتساب" لإرساله للساكن فورياً.'
  },
  '10_payments_screen_actual.png': {
    title: 'شاشة الدفعات والتحصيل الشهري',
    description: 'شاشة الدفعات ومتابعة المسددين وغير المسددين',
    notes: '• استعراض حالة سداد كافة الشقق للشهر المحدد.\n• فلترة الشقق المسددة أو المتأخرة بنقرة واحدة.'
  },
  '16_renewal_dialog.png': {
    title: 'باقات تجديد الاشتراك وطرق الدفع',
    description: 'باقات الاشتراك والتجديد لحساب عمارتي وطرق الدفع',
    notes: '• باقات الاشتراك الرسمي (سنة 200ج، سنتين 360ج، 3 سنوات 480ج).\n• التحويل عبر إنستاباي أو فودافون كاش على الرقم: 01021252626.'
  },
  '22_late_apartments_screen.png': {
    title: 'شاشة الشقق المتأخرة وإرسال التنبيهات',
    description: 'متابعة الشقق المتأخرة وإرسال جرس تنبيه عبر واتساب',
    notes: '• كشف بكافة الشقق المتأخرة وإجمالي المبالغ المستحقة.\n• زر "تنبيه عبر واتساب" لإرسال تذكير رسمي ومؤدب للساكن.'
  },
  '12_add_expense_dialog.png': {
    title: 'نافذة إضافة مصروف جديد للعمارة',
    description: 'تسجيل مصروف جديد وخصمه من الخزينة',
    notes: '• إدخال بند المصروف، المبلغ، والفئة (مصعد، كهرباء، نظافة).\n• خيار خصم المبلغ تلقائياً من رصيد الخزينة الفعلي.'
  },
  '12_expenses_screen.png': {
    title: 'سجل وأرشيف مصروفات العمارة',
    description: 'استعراض سجل المصروفات والصيانة والتصنيفات',
    notes: '• عرض المصروفات حسب كل شهر أو إجمالي العام.\n• متابعة إجمالي المصروفات وصافي المتبقي بالخزينة.'
  },
  '11_manage_apartments_screen.png': {
    title: 'شاشة إدارة الشقق وإعداد بيانات الملاك',
    description: 'إدارة الشقق وتوليد الشقق وتعديل بيانات الملاك',
    notes: '• توليد شقق العمارة آلياً وتحديد أرقام الأدوار.\n• تعديل أرقام الشقق وقيمة الاشتراك لكل شقة.'
  },
  '11_edit_apt1_dialog.png': {
    title: 'تعديل بيانات الساكن ورمز PIN',
    description: 'تعديل اسم وهاتف الساكن ورمز الدخول السري (PIN)',
    notes: '• تسجيل اسم المالك ورقم هاتفه.\n• كود المرور (PIN) الخاص بدخول الساكن ومتابعة شقته.'
  },
  '11_renumber_apartments_dialog.png': {
    title: 'إعادة ترقيم الشقق بالتتابع',
    description: 'ترقيم الشقق تلقائياً بداية من رقم محدد',
    notes: '• تحديد بداية الترقيم (مثلاً 1 أو 101) لإعادة ترقيم الشقق بنقرة واحدة.'
  },
  '11_apartment_customize_sheet.png': {
    title: 'تخصيص اشتراك ورصيد الشقة',
    description: 'تخصيص قيمة اشتراك شقة محددة أو وضع رصيد افتتاحي لها',
    notes: '• تحديد اشتراك شهري مخصص لشقة معينة.\n• تسجيل رصيد مدين أو دائن افتتاحي للشقة.'
  },
  '08_send_sheet.png': {
    title: 'مركز إرسال الإشعارات والتنبيهات',
    description: 'إرسال إشعارات وتنبيهات للسكان بالقوالب الجاهزة',
    notes: '• اختيار المستلمين (الجميع، المتأخرين، الملاك فقط).\n• قوالب جاهزة للمواعيد والصيانة مع إرسال عبر واتساب.'
  },
  '07_create_proposal_modal.png': {
    title: 'إنشاء مقترح وتصويت السكان',
    description: 'نشر مقترح أو استطلاع رأي للتصويت بين السكان',
    notes: '• إضافة عنوان المقترح والتفاصيل والميزانية المقدرة.\n• تمكين السكان من التصويت بـ (موافق / معترض / ممتنع).'
  },
  '13_services_directory_screen.png': {
    title: 'دليل خدمات وفنيي العمارة',
    description: 'دليل أرقام الطوارئ وفنيي الصيانة',
    notes: '• أقسام منظمة (مصاعد، سباكة، كهرباء، حراسة).\n• أزرار اتصال سريع ومراسلة واتساب للفنيين المعتمدين.'
  },
  '17_accounting_periods_screen.png': {
    title: 'الفترات المحاسبية واشتراكات السنوات',
    description: 'تحديد قيمة الاشتراك لكل فترة زمنية أو سنة',
    notes: '• تخصيص اشتراك كل سنة (مثلاً 2025 = 100ج، 2026 = 200ج).\n• ضبط حساب المتأخرات والتحصيلات بدقة.'
  },
  '18_financial_goals_screen.png': {
    title: 'الأهداف المالية وصناديق التطوير',
    description: 'إدارة أهداف التطوير وصناديق التوفير للعمارة',
    notes: '• تحديد هدف مالي وتكلفته المقدرة.\n• متابعة نسبة إنجاز التحصيل والمبالغ المخصصة للهدف.'
  },
  '19_import_backup_dialog.png': {
    title: 'النسخ الاحتياطي واستعادة البيانات',
    description: 'تصدير واستيراد نسخة احتياطية حية من البيانات',
    notes: '• تصدير نسخة JSON لجميع بيانات العمارة ومشاركتها عبر واتساب.\n• استرجاع الشقق والمدفوعات والمصروفات بضغطة زر.'
  },
  '06_payment_reports.png': {
    title: 'تقارير السداد وتصدير كشف حساب PDF',
    description: 'استخراج كشف حساب وميزانية PDF رسمية ومشاركتها',
    notes: '• تقرير مفصل بإيرادات ومصروفات وصافي رصيد العمارة.\n• مشاركة ملف PDF جاهز للطباعة مع الملاك عبر واتساب.'
  },
  '05_compass_guide.png': {
    title: 'دليل ومرشد عمارتي والخطوات السبع',
    description: 'دليل البداية وشرح خطوات الإعداد السبع',
    notes: '• استعراض خطوات التهيئة السريعة للعمارة.\n• شروحات مرئية تفاعلية لكل ميزة في التطبيق.'
  },
  '09_opening_balance_dialog.png': {
    title: 'تسجيل الرصيد الافتتاحي للخزينة',
    description: 'تسجيل وقفل الرصيد الافتتاحي للخزينة',
    notes: '• تسجيل المبلغ المتوفر بالصندوق أو البنك قبل بدء استخدام التطبيق.\n• قفل الرصيد لضمان دقة المعادلات المحاسبية.'
  },
  '16_account_and_subscription.png': {
    title: 'إدارة الحساب ورخصة العمارة',
    description: 'تفاصيل الترخيص والاشتراك وكود العمارة',
    notes: '• استعراض كود العمارة وتاريخ انتهاء الصلاحية.\n• إدارة الباقات وتغيير كلمة مرور المدير.'
  }
};

// الموديلات المرشحة بالترتيب لضمان التوفر الدائم وتفادي حدود الحصص
const MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-flash-latest'
];

// ذاكرة المحادثة لكل عميل (آخر 6 رسائل للحفاظ على سياق الحوار)
const chatSessions = new Map();
function saveChatSession(phone, history) {
  chatSessions.set(phone, history);
  if (chatSessions.size > 100) {
    const oldest = chatSessions.keys().next().value;
    chatSessions.delete(oldest);
  }
}

// ذاكرة عروض الصور المعلقة (في انتظار موافقة العميل)
// مفتاح: senderPhone -> { filename, title, description, notes, timestamp }
const pendingImageOffers = new Map();
function savePendingImageOffer(phone, offer) {
  pendingImageOffers.set(phone, offer);
  if (pendingImageOffers.size > 50) {
    const oldest = pendingImageOffers.keys().next().value;
    pendingImageOffers.delete(oldest);
  }
}

// ذاكرة مؤقتة لبيانات العملاء المسجلين (صلاحية 15 دقيقة لتسريع الردود وتخفيف الاستعلامات)
const userProfileCache = new Map();
function saveUserProfileCache(digits, data) {
  userProfileCache.set(digits, data);
  if (userProfileCache.size > 100) {
    const oldest = userProfileCache.keys().next().value;
    userProfileCache.delete(oldest);
  }
}

/**
 * البحث عن هوية العميل عبر رقم هاتفه في كافة العمارات (مدير، ساكن، مقدم خدمة)
 */
async function findUserProfileByPhone(senderPhone, client = null) {
  if (!senderPhone) return null;
  const digits = String(senderPhone).replace(/\D/g, '');
  if (digits.length < 8) return null;

  // فحص الكاش المؤقت
  const cached = userProfileCache.get(digits);
  if (cached && (Date.now() - cached.timestamp) < 15 * 60 * 1000) {
    return cached.profile;
  }

  const supabase = getSupabaseClient(client);
  const short8 = digits.slice(-8);

  try {
    // 1. البحث في مديري ومسؤولي العمارات (جدول buildings)
    const { data: blds } = await supabase
      .from('buildings')
      .select('id, name, code, manager_name, manager_phone')
      .ilike('manager_phone', `%${short8}%`)
      .order('id', { ascending: false });

    if (blds && blds.length > 0) {
      const matched = blds.find(b => b.manager_name && b.manager_name.trim().length > 1) || blds[0];
      if (matched && matched.manager_name && matched.manager_name.trim()) {
        const profile = {
          userType: 'manager',
          name: matched.manager_name.trim(),
          role: 'مسؤول العمارة',
          buildingId: matched.id,
          buildingName: matched.name || '',
          buildingCode: matched.code || '',
          phone: matched.manager_phone
        };
        saveUserProfileCache(digits, { profile, timestamp: Date.now() });
        return profile;
      }
    }

    // 2. البحث في جدول شقق وسكان العمارات (جدول apartments)
    const { data: apts } = await supabase
      .from('apartments')
      .select('id, building_id, apt_number, owner_name, phone')
      .ilike('phone', `%${short8}%`)
      .order('id', { ascending: false });

    if (apts && apts.length > 0) {
      const matchedApt = apts.find(a => a.owner_name && a.owner_name.trim().length > 1) || apts[0];
      if (matchedApt && matchedApt.owner_name && matchedApt.owner_name.trim()) {
        let bldInfo = null;
        if (matchedApt.building_id) {
          const { data: bld } = await supabase
            .from('buildings')
            .select('id, name, code')
            .eq('id', matchedApt.building_id)
            .maybeSingle();
          bldInfo = bld;
        }
        const profile = {
          userType: 'resident',
          name: matchedApt.owner_name.trim(),
          role: matchedApt.apt_number ? `ساكن (شقة ${matchedApt.apt_number})` : 'ساكن بالعمارة',
          aptNumber: matchedApt.apt_number,
          buildingId: matchedApt.building_id,
          buildingName: bldInfo ? (bldInfo.name || '') : '',
          buildingCode: bldInfo ? (bldInfo.code || '') : '',
          phone: matchedApt.phone
        };
        saveUserProfileCache(digits, { profile, timestamp: Date.now() });
        return profile;
      }
    }

    // 3. البحث في دليل الفنيين ومقدمي الخدمات (جدول service_providers)
    const { data: sps } = await supabase
      .from('service_providers')
      .select('id, building_id, name, profession, phone')
      .ilike('phone', `%${short8}%`)
      .order('id', { ascending: false });

    if (sps && sps.length > 0) {
      const matchedSp = sps.find(s => s.name && s.name.trim().length > 1) || sps[0];
      if (matchedSp && matchedSp.name && matchedSp.name.trim()) {
        let bldInfo = null;
        if (matchedSp.building_id) {
          const { data: bld } = await supabase
            .from('buildings')
            .select('id, name, code')
            .eq('id', matchedSp.building_id)
            .maybeSingle();
          bldInfo = bld;
        }
        const profile = {
          userType: 'provider',
          name: matchedSp.name.trim(),
          role: `مقدم خدمة (${matchedSp.profession || 'فني'})`,
          buildingId: matchedSp.building_id,
          buildingName: bldInfo ? (bldInfo.name || '') : '',
          buildingCode: bldInfo ? (bldInfo.code || '') : '',
          phone: matchedSp.phone
        };
        saveUserProfileCache(digits, { profile, timestamp: Date.now() });
        return profile;
      }
    }
  } catch (err) {
    console.warn('[findUserProfileByPhone] Error looking up user profile:', err.message);
  }

  saveUserProfileCache(digits, { profile: null, timestamp: Date.now() });
  return null;
}

/**
 * تنسيق لقب واسم العميل للترحيب اللائق والمحترم
 */
function formatSalutation(name, userType = 'manager', buildingName = '') {
  if (!name || !name.trim()) return '';
  const cleanName = name.trim().replace(/[\/\\_-]/g, ' ').replace(/\s+/g, ' ');

  // التحقق هل الاسم يحتوي على لقب مسبق
  const hasTitle = /^(?:م\.|مهندس|د\.|دكتور|دكتورة|أستاذ|أستاذة|أ\.|الحاج|الحاجة|الشيخ|كابتن)\b/i.test(cleanName);
  const title = hasTitle ? '' : 'أستاذ ';

  let roleSuffix = '';
  if (userType === 'manager' && buildingName) {
    roleSuffix = ` (مسؤول عمارة ${buildingName})`;
  } else if (userType === 'resident' && buildingName) {
    roleSuffix = ` (عمارة ${buildingName})`;
  }

  return `${title}${cleanName}${roleSuffix}`;
}

/**
 * التأكد من وجود اسم العميل وترحيب مخصص في أول رسالة بالمحادثة
 */
function ensurePersonalizedGreeting(replyText, userProfile, isFirstMessage) {
  if (!replyText || !userProfile || !userProfile.name || !isFirstMessage) {
    return replyText;
  }

  const name = userProfile.name.trim();
  // إذا كان الرد يحتوي بالفعل على اسم العميل، فلا داعي للتعديل
  if (replyText.includes(name)) {
    return replyText;
  }

  const salutation = formatSalutation(name, userProfile.userType, userProfile.buildingName);

  // إذا كان الرد يبدأ بـ "وعليكم السلام"
  if (/^وعليكم\s*السلام/i.test(replyText)) {
    return replyText.replace(/^(وعليكم\s*السلام(?:\s*ورحمة\s*الله(?:\s*وبركاته)?)?)[!،,\.]*(?:\s*أهلاً\s*(?:بك|بحضرتك)?)?/i, `$1 أهلاً بك ${salutation} 🏢✨`);
  }

  // إذا كان الرد يبدأ بـ "أهلاً بك"
  if (/^أهلاً\s*(?:بك|بحضرتك|بيك)?(?:\s*يا\s*فندم)?[!،,\.]*/i.test(replyText)) {
    return replyText.replace(/^أهلاً\s*(?:بك|بحضرتك|بيك)?(?:\s*يا\s*فندم)?[!،,\.]*/i, `أهلاً بك ${salutation} 🏢✨\n`);
  }

  // إذا كان الرد يبدأ بـ "صباح/مساء الخير"
  if (/^(?:صباح|مساء)\s*الخير(?:\s*يا\s*فندم)?[!،,\.]*/i.test(replyText)) {
    return replyText.replace(/^((?:صباح|مساء)\s*الخير)(?:\s*يا\s*فندم)?[!،,\.]*/i, `$1 ${salutation} 🏢✨\n`);
  }

  // إذا كان الرد يبدأ بـ "مرحباً"
  if (/^مرحباً\s*(?:بك|بحضرتك)?[!،,\.]*/i.test(replyText)) {
    return replyText.replace(/^مرحباً\s*(?:بك|بحضرتك)?[!،,\.]*/i, `مرحباً بك ${salutation} 🏢✨\n`);
  }

  // إذا لم يكن هناك ترحيب صريح في البداية وكان رد مباشر على سؤال في أول رسالة
  return `أهلاً بك ${salutation} 🏢✨\n\n${replyText}`;
}

/**
 * جلب بافر الصورة محلياً أو سحابياً من GitHub Raw كاحتياط أخير
 */
async function getImageBuffer(filenameOrPath) {
  if (!filenameOrPath) return null;
  const rawFilename = path.basename(filenameOrPath).trim();

  // 1. فحص المسار المباشر إذا كان موجوداً
  if (fs.existsSync(filenameOrPath) && !fs.lstatSync(filenameOrPath).isDirectory()) {
    try { return fs.readFileSync(filenameOrPath); } catch (_) {}
  }

  // 2. فحص مجلد لقطات الشاشة الداخلي لبوت الواتساب (السيرفر السحابي)
  const localInBot = path.join(LOCAL_SCREENSHOTS_DIR, rawFilename);
  if (fs.existsSync(localInBot)) {
    try { return fs.readFileSync(localInBot); } catch (_) {}
  }

  // 3. فحص مجلد المشروع الاحتياطي
  const localInProject = path.join(FALLBACK_SCREENSHOTS_DIR, rawFilename);
  if (fs.existsSync(localInProject)) {
    try { return fs.readFileSync(localInProject); } catch (_) {}
  }

  // 4. السقوط الآمن للسحابة (تحميل من GitHub Raw مباشرة حتى لو كانت الملفات مفقودة محلياً)
  try {
    const rawUrl = `https://raw.githubusercontent.com/mahahmedmohamed-cmd/ammarty-bot/main/screenshots/${encodeURIComponent(rawFilename)}`;
    const buffer = await fetchBufferFromUrl(rawUrl);
    if (buffer && buffer.length > 1000) {
      return buffer;
    }
  } catch (_) {}

  return null;
}

function fetchBufferFromUrl(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return resolve(null);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', () => resolve(null));
  });
}

/**
 * فحص هل رسالة العميل تعبر عن موافقة ورغبة في رؤية الصورة
 */
function isAffirmativeResponse(text) {
  if (!text) return false;
  const clean = text.trim().toLowerCase()
    .replace(/[\.\,\!؟\?،]/g, '')
    .replace(/[أإآ]/g, 'ا');

  const affirmativeWords = [
    'اه', 'ايوة', 'ياريت', 'ابعت', 'ابعتلي', 'ابعتهالي', 'ابعث', 'ابعثلي',
    'تمام', 'ماشي', 'اوك', 'اوكي', 'ok', 'okay', 'yes', 'yep', 'sure',
    'وريني', 'عايز اشوفها', 'ارسل', 'ارسلها', 'موافق', 'طبعا', 'ممكن',
    'يا ريت', 'نعم', 'اكيد', 'ابعته', 'ياريت تبعت', 'اه ياريت', 'تمام ابعت',
    'ممكن صورة', 'ابعث لي'
  ];

  return affirmativeWords.some(w => {
    return clean === w ||
           clean.startsWith(w + ' ') ||
           clean.endsWith(' ' + w) ||
           clean.includes(' ' + w + ' ');
  });
}

/**
 * فحص هل رسالة العميل تعبر عن رفض أو عدم حاجة للصورة
 */
function isNegativeResponse(text) {
  if (!text) return false;
  const clean = text.trim().toLowerCase().replace(/[\.\,\!؟\?،]/g, '');
  const negativeWords = ['لا', 'مش محتاج', 'شكرا', 'لا شكرا', 'خلاص', 'عرفت خلاص', 'مش عايز', 'no', 'nop'];
  return negativeWords.some(w => clean === w || clean === 'لا شكرا' || clean === 'شكرا مش محتاج' || clean === 'مش محتاج شكرا');
}

// التعليمات المرجعية الأساسية لمساعد عمارتي المدرب على خريطة التطبيق الكاملة
const SYSTEM_PROMPT = `أنت "مساعد عمارتي الذكي" 🏢✨، المساعد الرسمي وخدمة العملاء والدعم الفني لتطبيق "عمارتي" (Ammarty).
مهمتك: الرد على استفسارات مديري العمارات والملاك والسكان عبر واتساب بلباقة واحترافية وود شديد، وشرح كل زر وشاشة وميزة في التطبيق بالتفصيل والخطوات الدقيقة، باللهجة المصرية الراقية أو العربية البسيطة.

خريطة شاشات وأزرار تطبيق "عمارتي" بالتفصيل الكامل:

1. شريط التنقل السفلي (6 تبويبات):
   • [الرئيسية 🏢]:
     - يعرض رصيد الخزينة الصافي الفعلي، ملخص الشهر (المسددون بالأخضر، غير المسددين بالأحمر، إجمالي المحصل بالأصفر)، ونسبة التحصيل.
     - قسم "لم يدفعوا هذا الشهر": يعرض الشقق المتأخرة، مع زر "عرض كافة التأخيرات" بالأعلى، وزر تحديث عائم 🔄.
     - الشريط العلوي في الرئيسية:
       * 📊 أيقونة التقارير (أعلى يسار): تقرير سداد الاشتراكات وتصدير كشف حساب PDF ومشاركته على واتساب.
       * 🧭 أيقونة البوصلة: "دليل ومرشد عمارتي" (خطوات الإعداد السبع، شرح الوظائف، وجولة مرئية).
       * 🗳️ أيقونة التصويت: "استطلاعات الرأي والقرارات" لنشر مقترحات والتصويت عليها (موافق/معترض/ممتنع).
       * 🔔 أيقونة الجرس: "مركز الإشعارات والتنبيهات" لإرسال تنبيهات موجهة (للجميع، الملاك، المتأخرين، أو شقة معينة) مع قوالب جاهزة.
   • [الدفعات 💳]:
     - لتسجيل وتحصيل اشتراكات الشقق شهرياً.
     - محدد الشهر والسنة بالأعلى، وفلاتر (الكل / مسدد ✅ / غير مسدد ❌).
     - لكل شقة زر "سداد 💳": الضغط عليه يسجل الدفع فورياً مع صوت تأكيد، ويفتح "نافذة الإيصال الفوري" مع زر "مشاركة الإيصال عبر واتساب 💬" لإرسال إيصال فوري رسمي للساكن.
   • [المصروفات 📉]:
     - تدوين مصاريف العمارة (صيانة المصعد، كهرباء السلم، أجر البواب، نظافة، سباكة، طوارئ).
     - زر "+ إضافة مصروف" بالأسفل: تحديد البند، المبلغ، اسم الفني وهاتفه، وتفعيل خصم المبلغ تلقائياً من رصيد الخزينة.
     - مفتاح التبديل بالأعلى: استعراض مصروفات الشهر المحدد أو إجمالي كافة الشهور.
   • [الخدمات 🛠️]:
     - دليل أرقام الطوارئ والفنيين مقسم بأقسام أنيقة (مصاعد، سباكة، كهرباء، حراسة، نظافة).
     - زر "+ إضافة قسم خدمة جديد"، وداخل كل قسم زر "+ إضافة مقدم خدمة" لتسجيل اسم الفني وتخصصه وهاتفه للاتصال أو مراسلته واتساب بنقرة واحدة.
   • [السجل 📅]:
     - "سجل الشهور": أرشيف زمني للشهور مع إجمالي المحصل والمصروف والصافي، والنقر على أي شهر يفتح "مراجعة الشهور" لتعديل حالة سداد أي شقة بنقرة واحدة سريعة.
   • [الإعدادات ⚙️]:
     - إدارة حسابي والاشتراك: تفاصيل الترخيص وتجديد الباقات وتغيير الباسورد.
     - دليل ومرشد عمارتي: الشرح التأسيسي.
     - إدارة الشقق وبيانات الملاك: توليد الشقق آلياً، تعديل أسماء السكان وهواتفهم بكود الدولة، وتعيين كود مرور الساكن (PIN).
     - الرصيد الافتتاحي للخزينة 🔒: تسجيل وتثبيت المبلغ المالي بالصندوق قبل بدء التطبيق (يُقفل نهائياً وبشكل حاسم ولا يمكن تعديله أو حذفه إطلاقاً بعد حفظه لحماية الحسابات).
     - الفترات المحاسبية واشتراكات الشهور: تحديد قيمة الاشتراك لكل فترة زمنية (مثال 2025 = 100ج، 2026 = 200ج) لحساب المتأخرات بدقة متناهية.
     - إعادة ترقيم الشقق بالتتابع: تحديد بداية الترقيم (مثلاً 1 أو 101) لترقيم الشقق تلقائياً.
     - تعديل بيانات العمارة (اسم العمارة، الاشتراك الشهري الافتراضي، عدد الشقق، تاريخ بدء التجميع).
     - الأهداف المالية: وضع أهداف توفير وتطوير للعمارة ومتابعة نسبة الإنجاز.
     - تصدير واستيراد نسخة احتياطية حية (JSON): لحفظ البيانات أو استرجاعها بضغطة زر.

2. باقات الاشتراك الرسمية المعتمدة:
   • سنة واحدة: 200 جنيه مصري.
   • سنتان: 360 جنيه مصري (خصم 10% - توفير 40 ج.م).
   • 3 سنوات: 480 جنيه مصري (خصم 20% - توفير 120 ج.م).
   • 5 سنوات: 700 جنيه مصري (خصم 30% - توفير 300 ج.م).
   • ميزة ذهبية: ترخيص واشتراك التطبيق يشمل استخدام تطبيق عمارتي لجميع سكان وشقق العمارة بالكامل بنفس الاشتراك وبدون أي تكلفة إضافية!
   • طرق السداد المعتمدة: إنستاباي (InstaPay) أو فودافون كاش على الرقم الرسمي الموحد: 01021252626
   • التفعيل: فوري وتلقائي بمجرد إرسال صورة إيصال التحويل في الشات هنا.

3. العروض الحصرية وهدايا التقييم:
   • مبادرة أهالي وجيران «حدائق العاصمة» (تفعيل واشتراك سنوي مجاني 100%):
     - إذا ذكر العميل أنه من سكان أو مسؤولي عمارات "حدائق العاصمة" أو يسأل عن مبادرة عمارات حدائق العاصمة، أو يطلب تفعيل عمارته في حدائق العاصمة:
       * كن على علم تام وفوري بالمبادرة ورّحب به بحرارة كجار من أهل مدينتنا الكرام.
       * وضّح له: "أهلاً بحضرتك وبكل جيراننا الكرام في حدائق العاصمة 🏢✨! يسعدنا إبلاغك بوجود مبادرة رسمية بتفعيل اشتراك عمارتك مجاناً بالكامل لمدة سنة كاملة تقديراً لأهل ومدينتنا".
       * وضّح له الخطوتين البسيطتين للتفعيل الفوري:
         1. إرسال كود العمارة الخاص به المسجل في التطبيق (مثال: BLD-xxxx) واسم العمارة.
         2. إرسال إثبات بسيط أنه من حدائق العاصمة (مثل: صورة فاتورة، صورة إشعار، أو موقع العمارة بحدائق العاصمة).
       * طلب التقييم والدعم (بأسلوب أخوي راقٍ ومحبب):
         - "كل ما نتمناه من حضرتك كدعم لمشروعنا ومن ابن مدينتكم: ترك تقييم ورأي 5 نجوم على متجر Google Play لمساعدتنا على الاستمرار وتطوير خدمات جديدة لمدينتنا الغالية 🙏⭐"
         - رابط التقييم: https://play.google.com/store/apps/details?id=com.ammarty.ammarty
   • هدية تقييم Google Play لباقي المدن (شهرين بونص زيادة فوق مدة الاشتراك الرسمي):
     - شرط أساسي: الشهرين الإضافيين هما **هدية تُضاف زيادة فوق مدة الاشتراك الرسمي المدفوع** (مثال: تشترك العمارة سنة فتحصل على 14 شهراً، أو سنتين فتحصل على سنتين وشهرين).
     - ⛔ **تنبيه حاسم للعملاء**: لا يمكن الحصول على الشهرين كفترة مجانية منفصلة بدون الاشتراك في إحدى الباقات السنوية الرسمية. وضح للعميل دائماً: "الهدية هي شهرين زيادة فوق مدة اشتراككم الرسمي عند الاشتراك في أي باقة، بعد كتابة 3 من سكان وإدارة العمارة تقييم 5 نجوم على Google Play وإرسال السكرين شوت هنا".
     - يشترط أن يكون التقييم من 3 أفراد مختلفين بالعمارة (المدير والسكان أو الملاك) بدون تكرار نفس الرقم.
     - رابط المتجر: https://play.google.com/store/apps/details?id=com.ammarty.ammarty
   • أسعار الاشتراكات ثابتة ومحددة بالباقات الرسمية أعلاه فقط (سنة واحدة بـ 200 ج.م، سنتان بـ 360 ج.م، 3 سنوات بـ 480 ج.م، 5 سنوات بـ 700 ج.م).

4. الدخول وكلمة المرور:
   • نسيان كلمة المرور: يفتح التطبيق ويضغط "نسيت كلمة المرور"، ويأخذ الكود المكون من 5 أرقام ويرسله هنا في الشات ليتم التحقق منه فورياً وفتح شاشة تعيين كلمة المرور الجديدة، أو عبر استعادة الباسورد بالبريد (Gmail OTP) من داخل التطبيق.
   • دخول الساكن: يدخل بكود العمارة ورقم شقته ورمز المرور السري (PIN) الخاص بشقته الذي يحدده له مدير العمارة.

5. ضوابط الأسلوب، النبرة، وقواعد الترحيب الصارمة (ممنوع التكلف وممنوع التكرار نهائياً):
   • ⛔ **ممنوع الترحيب الزائد عن اللزوم نهائياً**:
     - تجنب تماماً العبارات المبالغ فيها أو السوقية مثل ("مساء النور والجمال"، "يا غالي"، "منور تطبيق عمارتي"، "على راسي").
     - ممنوع إيموجيز الورود والقلوب 🌸❤️ نهائياً، واكتفِ بإيموجي أو اثنين عملي وبسيط في الرسالة كلها (مثل 📱 أو 💳).
     - كن عملياً، راقياً، محترفاً، ومباشراً كفريق خدمة عملاء لشركة تكنولوجية رائدة.
   • ⛔ **ممنوع تكرار الترحيب في كل رد على رسالة (قاعدة حاسمة)**:
     - الترحيب يكون **لمرة واحدة فقط** في أول رسالة إذا بدأ العميل بتحية.
     - **إذا كانت المحادثة مستمرة أو أرسل العميل سؤالاً/طلباً مباشرة**: **ممنوع منعاً باتاً** أن تبدأ ردك بأي ترحيب أو تمهيد، بل ادخل **فوراً ومباشرة** في الإجابة والخطوات العملية.
   • الردود تكون سريعة، رشيقة (2 إلى 4 أسطر مناسبة للواتساب)، واضحة ومباشرة دون إطالة مملة.

6. حقائق تقنية صارمة (ممنوع اختراع ميزات):
   • 📷 **رفع صور الفواتير للمصروفات**: التطبيق حالياً **لا يدعم رفع صور الفواتير أو التقاط صور بالكاميرا للمصروفات**.
   • 🧾 **إيصالات السداد والتحصيل**: إيصال السداد في التطبيق هو **رسالة إشعار نصية رسمية معتمدة عبر واتساب** تُرسل بضغطة زر لرقم الساكن، وليس صورة تصميم.
   • 📊 **تقارير الـ PDF**: التطبيق يتيح استخراج ومشاركة **كشف حساب وميزانية PDF رسمية** بضغطة زر من أيقونة التقارير (📊) بأعلى يسار الشاشة الرئيسية.
   • 🔒 **حذف أو تعديل الرصيد الافتتاحي للخزينة (ممنوع نهائياً الادعاء بإمكانية حذفه أو تعديله من الإعدادات)**:
     - الرصيد الافتتاحي للخزينة يُسجل **لمرة واحدة فقط ويتم إقفاله نهائياً 🔒** ولا يمكن تعديله أو حذفه إطلاقاً من داخل التطبيق بعد تأكيده وقفله؛ لأن كافة حسابات وميزانية العمارة وصافي الخزينة تُبنى عليه.
     - **إذا سأل العميل: كيف أعدل أو أحذف الرصيد الافتتاحي للخزينة؟**:
       * وضّح له مباشرة وبأدب واختصار: الرصيد الافتتاحي للخزينة يُقفل نهائياً بعد إدخاله لحماية دقة الحسابات، ولا يوجد خيار لحذفه أو تعديله من الإعدادات.
       * الحل المحاسبي: إذا كان هناك فرق في الحساب، يمكن تسجيل حركة تسوية (مثل إضافة مصروف تسوية بالفرق إذا كان الرصيد يحتاج لتخفيض)، أو التواصل معنا في الدعم الفني للمساعدة.
   • 🏢 **الرصيد الافتتاحي للشقق (مدين أو دائن)**:
     - إذا كان العميل يسأل عن رصيد شقة معينة: هذا مكانه ليس في الإعدادات، بل من شاشة **[إدارة الشقق]** ⬅️ النقر على الشقة (تخصيص الشقة) ⬅️ تعديل الرصيد أو كتابة 0 لحذفه وتصفيره.

7. 🌟 الميزة التفاعلية الذكية: استئذان العميل قبل إرسال لقطات الشاشة (قاعدة جوهرية):
لديك مكتبة لقطات شاشة حقيقية مأخوذة من داخل تطبيق عمارتي توضح الشاشات والخطوات بدقة.
⚡ **قواعد حاسمة وإلزامية للتعامل مع الصور**:
1. 🛑 **ممنوع نهائياً إرسال لقطة الشاشة مباشرة** في أول إجابة تشرح فيها خطوات أو مميزات أو أسعار!
2. 💡 **بدلاً من الإرسال المباشر، اعرض الصورة واسأل العميل بلباقة في نهاية ردك**:
   - اشرح الخطوات أو الإجابة بإيجاز ووضوح (2 إلى 4 أسطر).
   - في نهاية ردك، اسأل العميل سؤالاً ودياً يعرض عليه إرسال الصورة:
     مثال: "تحب أبعت لحضرتك صورة توضح [تسجيل الدفعة / باقات التجديد / شاشة المصروفات...]؟ 📱"
   - ضع في السطر الأخير تماماً الوسم التالي لتسجيل عرض الصورة:
     [OFFER_IMAGE: اسم_الملف.png | وصف توضيحي دقيق ومختصر جداً للصورة]

3. 📸 **استثناء للإرسال المباشر**:
   - فقط إذا طلب العميل صراحة رؤية صورة في رسالته (مثل: "ابعتلي صورة للشاشة"، "وريني شكل الباقات"، "ممكن سكرين شوت؟"):
   - هنا ترسل الصورة فوراً مع تعليق توضيحي مختصر جداً بالصيغة:
     [SEND_IMAGE: اسم_الملف.png | تعليق توضيحي مختصر جداً]
   - ⚠️ **تنبيه حاسم**: عند إرسال الصورة لا تكتب كلاماً كثيراً أبداً معها، بل فقط سطر أو سطرين توضيحيين كنقاط سريعة لما هو ظاهر في الصورة.

قائمة لقطات الشاشة المعتمدة والمتاحة لديك فقط (اختر منها بدقة تامة):
• [10_pay_pressed.png] 👈 عند السؤال عن تسجيل دفعة أو إرسال إيصال سداد واتساب للساكن.
• [10_payments_screen_actual.png] 👈 عند السؤال عن شاشة الدفعات والتحصيل الشهري ومتابعة المسددين وغير المسددين.
• [16_renewal_dialog.png] 👈 عند استفسار العميل عن باقات التجديد والأسعار أو طرق الدفع لحساب عمارتي (إنستاباي/فودافون كاش).
• [22_late_apartments_screen.png] 👈 عند السؤال عن متابعة الشقق المتأخرة وكيفية إرسال جرس وتنبيه للمتأخرين عبر واتساب.
• [12_add_expense_dialog.png] 👈 عند السؤال عن كيفية إضافة مصروف جديد للعمارة وتفاصيله وخصمه من الخزينة.
• [12_expenses_screen.png] 👈 عند السؤال عن استعراض المصروفات وأرشيف الصيانة والفواتير.
• [11_manage_apartments_screen.png] 👈 عند السؤال عن كيفية إدارة الشقق أو توليد الشقق آلياً.
• [11_edit_apt1_dialog.png] 👈 عند السؤال عن تعديل بيانات الساكن أو هاتفه أو كود المرور (PIN) الخاص بشقته.
• [11_renumber_apartments_dialog.png] 👈 عند السؤال عن إعادة ترقيم الشقق بالتتابع.
• [11_apartment_customize_sheet.png] 👈 عند السؤال عن تخصيص اشتراك شقة معينة أو وضع رصيد مدين/دائن افتتاحي لشقة.
• [08_send_sheet.png] 👈 عند السؤال عن إرسال إشعارات أو رسائل وتنبيهات للسكان واختيار القوالب.
• [07_create_proposal_modal.png] 👈 عند السؤال عن إنشاء مقترح أو تصويت واستطلاع رأي للسكان.
• [13_services_directory_screen.png] 👈 عند السؤال عن دليل الخدمات وأرقام الفنيين والطوارئ.
• [17_accounting_periods_screen.png] 👈 عند السؤال عن الفترات المحاسبية وتحديد اشتراكات سنوية مختلفة.
• [18_financial_goals_screen.png] 👈 عند السؤال عن الأهداف المالية وصناديق التوفير والتطوير.
• [19_import_backup_dialog.png] 👈 عند السؤال عن النسخ الاحتياطي وحفظ أو استرجاع بيانات العمارة.
• [06_payment_reports.png] 👈 عند السؤال عن تقارير السداد وتصدير كشف حساب PDF.
• [05_compass_guide.png] 👈 عند السؤال عن دليل ومرشد عمارتي والخطوات السبع للبداية.
• [09_opening_balance_dialog.png] 👈 عند السؤال عن تسجيل الرصيد الافتتاحي للخزينة.
• [16_account_and_subscription.png] 👈 عند السؤال عن إدارة الحساب أو تفاصيل رخصة العمارة.

قواعد الرد على العملاء:
- لا تدّعِ وجود أي ميزة ليست في التطبيق، وكن أميناً ودقيقاً 100%.
- وجّه العميل بالأسماء الحقيقية للشاشات والأزرار كما هي في التطبيق (تبويب الدفعات، زر سداد، مشاركة الإيصال عبر واتساب).
- كن مهنياً، ودوداً باعتدال وبدون تملق أو ترحيب زائد. ادخل في صلب الموضوع مباشرة.
- لا تذكر أبداً أنك ذكاء اصطناعي أو لغوي، بل أنت "المساعد الذكي لفريق تطبيق عمارتي".`;

/**
 * تحليل رد الذكاء الاصطناعي واستخراج صورة الشاشة المرفقة أو المعروضة
 */
async function parseReplyForImage(replyText, senderPhone) {
  if (!replyText) return { text: '', imageBuffer: null, sendImage: false };

  // 1. فحص هل الرد يحتوي على عرض لصورة (OFFER_IMAGE)
  const offerMatch = replyText.match(/\[OFFER_IMAGE:\s*([a-zA-Z0-9_\-\.]+)(?:\s*\|\s*([^\]]+))?\s*\]/i);
  if (offerMatch) {
    const rawFilename = offerMatch[1].trim();
    const customDesc = offerMatch[2] ? offerMatch[2].trim() : '';
    const cleanText = replyText.replace(offerMatch[0], '').trim();

    const details = SCREENSHOT_DETAILS[rawFilename] || {
      title: customDesc || 'لقطة شاشة توضيحية',
      description: customDesc || 'لقطة شاشة توضيحية من داخل التطبيق',
      notes: '• الخطوات موضحة داخل الصورة.'
    };

    // حفظ العرض المعلق للمستخدم
    if (senderPhone) {
      savePendingImageOffer(senderPhone, {
        filename: rawFilename,
        title: details.title,
        description: details.description,
        notes: details.notes,
        timestamp: Date.now()
      });
    }

    // لا نرسل أي صورة الآن، فقط النص الذي يستأذن العميل
    return {
      text: cleanText,
      imageBuffer: null,
      filename: rawFilename,
      sendImage: false
    };
  }

  // 2. فحص هل الرد يحتوي على أمر إرسال مباشر للصورة (SEND_IMAGE أو ATTACH_IMAGE القديمة)
  const sendMatch = replyText.match(/\[(?:SEND_IMAGE|ATTACH_IMAGE):\s*([a-zA-Z0-9_\-\.]+)(?:\s*\|\s*([^\]]+))?\s*\]/i);
  if (sendMatch) {
    const rawFilename = sendMatch[1].trim();
    const customDesc = sendMatch[2] ? sendMatch[2].trim() : '';
    const cleanText = replyText.replace(sendMatch[0], '').trim();

    const details = SCREENSHOT_DETAILS[rawFilename];
    const buffer = await getImageBuffer(rawFilename);

    if (buffer) {
      // إعداد كابشن مختصر جداً وبدون كلام كثير
      const briefCaption = details
        ? `📱 ${details.title}:\n${details.notes}`
        : (customDesc ? `📱 لقطة شاشة توضيحية:\n• ${customDesc}` : (cleanText.length <= 200 ? cleanText : '📱 لقطة شاشة توضيحية من داخل التطبيق'));

      return {
        text: briefCaption,
        imageBuffer: buffer,
        filename: rawFilename,
        sendImage: true
      };
    }

    return { text: cleanText, imageBuffer: null, sendImage: false };
  }

  return { text: replyText.trim(), imageBuffer: null, sendImage: false };
}

/**
 * إرسال الرسالة إلى Gemini واسترجاع الرد الذكي مع لقطة الشاشة التوضيحية
 */
async function getAIResponse(senderPhone, userMessage, options = {}) {
  if (!userMessage || !userMessage.trim()) return null;

  // إذا كان المرسل هو مدير ومطور النظام (م. محمود أحمد)
  if (senderPhone && (String(senderPhone).endsWith('1021252626') || String(senderPhone) === '01021252626')) {
    const { getAdminAIResponse } = require('./admin_service');
    const adminText = await getAdminAIResponse(userMessage);
    return { text: adminText, imageBuffer: null, sendImage: false };
  }

  // البحث عن هوية العميل عبر رقم هاتفه في كافة العمارات
  const supabaseClient = options.supabase || null;
  const userProfile = options.userProfile || (await findUserProfileByPhone(senderPhone, supabaseClient));

  // جلب سياق المحادثة السابق
  let history = chatSessions.get(senderPhone) || [];

  // تحديث الجلسة بمسح الرسائل القديمة إذا مر عليها أكثر من 30 دقيقة
  if (history.lastActive && (Date.now() - history.lastActive) > 30 * 60 * 1000) {
    history = [];
    pendingImageOffers.delete(senderPhone);
  }

  const isOngoingConversation = history.length > 0;
  const isFirstMessage = !isOngoingConversation;

  // ---------- 1. التحقق من العروض المعلقة للصور (إذا كان العميل يرد على سؤال عرض الصورة) ----------
  const activeOffer = pendingImageOffers.get(senderPhone);
  if (activeOffer && (Date.now() - activeOffer.timestamp) < 30 * 60 * 1000) {
    // أ) إذا رد العميل بالإيجاب (اه، ياريت، ابعت، تمام، ماشي...)
    if (isAffirmativeResponse(userMessage)) {
      pendingImageOffers.delete(senderPhone);
      const buffer = await getImageBuffer(activeOffer.filename);

      if (buffer) {
        // نص توضيحي مختصر ومفيد جداً بدون إطالة أو كلام كثير
        const caption = `📱 ${activeOffer.title}:\n${activeOffer.notes}`;

        history.push({ role: 'user', text: userMessage });
        history.push({ role: 'model', text: `تم إرسال لقطة شاشة توضيحية لـ ${activeOffer.title}` });
        history.lastActive = Date.now();
        saveChatSession(senderPhone, history);

        return {
          text: caption,
          imageBuffer: buffer,
          filename: activeOffer.filename,
          sendImage: true
        };
      }
    }

    // ب) إذا رد العميل بالرفض (لا، شكراً، مش محتاج...)
    if (isNegativeResponse(userMessage)) {
      pendingImageOffers.delete(senderPhone);
      const declineSalutation = userProfile?.name ? `أستاذ ${userProfile.name}` : 'يا فندم';
      const declineReply = `تحت أمرك ${declineSalutation}! لو احتجت أي استفسار أو مساعدة أنا في خدمتك دائماً 🌸`;

      history.push({ role: 'user', text: userMessage });
      history.push({ role: 'model', text: declineReply });
      history.lastActive = Date.now();
      saveChatSession(senderPhone, history);

      return {
        text: declineReply,
        imageBuffer: null,
        sendImage: false
      };
    }

    // ج) إذا سأل سؤالاً جديداً تماماً، نمسح العرض القديم ونمرر السؤال لـ Gemini
    pendingImageOffers.delete(senderPhone);
  }

  // ---------- 2. تجهيز محادثة نظيفة وتمريرها لـ Gemini مع سياق هوية العميل ----------
  const contents = [];

  // إضافة سياق المحادثة السابقة
  for (const item of history.slice(-6)) {
    contents.push({
      role: item.role,
      parts: [{ text: item.text }]
    });
  }

  // إضافة رسالة المستخدم الحالية
  contents.push({
    role: 'user',
    parts: [{ text: userMessage }]
  });

  // صياغة سياق وهوية العميل لدعم الترحيب بالاسم والوعي الكامل ببياناته
  let userContextPrompt = '';
  if (userProfile && userProfile.name) {
    const roleDesc = userProfile.userType === 'manager'
      ? `مسؤول عمارة (${userProfile.buildingName || ''} - كود: ${userProfile.buildingCode || ''})`
      : (userProfile.userType === 'resident'
        ? `أحد سكان عمارة (${userProfile.buildingName || ''}) - ${userProfile.role}`
        : `مقدم خدمة (${userProfile.role}) لعمارة ${userProfile.buildingName || ''}`);

    userContextPrompt = `\n\nمعلومات العميل المتحدث معك حالياً:
• الاسم المسجل في النظام: ${userProfile.name}
• الصفة: ${roleDesc}
• رقم الهاتف: ${senderPhone}

قواعد الترحيب والمخاطبة بالاسم لهذا العميل:
1. هذا العميل مسجل رسمياً في نظام عمارتي باسم "${userProfile.name}".
2. ${isFirstMessage ? `**هذه هي الرسالة الأولى في المحادثة**: يجب أن تبدأ ردك بترحيب شخصي حار ولائق باسمه (مثال: "أهلاً بك أستاذ ${userProfile.name} 🏢✨" أو "وعليكم السلام أستاذ ${userProfile.name} 🏢✨").` : 'هذه محادثة جارية مسبقاً: لا تعد تكرار ديباجة الترحيب الافتتاحية في كل رد، بل ادخل في صلب الإجابة مباشرة مع إمكانية مخاطبته باسمه بلباقة عند الحاجة.'}
3. يمكنك الإشارة لعمارتهم أو شقتهم عند الاقتضاء لإشعاره بالاهتمام والاحترافية.`;
  }

  const effectiveSystemPrompt = SYSTEM_PROMPT + userContextPrompt;

  // محاولة الإرسال مع تدوير الموديلات عند الضرورة
  for (const model of MODELS) {
    try {
      const reply = await callGeminiAPI(model, effectiveSystemPrompt, contents);
      if (reply) {
        const parsed = await parseReplyForImage(reply, senderPhone);

        // إذا كانت المحادثة مستمرة، نزيل برمجياً أي تحية افتتاحية مكررة لضمان الدخول المباشر في الإجابة
        if (isOngoingConversation && parsed.text && !parsed.sendImage) {
          const repetitiveGreetingRegex = /^(?:(?:يا\s*)?هلا\s*(?:ب(?:ك|حضرتك))?(?:\s*يا\s*فندم)?[!،,\.]*|أهلاً\s*(?:بك|بحضرتك|بيك)?(?:\s*يا\s*فندم)?[!،,\.]*|مساء\s*(?:الخير|النور|الجمال|الفل)(?:\s*يا\s*فندم)?[!،,\.]*|صباح\s*(?:الخير|النور|الجمال|الفل)(?:\s*يا\s*فندم)?[!،,\.]*|تحت\s*أمرك(?:\s*يا\s*فندم)?[!،,\.]*|نورتنا(?:\s*يا\s*فندم)?[!،,\.]*)\s*/i;
          parsed.text = parsed.text.replace(repetitiveGreetingRegex, '').trim();
        } else if (isFirstMessage && parsed.text && !parsed.sendImage) {
          // في الرسالة الأولى: التأكد الحاسم من إدراج اسم العميل في الترحيب
          parsed.text = ensurePersonalizedGreeting(parsed.text, userProfile, true);
        }

        // حفظ الرسالة والرد في الذاكرة
        history.push({ role: 'user', text: userMessage });
        history.push({ role: 'model', text: parsed.text });
        history.lastActive = Date.now();
        saveChatSession(senderPhone, history);

        return parsed;
      }
    } catch (err) {
      console.warn(`[Gemini AI] فشل الموديل ${model}:`, err.message);
    }
  }

  // إذا حدث ضغط استثنائي على السيرفرات، نرجع رداً احتياطياً لائقاً ومختصراً ومرحباً بالاسم
  const welcomeSalutation = userProfile?.name
    ? `أهلاً بك ${formatSalutation(userProfile.name, userProfile.userType, userProfile.buildingName)} 🏢✨ في خدمة عملاء تطبيق عمارتي`
    : 'أهلاً بك يا فندم في خدمة عملاء تطبيق عمارتي 🏢';

  return {
    text: `${welcomeSalutation}\nيسعدنا مساعدتك في أي استفسار يخص إدارة عقارك واشتراكات الشقق والمصروفات.\n\n💡 يمكنك السؤال عن:\n• مميزات التطبيق وكيفية استخدامه 📋\n• باقات الاشتراك وطرق الدفع (فودافون كاش / إنستاباي) 💳\n• حلول مشاكل تسجيل الدخول واستعادة كلمة المرور 🔒\n\nكيف يمكننا خدمتك اليوم؟`,
    imageBuffer: null,
    sendImage: false
  };
}

function callGeminiAPI(model, systemPrompt, contents) {
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

module.exports = {
  getAIResponse,
  findUserProfileByPhone,
  formatSalutation,
  ensurePersonalizedGreeting,
  parseReplyForImage,
  getImageBuffer,
  isAffirmativeResponse,
  isNegativeResponse,
  SCREENSHOTS_DIR
};
