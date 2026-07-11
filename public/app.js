const authCard = document.getElementById('auth-card');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const showLoginBtn = document.getElementById('show-login-btn');
const showSignupBtn = document.getElementById('show-signup-btn');
const authMessageNode = document.getElementById('auth-message');
const userCard = document.getElementById('user-card');
const userNameNode = document.getElementById('user-name');
// OTP removed: no OTP elements
const logoutButton = document.getElementById('logout-button');
const adminCard = document.getElementById('admin-card');
const logoutButtonAdmin = document.getElementById('logout-button-admin');
const conversationList = document.getElementById('conversation-list');
const adminChatWindow = document.getElementById('admin-chat-window');
const adminChatHeading = document.getElementById('admin-chat-heading');
const adminChatForm = document.getElementById('admin-chat-form');
const adminChatMessage = document.getElementById('admin-chat-message');
const adminMoneyAmount = document.getElementById('admin-money-amount');
const adminChatStatus = document.getElementById('admin-chat-status');
const requestCard = document.getElementById('request-card');
const requestForm = document.getElementById('middleman-request-form');
const requestMessageNode = document.getElementById('form-message');
const chatCard = document.getElementById('chat-card');
const chatWindow = document.getElementById('chat-window');
const chatForm = document.getElementById('chat-form');
const chatStatus = document.getElementById('chat-status');
const chatMessage = document.getElementById('chat-message');
const chatNote = document.getElementById('chat-note');
const adminRequestList = document.getElementById('admin-request-list');
const adminRequestStatus = document.getElementById('admin-request-status');
const adminChatUserEmail = document.getElementById('admin-chat-user-email');
const adminParticipantList = document.getElementById('admin-participant-list');
const adminAddParticipantForm = document.getElementById('admin-add-participant-form');
const adminParticipantEmail = document.getElementById('admin-participant-email');
const chatConversationLabel = document.getElementById('chat-conversation-label');
const chatConversationSelect = document.getElementById('chat-conversation-select');

let currentUser = null;
let selectedUserId = null;
let socketConnected = false;
// pendingSignupEmail removed with OTP flow
let currentChatTarget = null; // userId of the conversation currently selected

const socket = io({ autoConnect: false, withCredentials: true });

function showElement(element) {
  element.classList.remove('hidden');
}

function hideElement(element) {
  element.classList.add('hidden');
}

// OTP verification removed

function setActiveToggle(loginActive) {
  if (loginActive) {
    showLoginBtn.classList.add('active');
    showSignupBtn.classList.remove('active');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  } else {
    showLoginBtn.classList.remove('active');
    showSignupBtn.classList.add('active');
    loginForm.classList.add('hidden');
    signupForm.classList.remove('hidden');
  }
}

function renderChatMessage(message) {
  const item = document.createElement('div');
  const classNames = ['chat-entry'];
  const isMoney = message.type === 'money' || message.amount;
  if (isMoney) {
    classNames.push('chat-entry-money-card');
    item.style.color = '#10ff60';
    item.style.fontWeight = '700';
  }
  item.className = classNames.join(' ');

  const amountHtml = isMoney && message.amount ? `
    <div class="chat-money-card">
      <div class="chat-money-label">Transaction</div>
      <div class="chat-money-amount">$${Number(message.amount).toFixed(2)}</div>
    </div>
  ` : '';

  item.innerHTML = `
    <div class="chat-entry-header">
      <span class="chat-author">${message.name}</span>
      <span class="chat-time">${new Date(message.createdAt).toLocaleTimeString()}</span>
    </div>
    ${amountHtml}
    <p>${message.message}</p>
  `;
  if (isMoney) {
    const textNodes = item.querySelectorAll('.chat-entry-header, .chat-entry-header *, p');
    textNodes.forEach((node) => {
      node.style.color = '#1f7a3e';
      node.style.fontWeight = '700';
    });
  }
  chatWindow.appendChild(item);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function renderAdminChatMessage(message) {
  const item = document.createElement('div');
  const classNames = [`chat-entry`, message.sender === 'admin' ? 'chat-entry-admin' : 'chat-entry-customer'];
  if (message.type === 'money') {
    classNames.push('chat-entry-money-card');
  }
  item.className = classNames.join(' ');

  const amountHtml = message.type === 'money' && message.amount ? `
    <div class="chat-money-card">
      <div class="chat-money-label">Transaction</div>
      <div class="chat-money-amount">$${message.amount.toFixed(2)}</div>
    </div>
  ` : '';

  item.innerHTML = `
    <div class="chat-entry-header">
      <span class="chat-author">${message.name}</span>
      <span class="chat-time">${new Date(message.createdAt).toLocaleTimeString()}</span>
    </div>
    ${amountHtml}
    <p>${message.message}</p>
  `;

  adminChatWindow.appendChild(item);
  adminChatWindow.scrollTop = adminChatWindow.scrollHeight;
}

function renderConversationItem(conversation) {
  const button = document.createElement('button');
  button.className = 'conversation-item';
  button.innerHTML = `<strong>${conversation.name}</strong><span>${conversation.email || 'No email'}</span><small>${conversation.messageCount} messages · ${formatRelativeTime(conversation.lastMessageAt)}</small>`;
  button.addEventListener('click', () => selectConversation(conversation.userId, conversation.name));
  if (conversation.userId === selectedUserId) {
    button.classList.add('active');
  }
  return button;
}

function renderRequestItem(request) {
  const item = document.createElement('div');
  item.className = 'conversation-item';
  item.innerHTML = `<strong>${request.name}</strong><span>${request.email}</span><small>${request.createdAt}</small><p>${request.from} → ${request.to} · ${request.amount} ${request.currency}</p><p>${request.details || 'No extra details'}</p>`;
  return item;
}

function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

async function loadAdminConversations() {
  try {
    const response = await fetch('/api/admin/conversations', { credentials: 'include' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to load conversations.');
    }

    conversationList.innerHTML = '';
    result.conversations.forEach((conversation) => conversationList.appendChild(renderConversationItem(conversation)));
  } catch (error) {
    adminChatStatus.textContent = error.message;
    adminChatStatus.classList.add('error');
  }
}

async function loadAdminRequests() {
  try {
    const response = await fetch('/api/requests', { credentials: 'include' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to load requests.');
    }

    adminRequestList.innerHTML = '';
    if (result.requests.length === 0) {
      adminRequestList.innerHTML = '<p>No middleman requests yet.</p>';
      return;
    }

    result.requests.forEach((request) => adminRequestList.appendChild(renderRequestItem(request)));
  } catch (error) {
    adminRequestStatus.textContent = error.message;
    adminRequestStatus.classList.add('error');
  }
}

async function loadMyConversations() {
  try {
    const resp = await fetch('/api/my-conversations', { credentials: 'include' });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || 'Failed to load conversations');
    chatConversationSelect.innerHTML = '';
    // add user's own conversation as default
    const optionOwn = document.createElement('option');
    optionOwn.value = currentUser.id;
    optionOwn.textContent = `${currentUser.name} (Your conversation)`;
    chatConversationSelect.appendChild(optionOwn);

    data.conversations.forEach((conv) => {
      if (conv.userId === currentUser.id) return; // already added
      const opt = document.createElement('option');
      opt.value = conv.userId;
      opt.textContent = `${conv.name} (${conv.email || 'no email'})`;
      chatConversationSelect.appendChild(opt);
    });

    // show select if more than one option
    if (chatConversationSelect.options.length > 1) {
      chatConversationLabel.classList.remove('hidden');
    } else {
      chatConversationLabel.classList.add('hidden');
    }

    // set default
    currentChatTarget = currentUser.id;
    chatConversationSelect.value = currentChatTarget;
    // load messages for current chat
    await loadConversationMessages(currentChatTarget);
  } catch (e) {
    console.error('loadMyConversations failed', e);
  }
}

async function loadConversationMessages(userId) {
  try {
    const response = await fetch(`/api/chats/${userId}`, { credentials: 'include' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to load conversation.');
    chatWindow.innerHTML = '';
    result.messages.forEach(renderChatMessage);
    currentChatTarget = userId;
    chatConversationSelect.value = userId;
  } catch (error) {
    chatStatus.textContent = error.message;
    chatStatus.classList.add('error');
  }
}

function renderParticipantList(participantEmails) {
  adminParticipantList.innerHTML = '';
  if (!participantEmails || participantEmails.length === 0) {
    adminParticipantList.textContent = 'Participants: buyer and seller emails can be added here.';
    return;
  }

  const list = document.createElement('div');
  list.className = 'participant-chips';
  participantEmails.forEach((email) => {
    const chip = document.createElement('span');
    chip.className = 'participant-chip';
    chip.textContent = email;
    list.appendChild(chip);
  });
  adminParticipantList.innerHTML = '';
  adminParticipantList.appendChild(list);
}

async function selectConversation(userId, userName = null) {
  selectedUserId = userId;
  adminChatHeading.textContent = `Conversation with ${userName || 'customer'}`;
  adminChatUserEmail.textContent = '';
  adminChatWindow.innerHTML = '';
  adminChatForm.classList.remove('hidden');
  adminAddParticipantForm.classList.remove('hidden');
  adminParticipantEmail.value = '';
  adminChatStatus.textContent = '';
  // load conversations for this user (their own + participant convos)
  loadMyConversations();

  try {
    const response = await fetch(`/api/admin/chats/${userId}`, { credentials: 'include' });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to load conversation.');
    }

    adminChatWindow.innerHTML = '';
    result.messages.forEach(renderAdminChatMessage);
    adminChatUserEmail.textContent = result.user ? `Email: ${result.user.email}` : '';
    renderParticipantList(result.participantEmails);
    loadAdminConversations();
  } catch (error) {
    adminChatStatus.textContent = error.message;
    adminChatStatus.classList.add('error');
  }
}

socket.on('connect', () => {
  chatStatus.textContent = 'Live chat connected.';
  chatStatus.className = 'message success';
  socketConnected = true;
});

socket.on('disconnect', () => {
  chatStatus.textContent = 'Live chat disconnected. Reconnecting...';
  chatStatus.className = 'message error';
  socketConnected = false;
});

socket.on('connect_error', (error) => {
  chatStatus.textContent = 'Live chat connection failed.';
  chatStatus.className = 'message error';
  console.error('Socket connect error:', error);
});

async function initSocket() {
  if (!socketConnected) {
    socket.connect();
  }

  if (currentUser && !currentUser.isAdmin) {
    chatStatus.textContent = 'Live chat connected.';
    chatStatus.className = 'message success';
  }
}

socket.on('chat:init', (messages) => {
  if (currentUser && currentUser.isAdmin) {
    loadAdminConversations();
    if (selectedUserId) {
      selectConversation(selectedUserId);
    }
    return;
  }

  chatWindow.innerHTML = '';
  messages.forEach(renderChatMessage);
});

chatConversationSelect.addEventListener('change', (e) => {
  const userId = e.target.value;
  loadConversationMessages(userId);
});

socket.on('chat:newMessage', (message) => {
  if (currentUser && currentUser.isAdmin) {
    loadAdminConversations();
    if (message.userId === selectedUserId) {
      renderAdminChatMessage(message);
    }
    return;
  }

  renderChatMessage(message);
});

socket.on('chat:error', (payload) => {
  if (payload && payload.message) {
    if (currentUser && currentUser.isAdmin) {
      adminChatStatus.textContent = payload.message;
      adminChatStatus.className = 'message error';
    } else {
      chatStatus.textContent = payload.message;
      chatStatus.className = 'message error';
    }
  }
});

socket.on('chat:access', (payload) => {
  if (!currentUser || currentUser.isAdmin) return;
  const hasRequest = payload && !!payload.hasRequest;
  if (typeof hasRequest === 'boolean') {
    currentUser.hasRequest = hasRequest;
    setChatAccess(hasRequest);
  }
});

function setChatAccess(hasRequest) {
  if (hasRequest) {
    chatNote.classList.add('hidden');
    chatForm.classList.remove('disabled');
    chatMessage.disabled = false;
    chatForm.querySelector('button').disabled = false;
    chatNote.textContent = '';
  } else {
    chatNote.classList.remove('hidden');
    chatNote.textContent = 'Please fill up the details of the transaction before you are able to send a message to live support.';
    chatForm.classList.add('disabled');
    chatMessage.disabled = true;
    chatForm.querySelector('button').disabled = true;
  }
}

function updateUI(user) {
  currentUser = user;
  if (user) {
    userNameNode.textContent = user.name;
    authMessageNode.textContent = '';
    requestMessageNode.textContent = '';

    if (user.isAdmin) {
      hideElement(authCard);
      hideElement(userCard);
      hideElement(requestCard);
      hideElement(chatCard);
      showElement(adminCard);
      adminChatForm.classList.add('hidden');
      adminChatWindow.innerHTML = '';
      selectedUserId = null;
      loadAdminRequests();
      loadAdminConversations();
      initSocket();
    } else {
      hideElement(adminCard);
      showElement(userCard);
      showElement(requestCard);
      showElement(chatCard);
      hideElement(authCard);
      setChatAccess(user.hasRequest);
      initSocket();
      loadMyConversations();
    }
  } else {
    currentUser = null;
    hideElement(userCard);
    hideElement(requestCard);
    hideElement(chatCard);
    hideElement(adminCard);
    showElement(authCard);
    // OTP removed
    requestForm.reset();
    chatWindow.innerHTML = '';
    setActiveToggle(true);
    if (socketConnected) {
      socket.disconnect();
    }
  }
}

async function fetchCurrentUser() {
  try {
    const response = await fetch('/api/current-user', { credentials: 'include' });
    const result = await response.json();
    updateUI(result.user || null);
  } catch (error) {
    console.error('Failed to check current user', error);
    updateUI(null);
  }
}

showLoginBtn.addEventListener('click', () => setActiveToggle(true));
showSignupBtn.addEventListener('click', () => setActiveToggle(false));

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessageNode.textContent = '';
  authMessageNode.className = 'message';

  const formData = new FormData(loginForm);
  const payload = {
    email: formData.get('email'),
    password: formData.get('password'),
  };

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to log in.');
    }
    updateUI(result.user);
  } catch (error) {
    authMessageNode.textContent = error.message;
    authMessageNode.classList.add('error');
  }
});

signupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authMessageNode.textContent = '';
  authMessageNode.className = 'message';

  const formData = new FormData(signupForm);
  const payload = {
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
  };

  try {
    const response = await fetch('/api/signup', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to create account.');
    }
    // signup now logs the user in directly
    updateUI(result.user);
  } catch (error) {
    authMessageNode.textContent = error.message;
    authMessageNode.classList.add('error');
  }
});
// OTP verification UI removed: signup now signs in immediately

logoutButton.addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (error) {
    console.error('Logout failed', error);
  }
  updateUI(null);
});

logoutButtonAdmin.addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch (error) {
    console.error('Logout failed', error);
  }
  updateUI(null);
});

requestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  requestMessageNode.textContent = '';
  requestMessageNode.className = 'message';

  const formData = new FormData(requestForm);
  const payload = {
    from: formData.get('from'),
    to: formData.get('to'),
    amount: formData.get('amount'),
    currency: formData.get('currency'),
    details: formData.get('details'),
  };

  try {
    const response = await fetch('/api/request-middleman', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to submit request.');
    }

    requestMessageNode.textContent = result.message;
    requestMessageNode.classList.add('success');
    requestForm.reset();
    if (currentUser) {
      currentUser.hasRequest = true;
      setChatAccess(true);
    }
  } catch (error) {
    requestMessageNode.textContent = error.message;
    requestMessageNode.classList.add('error');
  }
});

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  chatStatus.textContent = '';
  chatStatus.className = 'message';

  const message = chatMessage.value.trim();
  const name = userNameNode.textContent || 'Guest';

  if (!message) {
    chatStatus.textContent = 'Please enter a message.';
    chatStatus.classList.add('error');
    return;
  }

  const payload = { name, message };
  if (currentChatTarget) payload.targetUserId = currentChatTarget;
  socket.emit('chat:message', payload);
  chatMessage.value = '';
});

adminAddParticipantForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  adminChatStatus.textContent = '';
  adminChatStatus.className = 'message';

  const email = adminParticipantEmail.value.trim();
  if (!email) {
    adminChatStatus.textContent = 'Please enter a participant email.';
    adminChatStatus.classList.add('error');
    return;
  }

  if (!selectedUserId) {
    adminChatStatus.textContent = 'Select a conversation first.';
    adminChatStatus.classList.add('error');
    return;
  }

  try {
    if (!currentUser || !currentUser.isAdmin) {
      throw new Error('You are not logged in as an admin in this session. Please re-login as admin.');
    }

    const response = await fetch(`/api/admin/conversations/${selectedUserId}/participants`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const contentType = response.headers.get('content-type') || '';
    let result;
    if (contentType.includes('application/json')) {
      result = await response.json();
    } else {
      const text = await response.text();
      throw new Error(text || 'Unexpected non-JSON response from server.');
    }

    if (!response.ok) {
      throw new Error(result.message || 'Unable to add participant.');
    }

    renderParticipantList(result.participantEmails);
    adminParticipantEmail.value = '';
    adminChatStatus.textContent = 'Participant added successfully.';
    adminChatStatus.classList.add('success');
  } catch (error) {
    adminChatStatus.textContent = error.message;
    adminChatStatus.classList.add('error');
  }
});

adminChatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  adminChatStatus.textContent = '';
  adminChatStatus.className = 'message';

  const message = adminChatMessage.value.trim();
  const moneyAmount = adminMoneyAmount.value.trim();
  if (!selectedUserId) {
    adminChatStatus.textContent = 'Select a conversation first.';
    adminChatStatus.classList.add('error');
    return;
  }

  if (!message && !moneyAmount) {
    adminChatStatus.textContent = 'Enter a message or an amount to send.';
    adminChatStatus.classList.add('error');
    return;
  }

  const payload = { targetUserId: selectedUserId };
  if (moneyAmount) {
    const formattedAmount = Number(moneyAmount).toFixed(2);
    payload.moneyAmount = formattedAmount;
    payload.message = message || `Sent $${formattedAmount}`;
    payload.messageType = 'money';
  } else {
    payload.message = message;
  }

  socket.emit('chat:message', payload);
  adminChatStatus.textContent = 'Money send initiated.';
  adminChatStatus.className = 'message success';
  adminChatMessage.value = '';
  adminMoneyAmount.value = '';
});

const adminChatSendMoney = document.getElementById('admin-chat-send-money');
adminChatSendMoney.addEventListener('click', () => {
  adminChatForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});

fetchCurrentUser();
