const API_BASE = 'http://localhost:8000';

let currentSessionId = null;

document.addEventListener('DOMContentLoaded', () => {
    initChat();
    document.getElementById('new-chat').addEventListener('click', newChat);
    document.getElementById('send-button').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
});

async function initChat() {
    await newChat();
}

async function newChat() {
    try {
        const response = await fetch(`${API_BASE}/chat/session`, { method: 'POST' });
        const data = await response.json();
        currentSessionId = data.session_id;
        document.getElementById('messages').innerHTML = '';
        loadChatHistory();
    } catch (error) {
        console.error('Error creating new chat:', error);
    }
}

async function loadChatHistory() {
    if (!currentSessionId) return;
    try {
        const response = await fetch(`${API_BASE}/chat/history/${currentSessionId}`);
        const data = await response.json();
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = '';
        data.history.forEach(msg => {
            addMessage(msg.role, msg.content);
        });
    } catch (error) {
        console.error('Error loading chat history:', error);
    }
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    if (!message || !currentSessionId) return;

    addMessage('user', message);
    input.value = '';

    try {
        const response = await fetch(`${API_BASE}/chat/query?session_id=${currentSessionId}&q=${encodeURIComponent(message)}`);
        const data = await response.json();
        addMessage('assistant', data.answer);
    } catch (error) {
        addMessage('assistant', 'Error: ' + error.message);
    }
}

function addMessage(role, content) {
    const messagesDiv = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    messageDiv.textContent = content;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}