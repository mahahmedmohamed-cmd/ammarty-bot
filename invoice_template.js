/**
 * Ammarty Smart Property Management - Reusable Official Invoice Template
 * قوالب وتصميم الفواتير وإيصالات الترخيص الرسمية لمنظومة عمارتي
 * 
 * Note: س.ت برمجيات تم حذفه بناءً على الطلب
 */

function generateInvoiceHTML(data, options = {}) {
  const {
    isStandaloneForScreenshot = false,
    logoBase64 = '',
    qrDataUrl = ''
  } = options;

  const invoiceNo = data.invoiceNo || 'INV-2026-0001';
  const issueDate = data.issueDate || '06 / 10 / 2026';
  const paymentMethod = data.paymentMethod || 'إنستاباي (InstaPay)';
  const txnRef = data.txnRef || `TXN-${data.code || 'BLD'}-${Date.now().toString().slice(-4)}`;

  const customerName = data.managerName || 'غير مسجل';
  const buildingName = data.buildingName || 'عمارة سكنية';
  const buildingCode = data.code || 'BLD-0000';
  const phone = data.managerPhone || '';
  const apartmentsCount = data.apartmentsCount || 0;

  const planName = data.planName || 'باقة الترخيص السحابي';
  const yearsCount = data.yearsCount || 1;
  const startDate = data.startDate || '01 / 01 / 2026';
  const expiryDate = data.expiryDate || '01 / 01 / 2027';

  const basePrice = Number(data.basePrice || 0);
  const discountAmount = Number(data.discountAmount || 0);
  const discountPercent = Number(data.discountPercent || 0);
  const paidPrice = Number(data.paidPrice || 0);
  const remainingPrice = Number(data.remainingPrice || 0);
  const amountInWords = data.amountInWords || 'فقط لا غير';

  const waRawMessage = data.whatsappMessage || `مرحباً أستاذ ${customerName}، تحياتنا لك من إدارة تطبيق عمارتي 🏢✨
يسعدنا إرفاق إيصال السداد وفاتورة الترخيص الخاصة بـ ${buildingName} (كود: ${buildingCode}) بقيمة ${paidPrice} ج.م لمدة ${yearsCount} سنوات. شكراً لثقتكم الغالية!`;

  const waLink = `https://wa.me/${data.cleanPhone || phone}?text=${encodeURIComponent(waRawMessage)}`;

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>فاتورة ترخيص رسمي - ${buildingCode} - منصة عمارتي</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --primary: #0f172a;
      --brand: #3730a3;
      --brand-accent: #2563eb;
      --success: #059669;
      --border: #e2e8f0;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Cairo', system-ui, -apple-system, sans-serif;
    }

    .en-num {
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
      font-feature-settings: 'tnum' on, 'lnum' on;
      direction: ltr;
      display: inline-block;
    }

    body {
      background-color: ${isStandaloneForScreenshot ? '#f8fafc' : '#f1f5f9'};
      color: #0f172a;
      padding: ${isStandaloneForScreenshot ? '16px' : '24px 14px'};
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* Floating Action Bar */
    .action-bar {
      max-width: 840px;
      margin: 0 auto 18px auto;
      background: #0f172a;
      color: white;
      padding: 12px 20px;
      border-radius: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.3);
    }

    .action-bar-title {
      font-size: 13.5px;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-bar-title span {
      background: #1e293b;
      color: #60a5fa;
      padding: 2px 8px;
      border-radius: 6px;
      font-family: 'Plus Jakarta Sans', sans-serif;
      font-size: 11.5px;
    }

    .action-buttons {
      display: flex;
      gap: 8px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 12.5px;
      font-weight: 700;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-primary { background: #2563eb; color: white; }
    .btn-primary:hover { background: #1d4ed8; }

    .btn-success { background: #10b981; color: white; }
    .btn-success:hover { background: #059669; }

    .btn-secondary { background: #334155; color: white; }
    .btn-secondary:hover { background: #475569; }

    /* Invoice Container */
    .invoice-container {
      max-width: 840px;
      margin: 0 auto;
      background: #ffffff;
      border-radius: ${isStandaloneForScreenshot ? '0' : '16px'};
      box-shadow: ${isStandaloneForScreenshot ? 'none' : '0 15px 35px -5px rgba(15, 23, 42, 0.08), 0 0 0 1px #e2e8f0'};
      overflow: hidden;
      position: relative;
    }

    .top-accent-bar {
      height: 6px;
      background: linear-gradient(90deg, #312e81 0%, #2563eb 50%, #10b981 100%);
    }

    .watermark {
      position: absolute;
      top: 52%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-28deg);
      font-size: 105px;
      font-weight: 900;
      color: rgba(15, 23, 42, 0.022);
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
      z-index: 1;
      letter-spacing: 5px;
    }

    .invoice-content {
      position: relative;
      z-index: 2;
      padding: 36px 40px 30px 40px;
    }

    /* Header */
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding-bottom: 20px;
      border-bottom: 2px solid #f1f5f9;
      margin-bottom: 22px;
      gap: 20px;
    }

    .company-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      flex: 1;
    }

    .brand-logo {
      width: 68px;
      height: 68px;
      border-radius: 14px;
      object-fit: cover;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
      border: 1px solid #f1f5f9;
      flex-shrink: 0;
    }

    .brand-info h1 {
      font-size: 22px;
      font-weight: 900;
      color: #0f172a;
      line-height: 1.2;
      margin-bottom: 3px;
    }

    .brand-info .tagline {
      font-size: 11.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 4px;
    }

    /* NOTE: Commercial register number removed as requested */
    .brand-meta {
      font-size: 10.5px;
      color: #94a3b8;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 8px;
    }

    .invoice-meta-box {
      flex-shrink: 0;
      width: 270px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 12px 14px;
    }

    .invoice-badge-wrapper {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 1px dashed #cbd5e1;
    }

    .badge-paid {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      background: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
      padding: 3px 10px;
      border-radius: 20px;
      font-size: 11px;
      font-weight: 800;
    }

    .badge-paid-dot {
      width: 7px;
      height: 7px;
      background: #10b981;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
    }

    .invoice-title {
      font-size: 13.5px;
      font-weight: 900;
      color: #0f172a;
    }

    .meta-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 11.5px;
    }

    .meta-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .meta-label {
      color: #64748b;
      font-weight: 600;
    }

    .meta-val {
      color: #0f172a;
      font-weight: 800;
    }

    /* Cards Grid */
    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 22px;
    }

    .info-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 14px 16px;
    }

    .info-card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 10px;
      padding-bottom: 7px;
      border-bottom: 1px dashed #cbd5e1;
    }

    .info-card-title {
      font-size: 12px;
      font-weight: 800;
      color: #3730a3;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .info-card-badge {
      font-size: 10.5px;
      font-weight: 700;
      padding: 2px 7px;
      border-radius: 5px;
    }

    .info-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .info-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12.5px;
    }

    .info-item-label {
      color: #64748b;
      font-weight: 600;
    }

    .info-item-value {
      font-weight: 700;
      color: #0f172a;
    }

    .highlight-code {
      background: #0f172a;
      color: #f8fafc;
      padding: 1px 7px;
      border-radius: 5px;
      font-family: 'Plus Jakarta Sans', monospace;
      font-size: 11.5px;
      letter-spacing: 0.5px;
    }

    /* Items Table */
    .table-container {
      margin-bottom: 20px;
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      text-align: right;
    }

    .items-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 10px 14px;
      font-size: 11.5px;
      font-weight: 700;
    }

    .items-table td {
      padding: 14px;
      border-bottom: 1px solid #f1f5f9;
      font-size: 12.5px;
      vertical-align: top;
    }

    .item-title {
      font-weight: 800;
      color: #0f172a;
      font-size: 13.5px;
      margin-bottom: 5px;
    }

    .item-features {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px 10px;
    }

    .item-features li {
      font-size: 11px;
      color: #64748b;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .item-features li::before {
      content: "✓";
      color: #059669;
      font-weight: 900;
      font-size: 10.5px;
    }

    .cell-center {
      text-align: center;
      font-weight: 700;
    }

    .cell-price {
      text-align: left;
      direction: ltr;
      font-weight: 700;
    }

    .discount-pill {
      background: #fee2e2;
      color: #b91c1c;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 800;
      display: inline-block;
    }

    /* Summary */
    .summary-section {
      display: grid;
      grid-template-columns: 1.15fr 0.85fr;
      gap: 16px;
      margin-bottom: 20px;
      align-items: start;
    }

    .amount-in-words-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
    }

    .words-label {
      font-size: 10.5px;
      font-weight: 700;
      color: #64748b;
      margin-bottom: 3px;
    }

    .words-text {
      font-size: 13px;
      font-weight: 800;
      color: #3730a3;
      line-height: 1.4;
    }

    .payment-verified-note {
      margin-top: 8px;
      padding-top: 7px;
      border-top: 1px dashed #cbd5e1;
      font-size: 11px;
      color: #059669;
      font-weight: 700;
      display: flex;
      align-items: center;
      gap: 5px;
    }

    .totals-box {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 0;
      font-size: 12px;
    }

    .total-row.discount {
      color: #b91c1c;
      font-weight: 700;
    }

    .total-row.final-due {
      margin-top: 6px;
      padding-top: 6px;
      border-top: 2px solid #cbd5e1;
      font-size: 14.5px;
      font-weight: 900;
      color: #0f172a;
    }

    .final-amount-val {
      font-size: 18px;
      color: #3730a3;
      font-weight: 900;
    }

    /* Verification & Stamp */
    .verification-area {
      display: grid;
      grid-template-columns: 120px 1fr 165px;
      gap: 16px;
      padding: 14px 16px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      align-items: center;
      margin-bottom: 20px;
    }

    .qr-column {
      text-align: center;
    }

    .qr-img {
      width: 96px;
      height: 96px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      padding: 3px;
      background: white;
    }

    .qr-caption {
      font-size: 9.5px;
      color: #64748b;
      margin-top: 3px;
      font-weight: 600;
    }

    .terms-column {
      font-size: 10.5px;
      color: #475569;
      line-height: 1.5;
      border-right: 1px solid #f1f5f9;
      border-left: 1px solid #f1f5f9;
      padding: 0 14px;
    }

    .terms-title {
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
      font-size: 11px;
    }

    .terms-column ul {
      padding-right: 14px;
      margin: 0;
    }

    .stamp-column {
      text-align: center;
    }

    .stamp-wrapper {
      display: inline-block;
      transform: rotate(-7deg);
    }

    .signature-title {
      font-size: 10px;
      font-weight: 700;
      color: #64748b;
      margin-top: 3px;
    }

    /* Footer */
    .invoice-footer {
      border-top: 1px solid #f1f5f9;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      color: #94a3b8;
    }

    .footer-contacts {
      display: flex;
      gap: 14px;
    }

    /* PRINT STYLES */
    @media print {
      body {
        background: #ffffff !important;
        padding: 0 !important;
      }

      .action-bar {
        display: none !important;
      }

      .invoice-container {
        box-shadow: none !important;
        border: none !important;
        max-width: 100% !important;
        border-radius: 0 !important;
      }

      .invoice-content {
        padding: 6mm 10mm !important;
      }

      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      @page {
        size: A4 portrait;
        margin: 5mm;
      }
    }
  </style>
</head>
<body>

  ${isStandaloneForScreenshot ? '' : `
  <!-- Screen Floating Control Bar -->
  <div class="action-bar">
    <div class="action-bar-title">
      🏢 <strong>منظومة عمارتي</strong> | فاتورة ترخيص رسمية معتمدة
      <span>${buildingCode}</span>
    </div>
    <div class="action-buttons">
      <button class="btn btn-primary" onclick="window.print()">
        🖨️ طباعة الفاتورة / حفظ كـ PDF
      </button>
      <a class="btn btn-success" href="${waLink}" target="_blank">
        💬 إرسال للعميل عبر واتساب
      </a>
      <button class="btn btn-secondary" onclick="copyWhatsAppMessage()">
        📋 نسخ نص الإشعار
      </button>
    </div>
  </div>
  `}

  <!-- Main Invoice -->
  <div class="invoice-container">
    <div class="top-accent-bar"></div>
    <div class="watermark">AMMARTY OFFICIAL</div>

    <div class="invoice-content">

      <!-- Header -->
      <header class="invoice-header">
        <div class="company-brand">
          <img src="${logoBase64}" alt="شعار عمارتي" class="brand-logo">
          <div class="brand-info">
            <h1>منظومة عمارتي الذكية</h1>
            <div class="tagline">المنصة السحابية لإدارة العقارات والمجمعات السكنية</div>
            <div class="brand-meta">
              <span>📍 القاهرة - جمهورية مصر العربية</span>
              <span>•</span>
              <span>🌐 <strong class="en-num">www.ammarty.com</strong></span>
            </div>
          </div>
        </div>

        <div class="invoice-meta-box">
          <div class="invoice-badge-wrapper">
            <div class="invoice-title">فاتورة ترخيص رسمي</div>
            <div class="badge-paid">
              <span class="badge-paid-dot"></span>
              مسددة بالكامل • PAID
            </div>
          </div>
          <div class="meta-list">
            <div class="meta-item">
              <span class="meta-label">رقم الفاتورة:</span>
              <span class="meta-val en-num">${invoiceNo}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">تاريخ التحرير:</span>
              <span class="meta-val en-num">${issueDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">طريقة السداد:</span>
              <span class="meta-val">${paymentMethod}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">المرجع المالي:</span>
              <span class="meta-val en-num">${txnRef}</span>
            </div>
          </div>
        </div>
      </header>

      <!-- Customer & License Details Grid -->
      <section class="info-grid">
        <!-- Customer Info -->
        <div class="info-card">
          <div class="info-card-header">
            <div class="info-card-title">
              👤 بيانات العميل والعقار المفوتر له
            </div>
            <span class="info-card-badge" style="background:#e0e7ff; color:#3730a3;">مسؤول معتمد</span>
          </div>
          <div class="info-list">
            <div class="info-item">
              <span class="info-item-label">اسم المسؤول / العميل:</span>
              <span class="info-item-value">${customerName}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">اسم العقار السكني:</span>
              <span class="info-item-value">${buildingName}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">كود النظام الفريد:</span>
              <span class="info-item-value highlight-code">${buildingCode}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">رقم الهاتف المسجل:</span>
              <span class="info-item-value en-num">${phone}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">عدد الوحدات المشمولة:</span>
              <span class="info-item-value"><strong>${apartmentsCount}</strong> شقة سكنية</span>
            </div>
          </div>
        </div>

        <!-- License Info -->
        <div class="info-card">
          <div class="info-card-header">
            <div class="info-card-title">
              🛡️ مواصفات وصلاحية الترخيص السحابي
            </div>
            <span class="info-card-badge" style="background:#dcfce7; color:#15803d;">نشط ومفعّل 100%</span>
          </div>
          <div class="info-list">
            <div class="info-item">
              <span class="info-item-label">نوع الباقة المختارة:</span>
              <span class="info-item-value" style="color:#3730a3; font-weight:800;">${planName}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">مدة الاشتراك:</span>
              <span class="info-item-value"><strong>${yearsCount}</strong> ${yearsCount === 1 ? 'سنة واحدة (12 شهراً)' : yearsCount === 2 ? 'سنتان (24 شهراً)' : yearsCount + ' سنوات (' + (yearsCount * 12) + ' شهراً)'}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">تاريخ بداية السريان:</span>
              <span class="info-item-value en-num">${startDate}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">تاريخ نهاية الصلاحية:</span>
              <span class="info-item-value en-num" style="color:#059669; font-weight:800;">${expiryDate}</span>
            </div>
            <div class="info-item">
              <span class="info-item-label">خوادم الاستضافة والربط:</span>
              <span class="info-item-value">سحابة عمارتي الآمنة (Supabase Cloud 24/7)</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Items Table -->
      <section class="table-container">
        <table class="items-table">
          <thead>
            <tr>
              <th style="width: 36px; text-align: center;">#</th>
              <th>بيان الخدمة وتفاصيل التغطية</th>
              <th style="width: 95px; text-align: center;">المدة</th>
              <th style="width: 105px; text-align: left;">السعر الأساسي</th>
              <th style="width: 115px; text-align: left;">الخصم الممنوح</th>
              <th style="width: 115px; text-align: left;">الصافي المسدد</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="cell-center en-num">01</td>
              <td>
                <div class="item-title">
                  ⭐ ترخيص سحابي متكامل - تطبيق ومنظومة "عمارتي"
                </div>
                <ul class="item-features">
                  <li>إدارة شاملة لـ ${apartmentsCount} شقة وسجلات الملاك والمستأجرين</li>
                  <li>سندات قبض إلكترونية ومتابعة اشتراكات الصيانة الشهرية</li>
                  <li>سجل المصروفات وفواتير الصيانة والخزينة وتقارير الأرباح</li>
                  <li>نظام التنبيهات وإشعارات الواتساب الآلية للسكان</li>
                  <li>نسخ احتياطي سحابي تلقائي وتشفير مصرفي للبيانات 24/7</li>
                  <li>دعم فني مخصص وتحديثات وترقيات مستقبلية مجاناً طوال المدة</li>
                </ul>
              </td>
              <td class="cell-center">
                <strong>${yearsCount} سنوات</strong>
                <div style="font-size:10.5px; color:#64748b;">(${yearsCount * 12} شهراً)</div>
              </td>
              <td class="cell-price">
                <span class="en-num">${basePrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> ج.م
              </td>
              <td class="cell-price">
                ${discountAmount > 0 ? `
                  <div class="discount-pill">
                    -${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م
                  </div>
                  <div style="font-size: 10px; color:#b91c1c; font-weight:700; margin-top:2px;">خصم خاص ${discountPercent}%</div>
                ` : `
                  <span style="color:#64748b; font-size:12px;">0.00 ج.م</span>
                `}
              </td>
              <td class="cell-price" style="font-size: 14.5px; color: #3730a3; font-weight: 800;">
                <span class="en-num">${paidPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> ج.م
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- Summary Section -->
      <section class="summary-section">
        <div class="amount-in-words-box">
          <div class="words-label">المبلغ الصافي المسدد كتابةً:</div>
          <div class="words-text">
            « ${amountInWords} »
          </div>
          <div class="payment-verified-note">
            <span>✓</span>
            <span>تم التحصيل بنجاح عبر خدمة ${paymentMethod} ومسجل ومقيد بالخزينة المركزية.</span>
          </div>
        </div>

        <div class="totals-box">
          <div class="total-row">
            <span style="color:#64748b;">إجمالي الباقة (${yearsCount} سنوات):</span>
            <span class="en-num">${basePrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</span>
          </div>
          ${discountAmount > 0 ? `
          <div class="total-row discount">
            <span>خصم ترويجي استثنائي (${discountPercent}%):</span>
            <span class="en-num">-${discountAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م</span>
          </div>
          ` : ''}
          <div class="total-row final-due">
            <span>إجمالي المبلغ المسدد:</span>
            <span class="final-amount-val"><span class="en-num">${paidPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span> <small style="font-size:12px; font-weight:700;">ج.م</small></span>
          </div>
          <div class="total-row" style="color:#059669; font-weight:700; font-size:11px; margin-top:3px;">
            <span>المبلغ المتبقي:</span>
            <span class="en-num">${remainingPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })} ج.م (لا يوجد أي مستحقات)</span>
          </div>
        </div>
      </section>

      <!-- Verification, QR Code & Stamp Area -->
      <section class="verification-area">
        <div class="qr-column">
          <img src="${qrDataUrl}" alt="رمز التحقق السريع" class="qr-img">
          <div class="qr-caption">امسح للتحقق الرقمي من صحة الفاتورة</div>
        </div>

        <div class="terms-column">
          <div class="terms-title">📌 شروط وضمان الخدمة:</div>
          <ul>
            <li>تعتبر هذه الفاتورة إيصالاً رسمياً وسنداً مبرئاً لذمة العميل لكامل قيمة الترخيص حتى ${expiryDate}.</li>
            <li>تضمن إدارة "عمارتي" استقرار عمل السيرفرات السحابية بنسبة 99.9% والنسخ الاحتياطي الدائم.</li>
            <li>لا تطبق أي زيادات سعرية أو تكاليف خفية إضافية على هذا العقار طوال فترة السنوات المسددة.</li>
          </ul>
        </div>

        <div class="stamp-column">
          <div class="stamp-wrapper">
            <!-- Official Circular Seal SVG -->
            <svg width="118" height="118" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
              <circle cx="100" cy="100" r="94" fill="none" stroke="#1d4ed8" stroke-width="3" stroke-dasharray="6 3" />
              <circle cx="100" cy="100" r="88" fill="none" stroke="#1d4ed8" stroke-width="2" />
              <circle cx="100" cy="100" r="62" fill="#eff6ff" stroke="#1d4ed8" stroke-width="2" />
              
              <path id="topCurve" fill="none" d="M 22 100 A 78 78 0 0 1 178 100" />
              <text font-family="'Cairo', sans-serif" font-size="11" font-weight="900" fill="#1e40af" letter-spacing="1.5">
                <textPath href="#topCurve" startOffset="50%" text-anchor="middle">
                  منظومة عمارتي الذكية • AMMARTY
                </textPath>
              </text>

              <path id="bottomCurve" fill="none" d="M 178 100 A 78 78 0 0 1 22 100" />
              <text font-family="'Cairo', sans-serif" font-size="10.5" font-weight="800" fill="#1e40af" letter-spacing="1">
                <textPath href="#bottomCurve" startOffset="50%" text-anchor="middle">
                  ★ إدارة التراخيص والمالية ★
                </textPath>
              </text>

              <g transform="translate(100, 100) rotate(-5)">
                <rect x="-54" y="-18" width="108" height="36" rx="6" fill="#1e40af" />
                <text x="0" y="-3" font-family="'Plus Jakarta Sans', sans-serif" font-size="13" font-weight="900" fill="#ffffff" text-anchor="middle" letter-spacing="1">
                  PAID &amp; VERIFIED
                </text>
                <text x="0" y="11" font-family="'Cairo', sans-serif" font-size="9" font-weight="800" fill="#93c5fd" text-anchor="middle">
                  معتمد ومسدد بالكامل
                </text>
              </g>

              <text x="100" y="70" font-family="'Plus Jakarta Sans', sans-serif" font-size="10" font-weight="800" fill="#1d4ed8" text-anchor="middle">
                ${data.yearsCover || '2026 - 2031'}
              </text>
              <text x="100" y="148" font-family="'Cairo', sans-serif" font-size="9" font-weight="700" fill="#2563eb" text-anchor="middle">
                ختم إلكتروني معتمد
              </text>
            </svg>
          </div>
          <div class="signature-title">اعتماد الإدارة المالية والتراخيص</div>
        </div>
      </section>

      <!-- Footer -->
      <footer class="invoice-footer">
        <div>
          منظومة عمارتي لإدارة العقارات والمجمعات السكنية © 2026 | جميع الحقوق محفوظة
        </div>
        <div class="footer-contacts">
          <span>📧 <span class="en-num">support.ammarty@gmail.com</span></span>
          <span>💬 واتساب: <span class="en-num">01105648538</span></span>
        </div>
      </footer>

    </div>
  </div>

  <script>
    function copyWhatsAppMessage() {
      const text = decodeURIComponent("${encodeURIComponent(waRawMessage)}");
      navigator.clipboard.writeText(text).then(() => {
        alert("✅ تم نسخ نص الرسالة بنجاح! يمكنك الآن لصقها وإرسالها للساكن عبر واتساب.");
      }).catch(err => {
        prompt("انسخ الرسالة من هنا:", text);
      });
    }
  </script>
</body>
</html>`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { generateInvoiceHTML };
}
