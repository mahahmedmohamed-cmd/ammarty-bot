const { spawn } = require('child_process');
const path = require('path');

console.log('========================================================');
console.log('  عمارتي - مشغل بوت واتساب الذكي مع الحماية من التوقف');
console.log('========================================================\n');

function startServer() {
  console.log(`[${new Date().toLocaleTimeString('ar-EG')}] 🚀 جاري تشغيل سيرفر البوت...`);
  
  const child = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    console.log(`\n⚠️ توقف السيرفر (كود: ${code || signal || 0}). جاري إعادة التشغيل تلقائياً بعد 3 ثوانٍ...\n`);
    setTimeout(startServer, 3000);
  });

  child.on('error', (err) => {
    console.error('❌ خطأ في تشغيل العملية:', err.message);
    setTimeout(startServer, 3000);
  });
}

startServer();
