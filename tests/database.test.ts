import { ConversationDatabase } from '../src/database';

describe('ConversationDatabase', () => {
  let db: ConversationDatabase;

  beforeEach(() => {
    // Use in-memory database for tests
    db = new ConversationDatabase(':memory:');
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  test('should save and retrieve a single message', () => {
    db.saveMessage('session1', 0, 'user', 'Hello', undefined, undefined);
    const messages = db.loadSessionHistory('session1');
    
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Hello');
    expect(messages[0].role).toBe('user');
  });

  test('should save and retrieve multiple messages', () => {
    db.saveMessage('session1', 0, 'user', 'Hello');
    db.saveMessage('session1', 1, 'assistant', 'Hi there', 'gemma3:1b');
    db.saveMessage('session1', 2, 'user', 'How are you?');
    
    const messages = db.loadSessionHistory('session1');
    expect(messages).toHaveLength(3);
    expect(messages[0].content).toBe('Hello');
    expect(messages[1].content).toBe('Hi there');
    expect(messages[2].content).toBe('How are you?');
  });

  test('should save and retrieve thinking text', () => {
    const thinkingContent = 'Step 1: Understand the problem\nStep 2: Think of solutions';
    db.saveMessage('session1', 0, 'user', 'What is 2+2?');
    db.saveMessage('session1', 1, 'assistant', 'The answer is 4', 'llama3.2:1b', thinkingContent);
    
    const messages = db.loadSessionHistory('session1');
    expect(messages[1].thinking_text).toBe(thinkingContent);
  });

  test('should handle multiple sessions independently', () => {
    db.saveMessage('session1', 0, 'user', 'Session 1 message');
    db.saveMessage('session2', 0, 'user', 'Session 2 message');
    
    const messages1 = db.loadSessionHistory('session1');
    const messages2 = db.loadSessionHistory('session2');
    
    expect(messages1).toHaveLength(1);
    expect(messages2).toHaveLength(1);
    expect(messages1[0].content).toBe('Session 1 message');
    expect(messages2[0].content).toBe('Session 2 message');
  });

  test('should get all session IDs', () => {
    db.saveMessage('session1', 0, 'user', 'Message');
    db.saveMessage('session2', 0, 'user', 'Message');
    db.saveMessage('session3', 0, 'user', 'Message');
    
    const sessions = db.getAllSessions();
    expect(sessions).toHaveLength(3);
    expect(sessions).toContain('session1');
    expect(sessions).toContain('session2');
    expect(sessions).toContain('session3');
  });

  test('should get session metadata', () => {
    db.saveMessage('session1', 0, 'user', 'Message 1');
    db.saveMessage('session1', 1, 'assistant', 'Response 1', 'gemma3:1b');
    
    const metadata = db.getSessionMetadata('session1');
    expect(metadata).toBeDefined();
    expect(metadata.message_count).toBe(2);
    expect(metadata.session_id).toBe('session1');
  });

  test('should delete a session', () => {
    db.saveMessage('session1', 0, 'user', 'Message');
    db.deleteSession('session1');
    
    const messages = db.loadSessionHistory('session1');
    expect(messages).toHaveLength(0);
    
    const sessions = db.getAllSessions();
    expect(sessions).not.toContain('session1');
  });

  test('should get database statistics', () => {
    db.saveMessage('session1', 0, 'user', 'Message 1');
    db.saveMessage('session1', 1, 'assistant', 'Response 1', 'gemma3:1b');
    db.saveMessage('session2', 0, 'user', 'Message 2');
    
    const stats = db.getStatistics();
    expect(stats.totalMessages).toBe(3);
    expect(stats.totalSessions).toBe(2);
    expect(stats.databaseSize).toBeGreaterThan(0);
  });

  test('should replace message with same index', () => {
    db.saveMessage('session1', 0, 'user', 'First message');
    db.saveMessage('session1', 0, 'user', 'Updated message');
    
    const messages = db.loadSessionHistory('session1');
    expect(messages).toHaveLength(1);
    expect(messages[0].content).toBe('Updated message');
  });

  test('should retrieve messages in correct order', () => {
    for (let i = 0; i < 5; i++) {
      db.saveMessage('session1', i, 'user', `Message ${i}`);
    }
    
    const messages = db.loadSessionHistory('session1');
    expect(messages).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      expect(messages[i].content).toBe(`Message ${i}`);
    }
  });

  test('should get all sessions metadata', () => {
    db.saveMessage('session1', 0, 'user', 'Message');
    db.saveMessage('session2', 0, 'user', 'Message');
    
    const allMetadata = db.getAllSessionsMetadata();
    expect(allMetadata).toHaveLength(2);
    expect(allMetadata.map(m => m.session_id)).toContain('session1');
    expect(allMetadata.map(m => m.session_id)).toContain('session2');
  });

  test('should handle special characters in messages', () => {
    const specialMessage = 'Hello "World" with \'quotes\' and <tags> & symbols!';
    db.saveMessage('session1', 0, 'user', specialMessage);
    
    const messages = db.loadSessionHistory('session1');
    expect(messages[0].content).toBe(specialMessage);
  });

  test('should handle very long messages', () => {
    const longMessage = 'a'.repeat(10000);
    db.saveMessage('session1', 0, 'user', longMessage);
    
    const messages = db.loadSessionHistory('session1');
    expect(messages[0].content).toBe(longMessage);
  });
});
