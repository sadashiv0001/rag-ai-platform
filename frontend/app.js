const API_BASE = 'http://localhost:8000';

let currentSessionId = null;

window.addEventListener('DOMContentLoaded', () => {
    initChat();
    document.getElementById('new-chat').addEventListener('click', newChat);
    document.getElementById('send-button').addEventListener('click', () => sendMessage());
    document.getElementById('upload-button').addEventListener('click', uploadFiles);
    document.getElementById('message-input').addEventListener('keydown', handleKeyDown);
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
        updateStatus('New chat started. Upload documents to improve answers.');
    } catch (error) {
        console.error('Error creating new chat:', error);
        updateStatus('Unable to start chat. Please try again.');
    }
}

async function uploadFiles() {
    const files = document.getElementById('file-input').files;
    if (files.length === 0) {
        updateStatus('Select at least one supported file to upload.');
        return;
    }

    const formData = new FormData();
    for (const file of files) {
        formData.append('files', file);
    }

    try {
        const response = await fetch(`${API_BASE}/ingest`, {
            method: 'POST',
            body: formData,
        });
        const result = await response.json();
        if (result.doc_ids) {
            updateStatus(`Uploaded ${result.doc_ids.length} documents successfully.`);
        } else {
            updateStatus('Upload completed, but no documents were ingested.');
        }
    } catch (error) {
        updateStatus('Upload failed: ' + error.message);
    }
}

function handleKeyDown(event) {
    const input = document.getElementById('message-input');
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
    }
}

async function sendMessage(message = null) {
    const input = document.getElementById('message-input');
    const text = message || input.value.trim();
    if (!text || !currentSessionId) return;

    addMessage('user', text, true);
    input.value = '';

    try {
        const response = await fetch(`${API_BASE}/chat/query?session_id=${currentSessionId}&q=${encodeURIComponent(text)}`);
        const data = await response.json();
        addMessage('assistant', data.answer || 'No answer returned.');
    } catch (error) {
        addMessage('assistant', 'Error: ' + error.message);
    }
}

function addMessage(role, content, editable = false) {
    const messagesDiv = document.getElementById('messages');
    const wrapper = document.createElement('div');
    wrapper.className = `message ${role}`;

    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    renderMessageContent(contentElement, content);
    wrapper.appendChild(contentElement);

    const actions = document.createElement('div');
    actions.className = 'message-actions';

    if (role === 'assistant') {
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.textContent = 'Copy';
        copyButton.addEventListener('click', () => copyResponse(content));
        actions.appendChild(copyButton);
    }

    if (role === 'user' && editable) {
        const editButton = document.createElement('button');
        editButton.className = 'edit-button';
        editButton.textContent = 'Edit';
        editButton.addEventListener('click', () => editRequest(content));
        actions.appendChild(editButton);
    }

    if (actions.children.length > 0) {
        wrapper.appendChild(actions);
    }

    messagesDiv.appendChild(wrapper);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function renderMessageContent(container, content) {
    const codeBlockRegex = /```([\s\S]*?)```/g;
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        const textBefore = content.slice(lastIndex, match.index).trim();
        if (textBefore) {
            const textElement = document.createElement('div');
            textElement.textContent = textBefore;
            container.appendChild(textElement);
        }

        const codeWrapper = document.createElement('pre');
        codeWrapper.className = 'code-block';
        const codeElement = document.createElement('code');
        codeElement.textContent = match[1].trim();
        codeWrapper.appendChild(codeElement);
        container.appendChild(codeWrapper);

        lastIndex = match.index + match[0].length;
    }

    const remaining = content.slice(lastIndex).trim();
    if (remaining) {
        const textElement = document.createElement('div');
        textElement.textContent = remaining;
        container.appendChild(textElement);
    }
}

function copyResponse(text) {
    navigator.clipboard.writeText(text).then(() => {
        updateStatus('Response copied to clipboard.');
    }).catch(() => {
        updateStatus('Copy failed. Please try again.');
    });
}

function editRequest(text) {
    const input = document.getElementById('message-input');
    input.value = text;
    input.focus();
}

function updateStatus(message) {
    document.getElementById('upload-status').textContent = message;
}
