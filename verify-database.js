// Simple verification script for database functionality
// Run with: node verify-database.js

import { ConversationDatabase } from './build/database.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('🧪 Starting Database Verification Tests...\n');

// Create test database
const testDbPath = path.join(__dirname, 'test-db-verify.db');

// Clean up old test database if exists
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

try {
  const db = new ConversationDatabase(testDbPath);
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Save and retrieve a single message
  console.log('Test 1: Save and retrieve a single message');
  db.saveMessage('session1', 0, 'user', 'Hello', undefined, undefined);
  const messages1 = db.loadSessionHistory('session1');
  if (messages1.length === 1 && messages1[0].content === 'Hello') {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 2: Save and retrieve multiple messages
  console.log('Test 2: Save and retrieve multiple messages');
  db.saveMessage('session1', 1, 'assistant', 'Hi there', 'gemma3:1b');
  db.saveMessage('session1', 2, 'user', 'How are you?');
  const messages2 = db.loadSessionHistory('session1');
  if (messages2.length === 3 && messages2[1].content === 'Hi there' && messages2[2].content === 'How are you?') {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 3: Save and retrieve thinking text
  console.log('Test 3: Save and retrieve thinking text');
  const thinkingContent = 'Step 1: Understand\nStep 2: Solve';
  db.saveMessage('session2', 0, 'user', 'What is 2+2?');
  db.saveMessage('session2', 1, 'assistant', 'The answer is 4', 'llama3.2:1b', thinkingContent);
  const messages3 = db.loadSessionHistory('session2');
  if (messages3[1].thinking_text === thinkingContent) {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 4: Handle multiple sessions independently
  console.log('Test 4: Handle multiple sessions independently');
  const allSessions = db.getAllSessions();
  if (allSessions.includes('session1') && allSessions.includes('session2')) {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 5: Get session metadata
  console.log('Test 5: Get session metadata');
  const metadata = db.getSessionMetadata('session1');
  if (metadata && metadata.message_count === 3) {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 6: Delete a session
  console.log('Test 6: Delete a session');
  db.deleteSession('session2');
  const sessionsAfterDelete = db.getAllSessions();
  if (!sessionsAfterDelete.includes('session2') && sessionsAfterDelete.includes('session1')) {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 7: Get database statistics
  console.log('Test 7: Get database statistics');
  const stats = db.getStatistics();
  if (stats.totalMessages > 0 && stats.totalSessions > 0) {
    console.log('  ✅ PASS');
    console.log(`     - Total messages: ${stats.totalMessages}`);
    console.log(`     - Total sessions: ${stats.totalSessions}`);
    console.log(`     - Database size: ${(stats.databaseSize / 1024).toFixed(2)} KB\n`);
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Test 8: Handle special characters in messages
  console.log('Test 8: Handle special characters in messages');
  const specialMessage = 'Hello "World" with \'quotes\' and <tags> & symbols!';
  db.saveMessage('session1', 3, 'user', specialMessage);
  const specialMessages = db.loadSessionHistory('session1');
  if (specialMessages[specialMessages.length - 1].content === specialMessage) {
    console.log('  ✅ PASS\n');
    testsPassed++;
  } else {
    console.log('  ❌ FAIL\n');
    testsFailed++;
  }

  // Close database
  db.close();

  // Summary
  console.log('═══════════════════════════════════════');
  console.log(`📊 Test Results: ${testsPassed} passed, ${testsFailed} failed`);
  console.log(`✅ Database functionality verified!\n`);

  // Clean up test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
    console.log('✨ Cleaned up test database');
  }

  process.exit(testsFailed === 0 ? 0 : 1);
} catch (error) {
  console.error('❌ Error during verification:', error);
  process.exit(1);
}
