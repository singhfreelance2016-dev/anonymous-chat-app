// Simple profanity filter module
class ProfanityFilter {
  constructor() {
    // Basic list of offensive words to filter
    // In production, use a more comprehensive list or external service
    this.badWords = [
      'badword1', 'badword2', 'badword3', // Replace with actual words
      'profanity', 'curse', 'swear', 
      'offensive', 'inappropriate'
    ];
  }

  // Filter profanity from text
  filter(text) {
    if (!text || typeof text !== 'string') return text;
    
    let filtered = text;
    this.badWords.forEach(word => {
      // Case-insensitive replacement with asterisks
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    
    return filtered;
  }

  // Check if text contains profanity
  containsProfanity(text) {
    if (!text || typeof text !== 'string') return false;
    
    const lowerText = text.toLowerCase();
    return this.badWords.some(word => lowerText.includes(word.toLowerCase()));
  }
}

module.exports = new ProfanityFilter();