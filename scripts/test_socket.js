// Simple socket.io client for testing chat:access
const fs = require('fs');
const io = require('socket.io-client');

function readCookieValue(cookieFilePath, name) {
  if (!fs.existsSync(cookieFilePath)) return null;
  const data = fs.readFileSync(cookieFilePath, 'utf8');
  const lines = data.split('\n');
  // combine wrapped cookie lines: ensure we process only complete lines with 7 columns
  for (let i=0;i<lines.length;i++) {
    let line = lines[i];
    if (!line || line.startsWith('#')) continue;
    let parts = line.split('\t');
    let j = i;
    while (parts.length < 7 && j+1 < lines.length) {
      j++;
      line = line + lines[j];
      parts = line.split('\t');
    }
    i = j;
    if (parts.length < 7) continue;
    // Netscape cookie format: ... <expiry> <name> <value>
    const cookieName = parts[5];
    const cookieValue = parts[6];
    if (cookieName === name) return cookieValue;
  }
    const cookieValue = null;

    // fallback: search for "connect.sid" followed by value anywhere in file
    function findCookieByRegex(cookieFilePath, name) {
      try {
        const data = fs.readFileSync(cookieFilePath, 'utf8');
        const m = data.match(new RegExp(name + "\\s+([^\\s]+)"));
        if (m) return m[1];
      } catch (e) {}
      return null;
    }
  
    return findCookieByRegex(cookieFilePath, name);
}

const cookieFileCandidates = ['/tmp/cookies_ws.txt','/tmp/cookies_e2e.txt','/tmp/cookies.txt','/tmp/cookies_ws.txt'];
let cookieFile = null;
for (const c of cookieFileCandidates) {
  if (fs.existsSync(c)) { cookieFile = c; break; }
}
if (!cookieFile) cookieFile = cookieFileCandidates[0];
const sid = readCookieValue(cookieFile, 'connect.sid') || readCookieValue(cookieFile, 'connect.sid');
if (!sid) {
  console.error('connect.sid not found in cookie file:', cookieFile);
  process.exit(2);
}

const cookieHeader = `connect.sid=${sid}`;
const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  extraHeaders: {
    Cookie: cookieHeader,
  },
});

socket.on('connect', () => {
  console.log('socket connected, id=', socket.id);
});

socket.on('disconnect', () => console.log('socket disconnected'));

socket.on('chat:access', (payload) => {
  console.log('chat:access event received:', payload);
  process.exit(0);
});

socket.on('connect_error', (err) => {
  console.error('connect_error', err.message || err);
  process.exit(3);
});
