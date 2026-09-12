/**
 * Context turn expander and thread viewer.
 * Provides ±N surrounding dialogue turns and full conversation threads.
 */

export class ContextExpander {
  /**
   * @param {Array<object>} orderedMessages Chronologically ordered messages
   */
  constructor(orderedMessages) {
    this.messages = orderedMessages;
    this.byId = new Map();
    this.byConversation = new Map();

    for (let i = 0; i < orderedMessages.length; i++) {
      const m = orderedMessages[i];
      this.byId.set(m.id, { msg: m, index: i });

      const convId = m.conversation_id || 'general';
      let list = this.byConversation.get(convId);
      if (!list) {
        list = [];
        this.byConversation.set(convId, list);
      }
      list.push(m);
    }
  }

  /**
   * Retrieve window of ±N surrounding messages.
   * @param {string} messageId 
   * @param {number} window 
   * @returns {{ contextMessages: Array<object>, matchIndex: number }}
   */
  getContext(messageId, window = 3) {
    const entry = this.byId.get(messageId);
    if (!entry) {
      return { contextMessages: [], matchIndex: -1 };
    }

    const idx = entry.index;
    const targetMsg = entry.msg;
    const convId = targetMsg.conversation_id;

    // Prefer surrounding messages from the same conversation if possible,
    // otherwise general chronological slice
    const startIdx = Math.max(0, idx - window);
    const endIdx = Math.min(this.messages.length - 1, idx + window);

    const slice = this.messages.slice(startIdx, endIdx + 1);
    const matchIndex = slice.findIndex(m => m.id === messageId);

    const contextMessages = slice.map((m, i) => ({
      id: m.id,
      sender: m.sender,
      timestamp: m.timestamp,
      text: m.text,
      isMatch: i === matchIndex
    }));

    return { contextMessages, matchIndex };
  }

  /**
   * Retrieve full conversation thread.
   * @param {string} conversationId 
   * @param {number} limit 
   * @returns {Array<object>}
   */
  getThread(conversationId, limit = 100) {
    const list = this.byConversation.get(conversationId) || [];
    return list.slice(0, limit);
  }
}
