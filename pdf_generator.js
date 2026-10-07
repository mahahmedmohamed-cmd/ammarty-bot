/**
 * عمارتي - مولد الفواتير الرسمية بصيغة PDF المعتمدة
 * يستخدم محرك مايكروسوفت إيدج المدمج في ويندوز (بدون أي تكاليف أو مكتبات ثقيلة)
 */

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const QRCode = require('qrcode');
const { generateInvoiceHTML } = require('./invoice_template');

const EDGE_PATH_X86 = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const EDGE_PATH_X64 = 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe';

function getEdgePath() {
  if (fs.existsSync(EDGE_PATH_X86)) return EDGE_PATH_X86;
  if (fs.existsSync(EDGE_PATH_X64)) return EDGE_PATH_X64;
  return null;
}

function tafqeetEgyptianPounds(amount) {
  const num = Math.round(Number(amount));
  if (num === 500) return 'فقط وقدره خمسمائة جنيه مصري لا غير';
  if (num === 200) return 'فقط وقدره مائتان جنيه مصري لا غير';
  if (num === 360) return 'فقط وقدره ثلاثمائة وستون جنيهاً مصرياً لا غير';
  if (num === 400) return 'فقط وقدره أربعمائة جنيه مصري لا غير';
  if (num === 700) return 'فقط وقدره سبعمائة جنيه مصري لا غير';
  if (num === 1000) return 'فقط وقدره ألف جنيه مصري لا غير';
  return `فقط وقدره ${num} جنيه مصري لا غير`;
}

function formatDate(d) {
  if (!d) return '';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  return `${day} / ${month} / ${dateObj.getFullYear()}`;
}

/**
 * توليد ملف فاتورة PDF رسمي وحفظه في مجلد الفواتير
 * @param {Object} params
 * @returns {Promise<string|null>} مسار ملف الـ PDF الناتج
 */
async function generateInvoicePDF({
  invoiceNo,
  building,
  yearsCount = 1,
  paidPrice = 200,
  paymentMethod = 'إنستاباي (InstaPay)',
  txnRef = '',
  startDate = new Date(),
  expiryDate = null
}) {
  try {
    const edge = getEdgePath();
    if (!edge) {
      console.warn('[PDF] لم يتم العثور على مسار متصفح إيدج لتوليد PDF');
      return null;
    }

    const outputDir = path.join(__dirname, 'invoices');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const codeClean = (building.code || 'BLD-0000').replace(/[^a-zA-Z0-9-]/g, '');
    const htmlPath = path.join(outputDir, `invoice_${codeClean}_${Date.now()}.html`);
    const pdfPath = path.join(outputDir, `فاتورة_اشتراك_${codeClean}.pdf`);

    // شعار المنظومة
    const logoPath = path.join(__dirname, 'assets', 'logo.png');
    let logoBase64 = '';
    if (fs.existsSync(logoPath)) {
      logoBase64 = 'data:image/png;base64,' + fs.readFileSync(logoPath).toString('base64');
    }

    // رمز التحقق الإلكتروني QR
    const qrUrl = `https://ammarty.com/verify-invoice?no=${encodeURIComponent(invoiceNo)}&code=${encodeURIComponent(building.code)}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      margin: 1,
      width: 240
    }).catch(() => '');

    const expDate = expiryDate || new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + yearsCount));
    const basePrice = yearsCount >= 5 ? 1000 : (yearsCount === 2 ? 400 : yearsCount * 200);
    const discountAmount = Math.max(0, basePrice - paidPrice);
    const discountPercent = basePrice > 0 ? Math.round((discountAmount / basePrice) * 100) : 0;

    const invoiceData = {
      invoiceNo,
      issueDate: formatDate(new Date()),
      paymentMethod,
      txnRef: txnRef || `TXN-${codeClean}-${Date.now().toString().slice(-4)}`,
      managerName: building.manager_name ? `أ/ ${building.manager_name}` : 'إدارة العمارة',
      buildingName: building.name || 'عمارة سكنية',
      code: building.code || 'BLD-0000',
      managerPhone: building.manager_phone || '',
      apartmentsCount: building.apartments_count || 0,
      planName: yearsCount >= 5 ? 'باقة الـ 5 سنوات الذهبية' : `باقة ترخيص ${yearsCount} سنوات`,
      yearsCount,
      startDate: formatDate(startDate),
      expiryDate: formatDate(expDate),
      yearsCover: yearsCount === 1 ? 'سنة واحدة كاملة' : `${yearsCount} سنوات كاملة`,
      basePrice,
      discountAmount,
      discountPercent,
      paidPrice,
      remainingPrice: 0,
      amountInWords: tafqeetEgyptianPounds(paidPrice)
    };

    const htmlContent = generateInvoiceHTML(invoiceData, {
      isStandaloneForScreenshot: false,
      logoBase64,
      qrDataUrl
    });

    fs.writeFileSync(htmlPath, htmlContent, 'utf8');

    // تنفيذ الطباعة إلى PDF عبر execFile الآمن
    await new Promise((resolve, reject) => {
      const args = [
        '--headless',
        '--disable-gpu',
        '--run-all-compositor-stages-before-draw',
        `--print-to-pdf=${pdfPath}`,
        htmlPath
      ];
      execFile(edge, args, { timeout: 25000 }, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });

    // حذف ملف الـ HTML المؤقت
    try { if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath); } catch (_) {}

    if (fs.existsSync(pdfPath)) {
      return pdfPath;
    }
    return null;
  } catch (err) {
    console.error('[PDF Generator Error]:', err.message);
    return null;
  }
}

module.exports = {
  generateInvoicePDF,
  formatDate,
  tafqeetEgyptianPounds
};
