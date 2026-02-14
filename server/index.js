// Main server entry point - handles WebSocket connections, HTTP server, and core logic
require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const matching = require('./matching');
const profanity = require('./profanity');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Store connected clients with their metadata
const clients = new Map(); // ws => { id, status, partner, lastMessageTime }

// Rate limiting configuration
const RATE_LIMIT = {
  MESSAGES_PER_MINUTE: 30,
  windowMs: 60 * 1000,
  messageCounts: new Map() // ws => { count, resetTime }
};

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../client')));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    connections: clients.size,
    waiting: matching.getWaitingCount()
  });
});

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New client connected');
  
  // Initialize client data
  const clientId = generateClientId();
  clients.set(ws, {
    id: clientId,
    status: 'disconnected',
    partner: null,
    lastMessageTime: Date.now()
  });

  // Send welcome message with assigned ID
  ws.send(JSON.stringify({
    type: 'welcome',
    clientId: clientId,
    message: 'Connected to anonymous chat server'
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      handleMessage(ws, message);
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid message format'
      }));
    }
  });

  // Handle disconnection
  ws.on('close', () => {
    handleDisconnect(ws);
  });

  // Handle errors
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    handleDisconnect(ws);
  });
});

// Message handler
function handleMessage(ws, message) {
  const client = clients.get(ws);
  if (!client) return;

  switch (message.type) {
    case 'find_partner':
      handleFindPartner(ws);
      break;
      
    case 'message':
      handleChatMessage(ws, message.content);
      break;
      
    case 'typing':
      handleTypingIndicator(ws, message.isTyping);
      break;
      
    case 'disconnect':
      handleUserDisconnect(ws);
      break;
      
    case 'report':
      handleReport(ws, message.reason);
      break;
      
    default:
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Unknown message type'
      }));
  }
}

// Find a random partner
function handleFindPartner(ws) {
  const client = clients.get(ws);
  
  // Check if already in a chat
  if (client.status === 'chatting') {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'You are already in a chat'
    }));
    return;
  }

  // Add to waiting queue
  client.status = 'waiting';
  matching.addToQueue(ws, client.id);
  
  ws.send(JSON.stringify({
    type: 'status',
    status: 'waiting',
    message: 'Looking for a partner...'
  }));

  // Try to find a match
  const match = matching.findMatch(ws);
  if (match) {
    establishConnection(ws, match);
  }
}

// Establish connection between two clients
function establishConnection(ws1, ws2) {
  const client1 = clients.get(ws1);
  const client2 = clients.get(ws2);
  
  if (!client1 || !client2) return;
  
  // Update status for both clients
  client1.status = 'chatting';
  client1.partner = ws2;
  client2.status = 'chatting';
  client2.partner = ws1;
  
  // Generate random names for anonymity
  const name1 = generateRandomName();
  const name2 = generateRandomName();
  
  client1.displayName = name1;
  client2.displayName = name2;
  
  // Notify both clients
  ws1.send(JSON.stringify({
    type: 'matched',
    partnerId: client2.id,
    yourName: name1,
    partnerName: name2,
    message: 'You are now connected with a stranger'
  }));
  
  ws2.send(JSON.stringify({
    type: 'matched',
    partnerId: client1.id,
    yourName: name2,
    partnerName: name1,
    message: 'You are now connected with a stranger'
  }));
}

// Handle chat messages
function handleChatMessage(ws, content) {
  const client = clients.get(ws);
  
  // Check if in a chat
  if (client.status !== 'chatting' || !client.partner) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'You are not connected to anyone'
    }));
    return;
  }
  
  // Rate limiting check
  if (!checkRateLimit(ws)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'Rate limit exceeded. Please slow down.'
    }));
    return;
  }
  
  // Basic profanity filtering
  const filteredContent = profanity.filter(content);
  
  // Send message to partner
  const partner = client.partner;
  if (partner && partner.readyState === WebSocket.OPEN) {
    partner.send(JSON.stringify({
      type: 'message',
      content: filteredContent,
      sender: client.displayName || 'Stranger',
      timestamp: new Date().toISOString()
    }));
  }
  
  // Update last message time
  client.lastMessageTime = Date.now();
}

// Handle typing indicators
function handleTypingIndicator(ws, isTyping) {
  const client = clients.get(ws);
  
  if (client.status === 'chatting' && client.partner) {
    const partner = client.partner;
    if (partner.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({
        type: 'typing',
        isTyping: isTyping
      }));
    }
  }
}

// Handle user-initiated disconnect
function handleUserDisconnect(ws) {
  const client = clients.get(ws);
  
  if (client.status === 'chatting' && client.partner) {
    // Notify partner
    const partner = client.partner;
    if (partner.readyState === WebSocket.OPEN) {
      partner.send(JSON.stringify({
        type: 'partner_disconnected',
        message: 'Your partner has disconnected'
      }));
    }
    
    // Update partner's status
    const partnerClient = clients.get(partner);
    if (partnerClient) {
      partnerClient.status = 'disconnected';
      partnerClient.partner = null;
    }
  }
  
  // Remove from matching queue if waiting
  if (client.status === 'waiting') {
    matching.removeFromQueue(ws);
  }
  
  // Reset client status
  client.status = 'disconnected';
  client.partner = null;
  
  ws.send(JSON.stringify({
    type: 'status',
    status: 'disconnected',
    message: 'You have been disconnected'
  }));
}

// Handle WebSocket disconnection
function handleDisconnect(ws) {
  const client = clients.get(ws);
  
  if (client) {
    // Notify partner if in a chat
    if (client.status === 'chatting' && client.partner) {
      const partner = client.partner;
      if (partner.readyState === WebSocket.OPEN) {
        partner.send(JSON.stringify({
          type: 'partner_disconnected',
          message: 'Your partner has disconnected'
        }));
      }
      
      // Update partner's status
      const partnerClient = clients.get(partner);
      if (partnerClient) {
        partnerClient.status = 'disconnected';
        partnerClient.partner = null;
      }
    }
    
    // Remove from queue if waiting
    if (client.status === 'waiting') {
      matching.removeFromQueue(ws);
    }
    
    // Clean up rate limit data
    RATE_LIMIT.messageCounts.delete(ws);
    
    // Remove client
    clients.delete(ws);
  }
  
  console.log('Client disconnected');
}

// Handle report (stub implementation)
function handleReport(ws, reason) {
  const client = clients.get(ws);
  
  // In a production app, you would store this in a database
  console.log(`Report from ${client.id}: ${reason}`);
  
  // For now, just acknowledge
  ws.send(JSON.stringify({
    type: 'report_received',
    message: 'Thank you for your report. We take these matters seriously.'
  }));
  
  // Optionally disconnect both users
  if (client.status === 'chatting' && client.partner) {
    handleUserDisconnect(ws);
  }
}

// Rate limiting check
function checkRateLimit(ws) {
  const now = Date.now();
  const limit = RATE_LIMIT.messageCounts.get(ws);
  
  if (!limit) {
    RATE_LIMIT.messageCounts.set(ws, {
      count: 1,
      resetTime: now + RATE_LIMIT.windowMs
    });
    return true;
  }
  
  if (now > limit.resetTime) {
    // Reset the counter
    limit.count = 1;
    limit.resetTime = now + RATE_LIMIT.windowMs;
    return true;
  }
  
  if (limit.count >= RATE_LIMIT.MESSAGES_PER_MINUTE) {
    return false;
  }
  
  limit.count++;
  return true;
}

// Generate a random client ID
function generateClientId() {
  return 'client_' + Math.random().toString(36).substr(2, 9);
}

// Generate a random anonymous name
function generateRandomName() {
  const adjectives = ['Happy', 'Sleepy', 'Grumpy', 'Sneezy', 'Bashful', 'Dopey', 'Doc', 'Clever', 'Brave', 'Swift'];
  const nouns = ['Panda', 'Tiger', 'Eagle', 'Dolphin', 'Wolf', 'Fox', 'Bear', 'Hawk', 'Owl', 'Lion'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  
  return `${adj}${noun}${num}`;
}

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server available at ws://localhost:${PORT}`);
});