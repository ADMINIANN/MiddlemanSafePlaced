const express = require('express');
const path = require('path');
const http = require('http');
const fs = require('fs');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = 'richardmadrid12@proton.me';
const ADMIN_PASSWORD = 'richardmadrid12@proton.me';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Admin';

const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const SESSION_DIR = path.join(DATA_DIR, 'sessions');

const users = [];
const requests = [];
const chatMessages = [];
const conversationParticipants = {};

function loadStoreData() {
  try {
    if (!fs.existsSync(STORE_FILE)) {
      return;
    }
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    const stored = JSON.parse(raw);
    if (Array.isArray(stored.users)) {
      users.push(...stored.users);
    }
    if (Array.isArray(stored.requests)) {
      requests.push(...stored.requests);
    }
    if (Array.isArray(stored.chatMessages)) {
      chatMessages.push(...stored.chatMessages);
    }
    if (stored.conversationParticipants && typeof stored.conversationParticipants === 'object') {
      Object.assign(conversationParticipants, stored.conversationParticipants);
    }
  } catch (error) {
    console.error('Failed to load stored data:', error);
  }
}

function saveStoreData() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      STORE_FILE,
      JSON.stringify({ users, requests, chatMessages, conversationParticipants }, null, 2),
      'utf8'
    );
  } catch (error) {
    console.error('Failed to save stored data:', error);
  }
}

function ensureAdminUser() {
  const existingAdmin = users.find((user) => user.id === 'admin');
  if (!existingAdmin) {
    users.unshift(adminUser);
  }
}

loadStoreData();

const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const transporter = smtpConfigured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

const sessionMiddleware = session({
  store: new FileStore({
    path: SESSION_DIR,
    retries: 1,
  }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  name: process.env.SESSION_NAME || 'msp.sid',
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});

app.use(express.json());
app.use(sessionMiddleware);
app.use(express.static(path.join(__dirname, 'public')));

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

const adminUser = {
  id: 'admin',
  name: ADMIN_NAME,
  email: ADMIN_EMAIL,
  passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
  isAdmin: true,
};

const secondAdminUser = {
  id: 'admin-michael',
  name: 'Michael',
  email: 'renzomarion@proton.me',
  passwordHash: bcrypt.hashSync('renzomarion@proton.me', 10),
  isAdmin: true,
};

function ensureAdminUsers() {
  const hasPrimaryAdmin = users.some(
    (user) => user.id === adminUser.id || user.email.toLowerCase() === adminUser.email.toLowerCase()
  );
  const hasSecondAdmin = users.some(
    (user) => user.id === secondAdminUser.id || user.email.toLowerCase() === secondAdminUser.email.toLowerCase()
  );
  if (!hasPrimaryAdmin) {
    users.unshift(adminUser);
  }
  if (!hasSecondAdmin) {
    users.unshift(secondAdminUser);
  }
}

ensureAdminUsers();

function getUserFromSession(req) {
  if (!req.session || !req.session.userId) {
    return null;
  }
  return users.find((user) => user.id === req.session.userId) || null;
}

function getUserByEmail(email) {
  return users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

function getConversationParticipants(userId) {
  return conversationParticipants[userId] || [];
}

function addConversationParticipant(userId, email) {
  if (!conversationParticipants[userId]) {
    conversationParticipants[userId] = [];
  }
  const normalized = email.toLowerCase();
  if (!conversationParticipants[userId].includes(normalized)) {
    conversationParticipants[userId].push(normalized);
  }
  return conversationParticipants[userId];
}

function getHasRequest(userId) {
  const user = users.find((u) => u.id === userId);
  if (user && user.hasRequest) return true;
  return requests.some((request) => request.userId === userId);
}

// OTP flow removed: signup creates account immediately

function requireAdmin(req, res, next) {
  const user = getUserFromSession(req);
  if (!user || !user.isAdmin) {
    return res.status(403).json({ success: false, message: 'Admin access required.' });
  }
  next();
}

async function sendNotificationEmail(request) {
  const subject = `New middleman request from ${request.name}`;
  const text = `A new middleman request was submitted:\n\nName: ${request.name}\nEmail: ${request.email}\nFrom: ${request.from}\nTo: ${request.to}\nAmount: ${request.amount} ${request.currency}\nDetails: ${request.details || 'None'}\nSubmitted: ${request.createdAt}\n`;

  if (!transporter) {
    console.log('Email notification skipped: SMTP not configured.');
    console.log(text);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL || ADMIN_EMAIL,
    subject,
    text,
  });
}

async function sendChatNotificationEmail(message) {
  const subject = `New live chat message from ${message.name}`;
  const text = `A new live chat message was received:\n\nName: ${message.name}\nEmail: ${message.email || 'N/A'}\nMessage: ${message.message}\nTime: ${message.createdAt}\n`;

  if (!transporter) {
    console.log('Chat email notification skipped: SMTP not configured.');
    console.log(text);
    return;
  }

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: process.env.ADMIN_EMAIL || ADMIN_EMAIL,
    subject,
    text,
  });
}

app.post('/api/signup', async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  console.log('[signup] payload:', { name, email: normalizedEmail });
  if (!name || !normalizedEmail || !password) {
    return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
  }
  if (users.some((user) => user.email.toLowerCase() === normalizedEmail)) {
    return res.status(400).json({ success: false, message: 'A user with that email already exists.' });
  }

  if (normalizedEmail === ADMIN_EMAIL.toLowerCase()) {
    return res.status(400).json({ success: false, message: 'This email is reserved for the admin account.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: `${Date.now()}`,
    name,
    email: normalizedEmail,
    passwordHash,
    isAdmin: false,
  };
  users.push(user);
  saveStoreData();
  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) console.error('[signup] session save error', err);
    console.log('[signup] sessionID after save:', req.sessionID);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  });
});
// removed OTP verification endpoints: signup now creates account immediately

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  console.log('[login] attempt:', { email: normalizedEmail });
  if (!normalizedEmail || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  const user = users.find((item) => item.email.toLowerCase() === normalizedEmail);
  console.log('[login] found user:', !!user);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  req.session.userId = user.id;
  req.session.save((err) => {
    if (err) console.error('[login] session save error', err);
    console.log('[login] sessionID after save:', req.sessionID);
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
  });
});

app.post('/api/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  } else {
    res.json({ success: true });
  }
});

app.get('/api/current-user', (req, res) => {
  console.log('[current-user] cookies:', req.headers.cookie || null, 'sessionID:', req.sessionID, 'session:', !!req.session);
  const user = getUserFromSession(req);
  if (!user) {
    return res.json({ success: true, user: null });
  }
  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      hasRequest: user.isAdmin ? true : getHasRequest(user.id),
    },
  });
});
app.post('/api/request-middleman', async (req, res) => {
  const user = getUserFromSession(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'You must be logged in to submit a request.' });
  }

  const { from, to, amount, currency, details } = req.body;
  if (!from || !to || !amount || !currency) {
    return res.status(400).json({ success: false, message: 'Please complete all required fields.' });
  }

  const request = {
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    userId: user.id,
    name: user.name,
    email: user.email,
    from,
    to,
    amount,
    currency,
    details: details || '',
  };

  requests.push(request);
  saveStoreData();

  try {
    await sendNotificationEmail(request);
  } catch (error) {
    console.error('Failed to send email notification:', error);
  }

  // Notify the user's socket (if connected) that they now have chat access
  try {
    // mark the user object so subsequent /api/current-user checks persist
    const usr = users.find((u) => u.id === user.id);
    if (usr) {
      usr.hasRequest = true;
      saveStoreData();
    }
    io.to(`user:${user.id}`).emit('chat:access', { hasRequest: true });
  } catch (e) {
    // ignore
  }

  return res.json({
    success: true,
    message: 'Your middleman request has been submitted. A member of our team will follow up shortly.',
    request,
    hasRequest: true,
  });
});

app.get('/api/requests', requireAdmin, (req, res) => {
  return res.json({ success: true, requests });
});

app.get('/api/admin/conversations', requireAdmin, (req, res) => {
  const conversations = chatMessages.reduce((acc, message) => {
    if (!message.userId || message.userId === 'admin') {
      return acc;
    }
    const existing = acc.find((item) => item.userId === message.userId);
    if (existing) {
      existing.lastMessageAt = message.createdAt;
      existing.messageCount += 1;
      return acc;
    }
    const user = users.find((item) => item.id === message.userId);
    acc.push({
      userId: message.userId,
      name: message.name,
      email: user ? user.email : '',
      lastMessageAt: message.createdAt,
      messageCount: 1,
      participantEmails: getConversationParticipants(message.userId),
    });
    return acc;
  }, []);

  const sorted = conversations.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  res.json({ success: true, conversations: sorted });
});

// TEMP: expose pending signups for testing (admin-only)
// removed temporary pending signups admin endpoint

app.get('/api/admin/chats/:userId', requireAdmin, (req, res) => {
  const { userId } = req.params;
  const user = users.find((item) => item.id === userId);
  const messages = chatMessages.filter((message) => message.userId === userId);
  res.json({
    success: true,
    messages,
    participantEmails: getConversationParticipants(userId),
    user: user ? { name: user.name, email: user.email } : null,
  });
});

// Conversations accessible to the current authenticated user (their own + where they're a participant)
app.get('/api/my-conversations', (req, res) => {
  const user = getUserFromSession(req);
  if (!user) return res.status(401).json({ success: false, message: 'Not authenticated' });
  const email = (user.email || '').toLowerCase();
  const convMap = {};

  // include conversations created by the user, and any conversations where the user is a participant
  chatMessages.forEach((message) => {
    if (!message.userId) return;
    if (message.userId === user.id) {
      convMap[message.userId] = convMap[message.userId] || {
        userId: message.userId,
        name: message.name,
        email: user.email,
        lastMessageAt: message.createdAt,
        messageCount: 0,
        participantEmails: getConversationParticipants(message.userId),
      };
      convMap[message.userId].messageCount += 1;
      convMap[message.userId].lastMessageAt = message.createdAt;
      return;
    }

    const parts = getConversationParticipants(message.userId) || [];
    if (parts.includes(email)) {
      const owner = users.find((u) => u.id === message.userId);
      convMap[message.userId] = convMap[message.userId] || {
        userId: message.userId,
        name: message.name,
        email: owner ? owner.email : '',
        lastMessageAt: message.createdAt,
        messageCount: 0,
        participantEmails: parts,
      };
      convMap[message.userId].messageCount += 1;
      convMap[message.userId].lastMessageAt = message.createdAt;
    }
  });

  // also include conversations where the user has been added as a participant, even if there are no messages yet
  Object.entries(conversationParticipants).forEach(([ownerId, participants]) => {
    if (participants.includes(email) && !convMap[ownerId]) {
      const owner = users.find((u) => u.id === ownerId);
      convMap[ownerId] = {
        userId: ownerId,
        name: owner ? owner.name : 'Conversation',
        email: owner ? owner.email : '',
        lastMessageAt: new Date(0).toISOString(),
        messageCount: 0,
        participantEmails: participants,
      };
    }
  });

  const conversations = Object.values(convMap).sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));
  res.json({ success: true, conversations });
});

// Get conversation messages for a conversation if the current user is owner or participant
app.get('/api/chats/:userId', (req, res) => {
  const sessionUser = getUserFromSession(req);
  if (!sessionUser) return res.status(401).json({ success: false, message: 'Not authenticated' });
  const { userId } = req.params;
  const owner = users.find((u) => u.id === userId);
  const email = (sessionUser.email || '').toLowerCase();
  const isParticipant = (getConversationParticipants(userId) || []).includes(email);
  if (!sessionUser.isAdmin && sessionUser.id !== userId && !isParticipant) {
    return res.status(403).json({ success: false, message: 'Access denied to conversation.' });
  }
  const messages = chatMessages.filter((m) => m.userId === userId || (m.userId === sessionUser.id && m.userId === userId));
  res.json({ success: true, messages, participantEmails: getConversationParticipants(userId), user: owner ? { name: owner.name, email: owner.email } : null });
});

app.post('/api/admin/conversations/:userId/participants', requireAdmin, (req, res) => {
  const { userId } = req.params;
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, message: 'Valid email is required.' });
  }

  const targetUser = users.find((item) => item.id === userId);
  if (!targetUser) {
    return res.status(404).json({ success: false, message: 'Conversation not found.' });
  }

  const normalized = email.toLowerCase().trim();
  if (normalized === targetUser.email.toLowerCase()) {
    return res.status(400).json({ success: false, message: 'Email is already part of the conversation.' });
  }

  const participantList = addConversationParticipant(userId, normalized);
  saveStoreData();
  // notify the participant user (if registered) so their client can load the conversation messages
  const participantUser = getUserByEmail(normalized);
  if (participantUser) {
    const convoMessages = chatMessages.filter((m) => m.userId === userId);
    try {
      convoMessages.forEach((msg) => io.to(`user:${participantUser.id}`).emit('chat:newMessage', msg));
      io.to(`user:${participantUser.id}`).emit('chat:access', { hasRequest: getHasRequest(participantUser.id) });
    } catch (e) {
      // ignore emit errors
    }
  }

  res.json({ success: true, participantEmails: participantList });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Temporary debug endpoint to inspect session/cookie state in-browser
app.get('/api/debug/session', (req, res) => {
  res.json({
    cookies: req.headers.cookie || null,
    sessionID: req.sessionID || null,
    session: req.session || null,
    userFromSession: getUserFromSession(req),
  });
});

io.on('connection', (socket) => {
  const sessionUser = getUserFromSession(socket.request);

  if (!sessionUser) {
    socket.disconnect();
    return;
  }

  const roomName = sessionUser.isAdmin ? 'admin' : `user:${sessionUser.id}`;
  socket.join(roomName);

  // Send initial chat access status so the client can enable/disable chat UI
  if (!sessionUser.isAdmin) {
    socket.emit('chat:access', { hasRequest: getHasRequest(sessionUser.id) });
  }

  if (sessionUser.isAdmin) {
    socket.emit('chat:init', chatMessages);
  } else {
    // Include messages for conversations the user owns or where they were added as a participant
    const lowerEmail = (sessionUser.email || '').toLowerCase();
    const userMessages = chatMessages.filter((message) => {
      if (message.userId === sessionUser.id) return true;
      const parts = conversationParticipants[message.userId] || [];
      return parts.includes(lowerEmail);
    });
    socket.emit('chat:init', userMessages);
  }

  socket.on('chat:message', (payload) => {
    if (!payload || (!payload.message && !payload.moneyAmount)) {
      return;
    }

    if (sessionUser.isAdmin) {
      const targetUserId = payload.targetUserId;
      if (!targetUserId) {
        return;
      }
      const isMoney = payload.moneyAmount && !Number.isNaN(Number(payload.moneyAmount));
      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        userId: targetUserId,
        name: sessionUser.name,
        sender: 'admin',
        type: isMoney ? 'money' : 'text',
        amount: isMoney ? Number(payload.moneyAmount) : undefined,
        message: isMoney ? payload.message || `Sent $${Number(payload.moneyAmount).toFixed(2)}` : payload.message || '',
      };
      chatMessages.push(message);
      saveStoreData();
      io.to(`user:${targetUserId}`).emit('chat:newMessage', message);
      io.to('admin').emit('chat:newMessage', message);
    } else {
      const lowerEmail = (sessionUser.email || '').toLowerCase();
      let destUserId = sessionUser.id;
      if (payload.targetUserId && typeof payload.targetUserId === 'string') {
        const target = payload.targetUserId;
        const parts = getConversationParticipants(target) || [];
        if (target === sessionUser.id || parts.includes(lowerEmail)) {
          destUserId = target;
        } else {
          socket.emit('chat:error', { message: 'You are not a participant of the selected conversation.' });
          return;
        }
      }

      const isParticipant = destUserId !== sessionUser.id && getConversationParticipants(destUserId).includes(lowerEmail);
      const hasRequest = getHasRequest(sessionUser.id);
      if (destUserId === sessionUser.id && !hasRequest) {
        socket.emit('chat:error', { message: 'Please fill up the details of the transaction before you are able to send a message to live support.' });
        return;
      }
      if (destUserId !== sessionUser.id && !isParticipant) {
        socket.emit('chat:error', { message: 'You are not a participant of the selected conversation.' });
        return;
      }

      const message = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        userId: destUserId,
        name: sessionUser.name,
        email: sessionUser.email,
        sender: 'customer',
        message: payload.message,
      };
      chatMessages.push(message);
      saveStoreData();

      // Emit message back to the sender client only when they are not the owner
      // If destUserId === sessionUser.id the room emit below will already deliver to the sender
      if (destUserId !== sessionUser.id) {
        socket.emit('chat:newMessage', message);
      }
      io.to('admin').emit('chat:newMessage', message);

      // Notify owner of the conversation
      io.to(`user:${destUserId}`).emit('chat:newMessage', message);

      // Notify other participants of the conversation (except the sender)
      const participantEmails = getConversationParticipants(destUserId);
      participantEmails.forEach((participantEmail) => {
        const participantUser = getUserByEmail(participantEmail);
        if (participantUser && participantUser.id !== sessionUser.id) {
          io.to(`user:${participantUser.id}`).emit('chat:newMessage', message);
        }
      });

      sendChatNotificationEmail(message).catch((error) => {
        console.error('Failed to send chat notification email:', error);
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`MiddlemanSafePlace.com running at http://localhost:${PORT}`);
  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
});
