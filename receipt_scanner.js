/**
 * عمارتي - محرك الفحص الذكي للإيصالات البنكية وقراءة السكرين شوت (OCR)
 * يتعرف تلقائياً على إيصالات إنستاباي، البنك الأهلي، بنك الإسكندرية، فودافون كاش
 * يطابق بدقة بين المعاملات البنكية والطلبات المعلقة لحل أي تزامن
 */

const Tesseract = require('tesseract.js');
const path = require('path');

// الأرقام والحسابات المعتمدة لمنظومة عمارتي
const AUTHORIZED_RECEIVERS = {
  phones: ['01021252626', '1021252626', '201021252626'],
  names: ['محمود', 'محمود أحمد', 'mahmoud', 'mahmoud ahmed', 'عمارتي', 'ammarty'],
  banks: ['بنك الإسكندرية', 'بنك الاسكندرية', 'alexbank', 'alex bank', 'إسكندرية', 'اسكندرية', '4988']
};

/**
 * تحويل الأرقام العربية (المشرقية) إلى أرقام إنجليزية معتمدة
 */
function normalizeDigits(str) {
  if (!str) return '';
  return str.replace(/[\u0660-\u0669]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

/**
 * فحص الصورة واستخراج النصوص عبر OCR
 */
async function extractTextFromImage(imageBuffer) {
  try {
    const { data } = await Tesseract.recognize(imageBuffer, 'ara+eng', {
      langPath: __dirname
    });
    return data.text || '';
  } catch (err) {
    console.error('[OCR Error]:', err.message);
    throw err;
  }
}

/**
 * تحليل النصوص المستخرجة من الإيصال أو الرسالة النصية
 */
function parseReceiptData(ocrText = '', userText = '') {
  const combined = `${userText}\n${ocrText}`;
  const normalized = normalizeDigits(combined);

  // 1. استخراج المبلغ
  let amount = null;
  const amountPatterns = [
    /(?:المبلغ|بقيمة|قيمة|إجمالي|المحول|Amount)\s*:?\s*([0-9]+(?:\.[0-9]+)?)/i,
    /([0-9]+(?:\.[0-9]+)?)\s*(?:ج\.م|جم|ج|جنيه|جنيهات|EGP)/i,
    /\b(200|360|400|500|700|1000)\b/
  ];
  for (const pat of amountPatterns) {
    const m = normalized.match(pat);
    if (m) {
      amount = parseFloat(m[1] || m[0]);
      break;
    }
  }

  // 2. استخراج رقم المرجع / المعاملة
  let reference = null;
  const refPatterns = [
    /(?:المرجع|رقم المرجع|العملية|رقم العملية|رقم المعاملة|المعاملة|Reference|Ref|Txn Ref|Transaction ID)\s*:?\s*([0-9A-Za-z]{5,24})/i,
    /\b([0-9]{10,16})\b/, // أرقام مراجع إنستاباي والتحويلات البنكية (10-16 رقم)
    /\b([0-9a-f]{8,12})\b/i // مراجع هيكس بنك الإسكندرية
  ];
  for (const pat of refPatterns) {
    const m = normalized.match(pat);
    if (m) {
      reference = (m[1] || m[0]).trim();
      break;
    }
  }

  // 3. التحقق من المستلم (المحفظة أو حساب عمارتي)
  let isAuthorizedRecipient = false;
  const normalizedLower = normalized.toLowerCase();

  // فحص رقم الهاتف
  for (const p of AUTHORIZED_RECEIVERS.phones) {
    if (normalized.includes(p)) {
      isAuthorizedRecipient = true;
      break;
    }
  }
  // فحص الاسم
  if (!isAuthorizedRecipient) {
    for (const n of AUTHORIZED_RECEIVERS.names) {
      if (normalizedLower.includes(n.toLowerCase())) {
        isAuthorizedRecipient = true;
        break;
      }
    }
  }
  // فحص البنك
  if (!isAuthorizedRecipient) {
    for (const b of AUTHORIZED_RECEIVERS.banks) {
      if (normalizedLower.includes(b.toLowerCase())) {
        isAuthorizedRecipient = true;
        break;
      }
    }
  }

  // 4. استخراج كود العمارة إن وجد في الإيصال أو نص العميل
  let buildingCode = null;
  const codeMatch = normalized.match(/BLD-?([0-9]{4})/i) || normalized.match(/كود\s*([0-9]{4})/i);
  if (codeMatch) buildingCode = 'BLD-' + codeMatch[1];

  // 5. نوع وسيلة الدفع
  let paymentMethod = 'InstaPay';
  if (/فودافون|كاش|Vodafone/i.test(normalized)) {
    paymentMethod = 'Vodafone Cash';
  } else if (/بنك الإسكندرية|AlexBank/i.test(normalized)) {
    paymentMethod = 'بنك الإسكندرية (InstaPay)';
  }

  return {
    amount,
    reference,
    isAuthorizedRecipient,
    buildingCode,
    paymentMethod,
    rawText: combined
  };
}

/**
 * مطابقة بيانات الإيصال مع المعاملات البنكية الفعلية والدفعات المعلقة
 * ⚠️ حماية مالية صارمة: لا يتم التفعيل أبداً بناءً على صورة الإيصال بمفردها منعاً للإيصالات المزورة أو بالذكاء الاصطناعي
 */
function matchReceiptWithCollision({
  receiptData,
  senderPhone,
  senderJid,
  userText = '',
  pendingOrders = [],
  ambiguousPayments = [],
  bankTransactions = []
}) {
  // أ) تحديد الطلب المعلق الخاص بهذا العميل الراسل
  let clientOrder = null;
  const senderLast9 = (senderPhone || '').slice(-9);

  for (const o of pendingOrders) {
    const oSenderLast9 = (o.sender_phone || '').slice(-9);
    const oMgrLast9 = (o.manager_phone || '').slice(-9);

    if (
      (senderLast9 && (oSenderLast9 === senderLast9 || oMgrLast9 === senderLast9)) ||
      (senderJid && o.sender_jid === senderJid) ||
      (receiptData.buildingCode && o.building_code === receiptData.buildingCode)
    ) {
      clientOrder = o;
      break;
    }
  }

  if (!clientOrder && pendingOrders.length === 1) {
    // إذا كان هناك طلب معلق وحيد في النظام، نربطه به
    clientOrder = pendingOrders[0];
  }

  const normUserText = normalizeDigits(userText).toLowerCase();
  const normOcrText = normalizeDigits(receiptData.rawText).toLowerCase();

  // ب) مطابقة مع المعاملات البنكية الحقيقية المستلمة (Bank SMS من ALEXBANK أو فودافون كاش)
  let matchedBankTxn = null;
  for (const txn of bankTransactions) {
    if (txn.status === 'claimed') continue; // تم احتسابها واستخدامها مسبقاً

    const txnId = (txn.transaction_id || '').toLowerCase();
    
    // 1. تطابق صريح برقم المعاملة / المرجع
    const refMatch =
      (txnId && receiptData.reference && (txnId.includes(receiptData.reference.toLowerCase()) || receiptData.reference.toLowerCase().includes(txnId))) ||
      (txnId && normUserText.includes(txnId)) ||
      (txnId && normOcrText.includes(txnId));

    // 2. تطابق بالمبلغ والمستلم المعتمد لعملية بنكية وصلت خلال آخر ساعتين
    const amountMatch = clientOrder && Math.abs((txn.amount || 0) - (clientOrder.expected_amount || receiptData.amount || 200)) < 1;
    const isSingleUnclaimedAmount = bankTransactions.filter(b => b.status !== 'claimed' && Math.abs((b.amount || 0) - txn.amount) < 1).length === 1;

    if (refMatch || (amountMatch && receiptData.isAuthorizedRecipient && isSingleUnclaimedAmount)) {
      matchedBankTxn = txn;
      break;
    }
  }

  // ج) البحث في الدفعات المعلقة المحجوزة بسبب التزامن (Ambiguous Payments)
  let matchedAmbiguous = null;
  for (const amb of ambiguousPayments) {
    const ambTxn = (amb.transaction_id || '').toLowerCase();
    
    const refMatch =
      (ambTxn && receiptData.reference && (ambTxn.includes(receiptData.reference.toLowerCase()) || receiptData.reference.toLowerCase().includes(ambTxn))) ||
      (ambTxn && normUserText.includes(ambTxn)) ||
      (ambTxn && normOcrText.includes(ambTxn));

    const isCandidate = clientOrder && Array.isArray(amb.candidates) &&
      amb.candidates.some(c => c.building_id === clientOrder.building_id || c.building_code === clientOrder.building_code);

    const amountMatch = clientOrder && Math.abs(amb.amount - (clientOrder.expected_amount || 200)) < 1;

    if (refMatch || (isCandidate && amountMatch && receiptData.isAuthorizedRecipient)) {
      matchedAmbiguous = amb;
      break;
    }
  }

  // 🛡️ الأمان المالي:
  // التأكيد النهائي (isConfirmed) يشترط 100% وجود معاملة بنكية حقيقية (Bank SMS) أو دفعة بنكية محجوزة!
  const isConfirmed = !!(clientOrder && (matchedBankTxn || matchedAmbiguous));
  
  // إذا أرسل العميل إيصالاً لحسابنا لكن إشعار البنك لم يصل بعد، نضعه في وضع الانتظار للتأكيد اللحظي
  const awaitingBankConfirmation = !!(clientOrder && receiptData.isAuthorizedRecipient && !matchedBankTxn && !matchedAmbiguous);

  return {
    clientOrder,
    matchedBankTxn,
    matchedAmbiguous,
    isConfirmed,
    awaitingBankConfirmation
  };
}

module.exports = {
  extractTextFromImage,
  parseReceiptData,
  matchReceiptWithCollision,
  normalizeDigits
};
