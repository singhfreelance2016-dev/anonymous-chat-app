// Matching queue management module
class MatchingQueue {
  constructor() {
    this.waitingQueue = []; // Array of WebSocket connections waiting for partners
  }

  // Add a client to the waiting queue
  addToQueue(ws, clientId) {
    // Check if already in queue
    if (!this.waitingQueue.some(item => item.ws === ws)) {
      this.waitingQueue.push({ ws, clientId, joinedAt: Date.now() });
      console.log(`Client ${clientId} added to queue. Queue size: ${this.waitingQueue.length}`);
    }
  }

  // Remove a client from the waiting queue
  removeFromQueue(ws) {
    const index = this.waitingQueue.findIndex(item => item.ws === ws);
    if (index !== -1) {
      this.waitingQueue.splice(index, 1);
      console.log(`Client removed from queue. Queue size: ${this.waitingQueue.length}`);
      return true;
    }
    return false;
  }

  // Find a match for a client
  findMatch(ws) {
    // Find the client in queue
    const clientIndex = this.waitingQueue.findIndex(item => item.ws === ws);
    if (clientIndex === -1) return null;

    // Look for another client in queue (not the same one)
    for (let i = 0; i < this.waitingQueue.length; i++) {
      if (i !== clientIndex) {
        const match = this.waitingQueue[i];
        // Remove both from queue
        this.waitingQueue.splice(i, 1);
        this.waitingQueue.splice(clientIndex > i ? clientIndex - 1 : clientIndex, 1);
        return match.ws;
      }
    }

    return null;
  }

  // Get number of waiting clients
  getWaitingCount() {
    return this.waitingQueue.length;
  }

  // Clear stale connections from queue (older than 5 minutes)
  cleanStaleConnections() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes
    
    this.waitingQueue = this.waitingQueue.filter(item => {
      const isStale = (now - item.joinedAt) > staleThreshold;
      if (isStale) {
        console.log(`Removing stale connection: ${item.clientId}`);
        // Notify the client
        try {
          item.ws.send(JSON.stringify({
            type: 'status',
            status: 'timeout',
            message: 'Search timed out. Please try again.'
          }));
        } catch (e) {
          // Client might be disconnected
        }
      }
      return !isStale;
    });
  }
}

// Export a singleton instance
module.exports = new MatchingQueue();