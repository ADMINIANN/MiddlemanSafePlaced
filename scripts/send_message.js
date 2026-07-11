const fs = require('fs');
const io = require('socket.io-client');

function findCookieValue(cookieFilePath, name) {
  if (!fs.existsSync(cookieFilePath)) return null;
  const data = fs.readFileSync(cookieFilePath, 'utf8');
  const lines = data.split('\n');
  for (let i=0;i<lines.length;i++) {
    const parts = lines[i].split('\t');
    if (parts.length >= 7 && parts[5] === name) return parts[6];
  }
  const m = data.match(new RegExp(name + "\\s+([^\\s]+)"));
  if (m) return m[1];
  return null;
}

const cookieFile = '/tmp/cookies_addconv.txt';
const sid = findCookieValue(cookieFile, 'connect.sid');
if (!sid) { console.error('no sid'); process.exit(2); }
const cookieHeader = `connect.sid=${sid}`;

const socket = io('http://localhost:3000', {
  transports: ['websocket'],
  extraHeaders: { Cookie: cookieHeader },
});

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('chat:message', { message: 'Hello from AddConv', name: 'AddConv' });
});

socket.on('chat:newMessage', (m) => console.log('newMessage', m));
socket.on('chat:access', (p) => console.log('access', p));
socket.on('connect_error', (e) => { console.error('connect_error', e.message); process.exit(3); });
