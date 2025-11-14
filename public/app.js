// State Management
const state = {
    ws: null,
    currentSessionId: null,
    reconnectAttempts: 0,
    maxReconnectAttempts: 5
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeWebSocket();
    loadStats();
    loadSessions();
    loadJobs();
    setupEventListeners();
});

// WebSocket Connection
function initializeWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        state.reconnectAttempts = 0;
        showToast('Connected to server', 'success');
    };

    state.ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    };

    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };

    state.ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        attemptReconnect();
    };
}

function attemptReconnect() {
    if (state.reconnectAttempts < state.maxReconnectAttempts) {
        state.reconnectAttempts++;
        const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
        console.log(`Reconnecting in ${delay}ms... (attempt ${state.reconnectAttempts})`);
        setTimeout(() => initializeWebSocket(), delay);
    } else {
        showToast('Failed to reconnect. Please refresh the page.', 'error');
    }
}

function handleWebSocketMessage(message) {
    console.log('WebSocket message:', message);

    switch (message.type) {
        case 'connected':
            console.log('Server acknowledged connection');
            break;

        case 'conversation_updated':
            if (state.currentSessionId === message.sessionId) {
                loadConversations(message.sessionId);
            }
            loadSessions();
            loadStats();
            showToast('Conversation updated', 'info');
            break;

        case 'conversation_cleared':
            if (state.currentSessionId === message.sessionId) {
                loadConversations(message.sessionId);
            }
            loadSessions();
            showToast('Conversation cleared', 'info');
            break;

        case 'job_updated':
        case 'job_cancelled':
            loadJobs();
            loadStats();
            showToast(`Job ${message.status}`, 'info');
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

function updateConnectionStatus(connected) {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');

    if (connected) {
        indicator.className = 'status-indicator connected';
        text.textContent = 'Connected';
    } else {
        indicator.className = 'status-indicator disconnected';
        text.textContent = 'Disconnected';
    }
}

// API Calls
async function apiCall(endpoint, options = {}) {
    try {
        const response = await fetch(`/api${endpoint}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'API call failed');
        }

        return data.data;
    } catch (error) {
        console.error(`API call failed for ${endpoint}:`, error);
        showToast(`Failed to ${endpoint}: ${error.message}`, 'error');
        throw error;
    }
}

// Load Stats
async function loadStats() {
    try {
        const stats = await apiCall('/stats');

        document.getElementById('total-jobs').textContent = stats.totalJobs;
        document.getElementById('completed-jobs').textContent = stats.completedJobs;
        document.getElementById('running-jobs').textContent = stats.runningJobs;
        document.getElementById('total-conversations').textContent = stats.totalConversations;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Load Sessions
async function loadSessions() {
    try {
        const sessions = await apiCall('/sessions');
        const container = document.getElementById('sessions-list');

        if (!sessions || sessions.length === 0) {
            container.innerHTML = '<p class="empty-state">No sessions found</p>';
            return;
        }

        container.innerHTML = sessions.map(session => `
            <div class="session-item ${state.currentSessionId === session.session_id ? 'active' : ''}"
                 data-session-id="${session.session_id}"
                 onclick="selectSession('${session.session_id}')">
                <div class="session-id">${truncateText(session.session_id, 20)}</div>
                <div class="session-date">${formatDate(session.last_updated)}</div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

// Load Conversations
async function loadConversations(sessionId) {
    try {
        const conversations = await apiCall(`/conversations?session_id=${sessionId}`);
        const container = document.getElementById('conversations-container');
        const clearBtn = document.getElementById('clear-conversation');

        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<p class="empty-state">No messages in this conversation</p>';
            clearBtn.disabled = true;
            return;
        }

        clearBtn.disabled = false;

        container.innerHTML = conversations.map(msg => `
            <div class="message">
                <div class="message-header">
                    <span class="message-role ${msg.role}">${msg.role}</span>
                    <span class="message-timestamp">${formatDate(msg.timestamp)}</span>
                </div>
                <div class="message-content">${escapeHtml(msg.content)}</div>
            </div>
        `).join('');

        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    } catch (error) {
        console.error('Failed to load conversations:', error);
    }
}

// Load Jobs
async function loadJobs() {
    try {
        const jobs = await apiCall('/jobs');
        const container = document.getElementById('jobs-list');

        if (!jobs || jobs.length === 0) {
            container.innerHTML = '<p class="empty-state">No jobs found</p>';
            return;
        }

        // Sort by created_at descending
        jobs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        container.innerHTML = jobs.map(job => {
            const results = job.results ? JSON.parse(job.results) : null;
            const resultCount = results && results.results ? results.results.length : 0;

            return `
                <div class="job-item ${job.status}">
                    <div class="job-header">
                        <div class="job-id">${truncateText(job.id, 12)}</div>
                        <span class="job-status ${job.status}">${job.status}</span>
                    </div>
                    <div class="job-question">${escapeHtml(job.question)}</div>
                    ${resultCount > 0 ? `
                        <div class="job-results">
                            ${resultCount} model response(s)
                        </div>
                    ` : ''}
                    <div class="job-time">
                        Created: ${formatDate(job.created_at)}
                        ${job.completed_at ? `<br>Completed: ${formatDate(job.completed_at)}` : ''}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        console.error('Failed to load jobs:', error);
    }
}

// Select Session
function selectSession(sessionId) {
    state.currentSessionId = sessionId;
    loadConversations(sessionId);

    // Update active state
    document.querySelectorAll('.session-item').forEach(item => {
        item.classList.toggle('active', item.dataset.sessionId === sessionId);
    });
}

// Clear Conversation
async function clearConversation() {
    if (!state.currentSessionId) return;

    if (!confirm('Are you sure you want to clear this conversation?')) {
        return;
    }

    try {
        await apiCall(`/conversations/${state.currentSessionId}`, {
            method: 'DELETE'
        });

        loadConversations(state.currentSessionId);
        loadSessions();
        loadStats();
        showToast('Conversation cleared successfully', 'success');
    } catch (error) {
        console.error('Failed to clear conversation:', error);
    }
}

// Event Listeners
function setupEventListeners() {
    document.getElementById('refresh-sessions').addEventListener('click', () => {
        loadSessions();
        showToast('Sessions refreshed', 'info');
    });

    document.getElementById('refresh-conversations').addEventListener('click', () => {
        if (state.currentSessionId) {
            loadConversations(state.currentSessionId);
            showToast('Conversations refreshed', 'info');
        }
    });

    document.getElementById('refresh-jobs').addEventListener('click', () => {
        loadJobs();
        loadStats();
        showToast('Jobs refreshed', 'info');
    });

    document.getElementById('clear-conversation').addEventListener('click', clearConversation);
}

// Utility Functions
function formatDate(timestamp) {
    if (!timestamp) return 'N/A';

    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // Less than 1 minute
    if (diff < 60000) {
        return 'Just now';
    }

    // Less than 1 hour
    if (diff < 3600000) {
        const minutes = Math.floor(diff / 60000);
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }

    // Less than 24 hours
    if (diff < 86400000) {
        const hours = Math.floor(diff / 3600000);
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }

    // Format as date
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Auto-refresh every 30 seconds
setInterval(() => {
    loadStats();
    loadJobs();
    if (state.currentSessionId) {
        loadConversations(state.currentSessionId);
    }
}, 30000);
