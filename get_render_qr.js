const https = require('https');
const fs = require('fs');
const path = require('path');

const targetPath = 'C:\\Users\\Mahmoud Ahmed\\.gemini\\antigravity-ide\\brain\\71039dcc-8068-4e2b-8474-22bf9f3c787f\\render_qr.png';
const localPath = path.join(__dirname, 'latest_qr.png');

https.get('https://ammarty-bot.onrender.com/qr', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const match = data.match(/src="data:image\/png;base64,([^"]+)"/);
    if (match) {
      const buf = Buffer.from(match[1], 'base64');
      fs.writeFileSync(targetPath, buf);
      fs.writeFileSync(localPath, buf);
      console.log('SUCCESS: Render QR saved to', targetPath);
    } else {
      console.log('No QR image found, body:', data.slice(0, 300));
    }
  });
}).on('error', (err) => {
  console.error('Request error:', err);
});
