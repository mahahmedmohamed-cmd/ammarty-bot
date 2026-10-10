const https = require('https');
const fs = require('fs');
const path = require('path');

const targetPath = 'C:\\Users\\Mahmoud Ahmed\\.gemini\\antigravity-ide\\brain\\44dffa72-95c9-495d-9351-a50d2233380c\\render_qr.png';

https.get('https://ammarty-bot.onrender.com/qr', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/src="data:image\/png;base64,([^"]+)"/);
    if (match) {
      fs.writeFileSync(targetPath, Buffer.from(match[1], 'base64'));
      console.log('SUCCESS: Render QR saved to', targetPath);
    } else {
      console.log('No QR image found, body:', data.slice(0, 300));
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err);
});
