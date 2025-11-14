# Multi-AI Advisor Web UI

Modern, dark-themed web dashboard for monitoring and interacting with the Multi-AI Advisor MCP server.

## 🎨 Features

### Chat Interface
- **Modern Chat UI**: Clean, ChatGPT-inspired interface
- **Conversation History**: Browse and manage past conversations
- **Real-time Updates**: Live WebSocket connection for instant updates
- **Beautiful Design**: Dark theme with gradient accents

### System Monitoring
- **Live Statistics**: Monitor total jobs, completed/failed/running/pending jobs, and conversations
- **Job Tracking**: View detailed job information with progress bars
- **Connection Status**: Real-time server connection indicator
- **Floating Monitor**: Easy-access monitoring panel with badge notifications

### Responsive Design
- **Mobile First**: Optimized for all screen sizes
- **Touch Friendly**: Large touch targets on mobile devices
- **Adaptive Layout**: Sidebar drawer on mobile, fixed on desktop

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm
- Running Multi-AI Advisor MCP server

### Installation

1. Navigate to web-ui directory:
```bash
cd web-ui
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment (optional):
```bash
cp .env.example .env.local
# Edit .env.local with your settings
```

4. Start development server:
```bash
npm run dev
```

5. Open browser:
```
http://localhost:3000
```

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## 📱 Interface Overview

### Main Screen Components

#### 1. Sidebar (Left)
- **CHAT A.I+** branding
- **New Chat** button (gradient purple)
- **Search** button
- Conversation list grouped by:
  - Today
  - Last 7 Days
  - Older
- Settings button
- User profile

#### 2. Main Area (Center)
When no conversation is active:
- Welcome message
- Capability cards (Explore, Capabilities, Limitation)
- Example prompt cards
- Input area

When chatting:
- Message history with avatars
- User messages (right, gradient background)
- Assistant messages (left, dark background)
- Model name display
- Typing indicator
- Chat input with send button

#### 3. System Monitor (Floating)
Click the floating button (bottom-right) to view:
- **Statistics Tab**:
  - Total Jobs
  - Completed Jobs
  - Failed Jobs
  - Running Jobs
  - Pending Jobs
  - Total Conversations
- **Jobs Tab**:
  - Recent jobs list
  - Job status and progress
  - Error messages
  - Timestamps

## 🎨 Design System

### Colors (Dark Theme)
```
Background:     #0a0a0a (Very dark)
Sidebar:        #1a1a1a (Dark gray)
Cards:          #1f1f1f (Dark)
Borders:        #2a2a2a (Subtle)
Primary:        #5b5bd6 (Indigo-purple)
Text:           #e8e8e8 (Soft white)
Muted:          #8a8a8a (Gray)
```

### Typography
- **Font**: System fonts (Apple, Segoe UI, Roboto)
- **Sizes**: Responsive (sm on mobile, larger on desktop)
- **Weights**: Medium (500), Semibold (600), Bold (700)

### Components
- **Rounded corners**: 12px, 16px, 24px
- **Shadows**: Subtle elevation effects
- **Gradients**: Indigo-purple for accents
- **Transitions**: 0.2s ease for smooth interactions

## 🔧 Configuration

### Environment Variables

Create `.env.local` file:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080

# Feature Flags
NEXT_PUBLIC_ENABLE_STATS=true
NEXT_PUBLIC_ENABLE_JOBS=true
```

### API Endpoints

The UI connects to these backend endpoints:

- `GET /api/stats` - System statistics
- `GET /api/sessions` - Conversation sessions
- `GET /api/sessions/:id/conversations` - Messages for a session
- `GET /api/jobs` - Jobs list
- `POST /api/sessions/:id/clear` - Clear conversation
- `WS /ws` - WebSocket for live updates

## 📦 Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State**: React Hooks
- **Real-time**: WebSocket

## 🎯 Usage

### Starting a New Chat
1. Click "New chat" button in sidebar
2. Type your message in the input area
3. Press Enter or click send button
4. View AI responses from multiple advisors

### Viewing Statistics
1. Click the floating monitor button (bottom-right)
2. View stats in the Statistics tab
3. See running jobs badge on button

### Monitoring Jobs
1. Open system monitor
2. Switch to Jobs tab
3. View job status, progress, and errors
4. Click refresh to update

### Managing Conversations
1. Browse conversations in sidebar
2. Click a conversation to view history
3. Conversations auto-group by date
4. Use search to find specific chats

## 🔨 Development

### Project Structure

```
web-ui/
├── app/
│   ├── page.tsx          # Main dashboard
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/
│   ├── ChatSidebar.tsx      # Sidebar navigation
│   ├── WelcomeScreen.tsx    # Landing screen
│   ├── ChatInterface.tsx    # Chat view
│   └── SystemMonitor.tsx    # Monitoring panel
├── lib/
│   ├── api.ts            # API client
│   └── useWebSocket.ts   # WebSocket hook
└── types/
    └── index.ts          # TypeScript types
```

### Adding New Features

1. Create component in `/components`
2. Add types in `/types/index.ts`
3. Import in `app/page.tsx`
4. Update documentation

### Styling Guidelines

- Use CSS variables for colors
- Follow Tailwind utility-first approach
- Maintain responsive breakpoints (sm, md, lg)
- Test on mobile, tablet, desktop

## 📚 Documentation

- [DESIGN.md](./DESIGN.md) - Detailed design documentation
- [CHANGELOG.md](./CHANGELOG.md) - Version history and changes

## 🐛 Troubleshooting

### Server won't start
- Check Node.js version (18+)
- Delete `node_modules` and run `npm install`
- Check port 3000 is available

### Data not loading
- Ensure backend server is running
- Check API URL in `.env.local`
- Verify CORS settings on backend
- Check browser console for errors

### WebSocket not connecting
- Verify WebSocket URL
- Check backend WebSocket support
- Look for network/firewall blocks

### Styling issues
- Clear browser cache
- Rebuild Tailwind: `npm run build`
- Check for CSS conflicts

## 🤝 Contributing

1. Follow existing code style
2. Use TypeScript for type safety
3. Test on all screen sizes
4. Update documentation
5. Add changelog entry

## 📄 License

Same as parent Multi-AI Advisor MCP project.

## 🙏 Credits

- Design inspired by ChatGPT interface
- Icons by Lucide
- Built with Next.js and Tailwind CSS
