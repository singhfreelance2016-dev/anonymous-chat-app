// Client-side JavaScript for anonymous chat

class ChatClient {
    constructor() {
        this.ws = null;
        this.clientId = null;
        this.partnerName = null;
        this.myName = null;
        this.isConnected = false;
        this.isTyping = false;
        this.typingTimeout = null;
        
        // DOM elements
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusText = document.getElementById('statusText');
        this.connectionInfo = document.getElementById('connectionInfo');
        this.findBtn = document.getElementById('findBtn');
        this.disconnectBtn = document.getElementById('disconnectBtn');
        this.nextBtn = document.getElementById('nextBtn');
        this.reportBtn = document.getElementById('reportBtn');
        this.messageInput = document.getElementById('messageInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.messagesDiv = document.getElementById('messages');
        self.partnerNameSpan = document.getElementById('partnerName');
        this.typingIndicator = document.getElementById('typingIndicator');
        this.typingText = document.getElementById('typingText');
        
        // Bind methods
        this.handleFindPartner = this.handleFindPartner.bind(this);
        this.handleDisconnect = this.handleDisconnect.bind(this);
        this.handleNext = this.handleNext.bind(this);
        this.handleReport = this.handleReport.bind(this);
        this.handleSendMessage = this.handleSendMessage.bind(this);
        this.handleTyping = this.handleTyping.bind(this);
        this.handleKeyPress = this.handleKeyPress.bind(this);
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Connect to server
        this.connect();
    }
    
    initEventListeners() {
        this.findBtn.addEventListener('click', this.handleFindPartner);
        this.disconnectBtn.addEventListener('click', this.handleDisconnect);
        this.nextBtn.addEventListener('click', this.handleNext);
        this.reportBtn.addEventListener('click', this.handleReport);
        this.sendBtn.addEventListener('click', this.handleSendMessage);
        this.messageInput.addEventListener('input', this.handleTyping);
        this.messageInput.addEventListener('keypress', this.handleKeyPress);
    }
    
    connect() {
        // Determine WebSocket URL - CHANGE THIS FOR PRODUCTION
        // For local development:
        const wsUrl = 'ws://localhost:3000';
        // For production, change to: wss://your-domain.com
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to server');
            this.updateStatus('connected', 'Connected');
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from server');
            this.handleServerDisconnect();
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.addSystemMessage('Connection error. Please refresh the page.');
        };
    }
    
    handleServerMessage(data) {
        switch (data.type) {
            case 'welcome':
                this.clientId = data.clientId;
                this.connectionInfo.textContent = `ID: ${this.clientId}`;
                break;
                
            case 'status':
                this.updateStatus(data.status, data.message);
                break;
                
            case 'matched':
                this.handleMatch(data);
                break;
                
            case 'message':
                this.receiveMessage(data);
                break;
                
            case 'typing':
                this.handlePartnerTyping(data.isTyping);
                break;
                
            case 'partner_disconnected':
                this.handlePartnerDisconnect(data.message);
                break;
                
            case 'error':
                this.addSystemMessage(`Error: ${data.message}`);
                break;
                
            case 'report_received':
                this.addSystemMessage(data.message);
                break;
                
            default:
                console.log('Unknown message type:', data);
        }
    }
    
    handleMatch(data) {
        this.partnerName = data.partnerName;
        this.myName = data.yourName;
        this.partnerNameSpan.textContent = `Chatting with: ${this.partnerName}`;
        
        this.updateStatus('chatting', 'Connected');
        this.enableChatControls(true);
        
        this.addSystemMessage(`You are now connected with ${this.partnerName}`);
        this.addSystemMessage(`Your anonymous name is: ${this.myName}`);
    }
    
    handleFindPartner() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'find_partner'
            }));
            
            this.updateStatus('waiting', 'Looking for a partner...');
            this.findBtn.disabled = true;
            this.disconnectBtn.disabled = false;
            this.clearChat();
            this.addSystemMessage('Looking for a random partner...');
        }
    }
    
    handleDisconnect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'disconnect'
            }));
        }
        
        this.resetChat();
    }
    
    handleNext() {
        this.handleDisconnect();
        setTimeout(() => {
            this.handleFindPartner();
        }, 500);
    }
    
    handleReport() {
        if (!this.partnerName) {
            this.addSystemMessage('You are not connected to anyone.');
            return;
        }
        
        const reason = prompt('Please describe the issue (optional):');
        if (reason !== null) { // User didn't cancel
            this.ws.send(JSON.stringify({
                type: 'report',
                reason: reason || 'No reason provided'
            }));
        }
    }
    
    handleSendMessage() {
        const content = this.messageInput.value.trim();
        if (!content || !this.partnerName) return;
        
        this.ws.send(JSON.stringify({
            type: 'message',
            content: content
        }));
        
        // Display own message
        this.displayMessage(content, 'sent', this.myName);
        
        // Clear input
        this.messageInput.value = '';
        
        // Reset typing indicator
        if (this.isTyping) {
            this.isTyping = false;
            this.ws.send(JSON.stringify({
                type: 'typing',
                isTyping: false
            }));
        }
    }
    
    handleTyping() {
        if (!this.partnerName) return;
        
        if (!this.isTyping && this.messageInput.value.length > 0) {
            this.isTyping = true;
            this.ws.send(JSON.stringify({
                type: 'typing',
                isTyping: true
            }));
        }
        
        // Clear previous timeout
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
        
        // Set new timeout
        this.typingTimeout = setTimeout(() => {
            if (this.isTyping) {
                this.isTyping = false;
                this.ws.send(JSON.stringify({
                    type: 'typing',
                    isTyping: false
                }));
            }
        }, 1000);
    }
    
    handleKeyPress(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSendMessage();
        }
    }
    
    handlePartnerTyping(isTyping) {
        if (isTyping) {
            this.typingText.textContent = `${this.partnerName} is typing...`;
            this.typingIndicator.style.display = 'block';
        } else {
            this.typingIndicator.style.display = 'none';
        }
    }
    
    handlePartnerDisconnect(message) {
        this.addSystemMessage(message || 'Your partner has disconnected');
        this.resetChat();
    }
    
    handleServerDisconnect() {
        this.updateStatus('disconnected', 'Disconnected');
        this.resetChat();
        this.addSystemMessage('Disconnected from server. Please refresh the page.');
    }
    
    receiveMessage(data) {
        this.displayMessage(data.content, 'received', data.sender);
    }
    
    displayMessage(content, type, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}`;
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        contentDiv.textContent = content;
        
        const infoDiv = document.createElement('div');
        infoDiv.className = 'message-info';
        infoDiv.textContent = `${sender} • ${new Date().toLocaleTimeString()}`;
        
        messageDiv.appendChild(contentDiv);
        messageDiv.appendChild(infoDiv);
        
        this.messagesDiv.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    addSystemMessage(text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'system-message';
        messageDiv.textContent = text;
        this.messagesDiv.appendChild(messageDiv);
        this.scrollToBottom();
    }
    
    clearChat() {
        this.messagesDiv.innerHTML = '';
    }
    
    scrollToBottom() {
        this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
    }
    
    updateStatus(status, message) {
        // Update status indicator
        this.statusIndicator.className = 'status-indicator';
        if (status !== 'disconnected') {
            this.statusIndicator.classList.add(status);
        }
        
        // Update status text
        this.statusText.textContent = message;
        
        // Update connection state
        this.isConnected = status === 'chatting' || status === 'waiting';
    }
    
    enableChatControls(enabled) {
        this.messageInput.disabled = !enabled;
        this.sendBtn.disabled = !enabled;
        this.reportBtn.disabled = !enabled;
        this.disconnectBtn.disabled = !enabled;
        this.nextBtn.disabled = !enabled;
        
        if (enabled) {
            this.messageInput.focus();
        }
    }
    
    resetChat() {
        this.partnerName = null;
        this.myName = null;
        this.partnerNameSpan.textContent = 'Not connected';
        this.enableChatControls(false);
        this.findBtn.disabled = false;
        this.typingIndicator.style.display = 'none';
        
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
        }
    }
}

// Initialize the chat client when page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatClient();
});