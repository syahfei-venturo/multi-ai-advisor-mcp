'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Brain, ArrowDown } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model?: string;
  timestamp: Date;
}

interface ChatInterfaceProps {
  messages?: Message[];
  onSendMessage?: (message: string) => void;
  isLoading?: boolean;
}

export function ChatInterface({
  messages = [],
  onSendMessage,
  isLoading = false
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shouldAutoScrollRef = useRef(true);

  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Check if user is near bottom of scroll
  const isNearBottom = () => {
    const container = messagesContainerRef.current;
    if (!container) return true;

    const threshold = 150; // pixels from bottom
    const position = container.scrollHeight - container.scrollTop - container.clientHeight;
    return position < threshold;
  };

  // Handle scroll events to detect if user scrolled up
  const handleScroll = () => {
    const nearBottom = isNearBottom();
    shouldAutoScrollRef.current = nearBottom;
    setShowScrollButton(!nearBottom);
  };

  // Auto-scroll only if user is near bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage?.(input.trim());
      setInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      // Always scroll to bottom when sending a message
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom(), 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const adjustTextareaHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Messages Area */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 sm:py-8 space-y-4 sm:space-y-6"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex items-start gap-4">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl bg-[var(--card-bg)]">
                <div className="flex gap-1">
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={() => {
            shouldAutoScrollRef.current = true;
            scrollToBottom();
          }}
          className="absolute bottom-24 right-4 sm:right-8 w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all flex items-center justify-center z-10"
          title="Scroll to bottom"
        >
          <ArrowDown size={18} />
        </button>
      )}

      {/* Input Area */}
      <div className="border-t border-[var(--border)] p-4 sm:p-6">
        <form onSubmit={handleSubmit} className="max-w-4xl mx-auto">
          <div className="relative bg-[var(--card-bg)] rounded-2xl sm:rounded-3xl border border-[var(--border)] focus-within:border-[var(--accent-primary)] transition-colors">
            <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 sm:py-4">
              {/* Avatar Icon */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-rose-400 flex items-center justify-center flex-shrink-0">
                <Brain size={20} className="text-white" />
              </div>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  adjustTextareaHeight();
                }}
                onKeyDown={handleKeyDown}
                placeholder="What's in your mind?..."
                className="flex-1 bg-transparent border-none outline-none resize-none text-[var(--foreground)] placeholder:text-[var(--text-muted)] text-base max-h-[200px]"
                rows={1}
                disabled={isLoading}
              />

              {/* Send Button */}
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="w-11 h-11 rounded-full gradient-button flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-indigo-500/30 transition-all"
              >
                <Send size={18} className="text-white" />
              </button>
            </div>
          </div>

          <p className="text-xs text-[var(--text-muted)] text-center mt-3">
            AI can make mistakes. Consider checking important information.
          </p>
        </form>
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: Message;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="text-center text-xs text-[var(--text-muted)] py-2">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex items-start gap-4 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isUser
            ? 'bg-gradient-to-br from-emerald-400 to-teal-400'
            : 'bg-gradient-to-br from-indigo-500 to-purple-500'
        }`}
      >
        {isUser ? (
          <User size={18} className="text-white" />
        ) : (
          <Bot size={18} className="text-white" />
        )}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[85%] sm:max-w-[80%] ${isUser ? 'flex flex-col items-end' : ''}`}>
        {message.model && !isUser && (
          <div className="text-xs text-[var(--text-muted)] mb-1 font-medium">
            {message.model}
          </div>
        )}
        <div
          className={`px-5 py-3 rounded-2xl ${
            isUser
              ? 'bg-gradient-to-br from-indigo-500 to-purple-500 text-white'
              : 'bg-[var(--card-bg)] text-[var(--foreground)]'
          }`}
        >
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {message.content}
          </p>
        </div>
        <div className="text-xs text-[var(--text-muted)] mt-1 px-2">
          {(() => {
            const now = new Date();
            const msgDate = new Date(message.timestamp);
            const isToday = msgDate.toDateString() === now.toDateString();

            // Use locale-specific formatting with timezone
            const timeOptions: Intl.DateTimeFormatOptions = {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false  // Use 24-hour format
            };

            if (isToday) {
              return msgDate.toLocaleTimeString('id-ID', timeOptions);
            } else {
              return msgDate.toLocaleString('id-ID', {
                month: 'short',
                day: 'numeric',
                ...timeOptions
              });
            }
          })()}
        </div>
      </div>
    </div>
  );
}
