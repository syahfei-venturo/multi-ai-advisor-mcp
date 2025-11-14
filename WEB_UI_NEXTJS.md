# Web UI Dashboard - Next.js Implementation

Multi-AI Advisor MCP Server features a modern **Next.js dashboard** for real-time monitoring of conversations, jobs, and system statistics.

## 🚀 Features

- ✨ **Next.js 16** with React 19 and TypeScript
- 🎨 **Tailwind CSS** for modern, responsive styling
- 🔄 **Real-time WebSocket** updates
- 📊 **Statistics Dashboard** with live metrics
- 💬 **Session Management** for conversation history
- 📋 **Job Monitoring** with status tracking
- 🌙 **Dark Theme** optimized for long sessions
- ⚡ **Fast Refresh** during development

## 📦 Architecture

```
multi-ai-advisor-mcp/
├── build/                      # Backend (Express + WebSocket)
│   └── infrastructure/web/
│       └── WebServer.js        # API endpoints (port 3001)
│
└── web-ui/                     # Frontend (Next.js)
    ├── app/
    │   ├── layout.tsx          # Root layout
    │   ├── page.tsx            # Main dashboard
    │   └── globals.css         # Tailwind styles
    ├── components/
    │   ├── StatsCards.tsx      # Metrics display
    │   ├── ConnectionStatus.tsx # WebSocket status
    │   ├── SessionsList.tsx    # Session sidebar
    │   ├── ConversationPanel.tsx # Chat history
    │   └── JobsList.tsx        # Job monitoring
    ├── lib/
    │   ├── api.ts              # API client
    │   ├── useWebSocket.ts     # WebSocket hook
    │   └── utils.ts            # Helper functions
    └── types/
        └── index.ts            # TypeScript definitions
```

## 🛠️ Installation & Setup

### 1. Install Dependencies

```bash
# Root project dependencies (if not already installed)
npm install

# Install Next.js dependencies
cd web-ui
npm install
```

### 2. Build Backend

```bash
# From root directory
npm run build
```

### 3. Start Development

**🎉 Auto-Start Mode (Recommended) - JUST ONE COMMAND!**

Next.js will automatically start when you run the backend:

```bash
# Single command starts BOTH backend (port 3001) AND Next.js (port 3000)!
node build/index.js --debug
```

That's it! Both servers will start automatically:
- Backend API + WebSocket: `http://localhost:3001`
- Next.js Frontend: `http://localhost:3000`

Output will show:
```
[WebServer] Backend API available at http://localhost:3001
[WebServer] Starting Next.js dev server...
[Next.js] - Local:         http://localhost:3000
[Next.js] ✓ Ready in 2.7s
```

**Alternative: Manual Mode (Separate Terminals)**

If you prefer to run them separately:

```bash
# Terminal 1: Start Express backend (port 3001)
node build/index.js --debug

# Terminal 2: Start Next.js dev server (port 3000)
cd web-ui
npm run dev
```

### 4. Access Dashboard

Open browser to: **http://localhost:3000**

- Frontend (Next.js): `http://localhost:3000`
- Backend API: `http://localhost:3001`
- WebSocket: `ws://localhost:3001`

## ⚙️ Configuration

### Environment Variables

Create `web-ui/.env.local`:

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://localhost:3001

# WebSocket URL
NEXT_PUBLIC_WS_URL=ws://localhost:3001
```

### Backend Configuration

The Express backend runs on **port 3001** by default (changed from 3000 to avoid conflict with Next.js).

```bash
# Custom backend port
node build/index.js --web-ui-port 3002

# Disable Express web server (Next.js only)
node build/index.js --web-ui false
```

Update `web-ui/.env.local` if using custom port:

```env
NEXT_PUBLIC_API_URL=http://localhost:3002
NEXT_PUBLIC_WS_URL=ws://localhost:3002
```

## 🏗️ Production Deployment

### 1. Build Next.js

```bash
cd web-ui
npm run build
```

### 2. Start Production Servers

```bash
# Terminal 1: Backend
node build/index.js

# Terminal 2: Frontend
cd web-ui
npm start
```

### 3. Using PM2 (Recommended)

```bash
# Install PM2
npm install -g pm2

# Start backend
pm2 start build/index.js --name mcp-backend

# Start frontend
pm2 start npm --name mcp-frontend -- start --prefix web-ui

# Save PM2 config
pm2 save
pm2 startup
```

## 📊 Dashboard Components

### Stats Cards
- Total Jobs
- Completed Jobs
- Running Jobs
- Total Conversations

### Sessions Panel (Left)
- List of all conversation sessions
- Last activity timestamp
- Click to view details

### Conversation Panel (Center)
- Message history for selected session
- User/Assistant messages
- Thinking process (if available)
- Clear conversation button

### Jobs Panel (Right)
- Job list with status badges
- Color-coded status:
  - 🟢 Green: Completed
  - 🟡 Yellow: Running
  - 🔴 Red: Failed
  - 🔵 Blue: Pending
- Model response counts

## 🔌 API Endpoints

All endpoints are proxied through Next.js to the Express backend:

```typescript
GET  /api/stats                  // System statistics
GET  /api/sessions               // List all sessions
GET  /api/conversations?session_id={id}  // Get messages
DELETE /api/conversations/{id}   // Clear conversation
GET  /api/jobs                   // List all jobs
GET  /api/jobs/{id}              // Get job details
POST /api/jobs/{id}/cancel       // Cancel job
```

## 🔄 WebSocket Events

Real-time updates via WebSocket:

```typescript
{
  type: 'connected' | 'conversation_updated' | 'conversation_cleared' | 'job_updated' | 'job_cancelled',
  sessionId?: string,
  jobId?: string,
  status?: string,
  timestamp: string
}
```

## 🎨 Customization

### Styling

Edit `web-ui/app/globals.css` for global styles or component files for component-specific styling.

Tailwind configuration: `web-ui/tailwind.config.ts`

### Components

All React components are in `web-ui/components/`:
- Fully typed with TypeScript
- Use Tailwind CSS for styling
- Support hot reload during development

### Adding New Features

1. Create component in `web-ui/components/`
2. Add types in `web-ui/types/index.ts`
3. Update API client in `web-ui/lib/api.ts` if needed
4. Import and use in `web-ui/app/page.tsx`

## 🐛 Troubleshooting

### Port Conflicts

```bash
# Check ports
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Kill process
taskkill /PID {PID} /F
```

### WebSocket Not Connecting

1. Verify backend is running on port 3001
2. Check `.env.local` has correct URLs
3. Ensure no CORS issues (backend has CORS enabled)
4. Check browser console for errors

### Build Errors

```bash
# Clean Next.js cache
cd web-ui
rm -rf .next

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

## 📚 Technology Stack

- **Next.js 16.0.3** - React framework
- **React 19.2.0** - UI library
- **TypeScript 5.9.3** - Type safety
- **Tailwind CSS 3.4** - Utility-first CSS
- **WebSocket (ws)** - Real-time communication
- **Express** - Backend API server

## 🚧 Development Tips

### Hot Reload

Both servers support hot reload:
- Next.js: Automatic on file save
- Backend: Requires restart after changes

### Debugging

```bash
# Enable debug mode
node build/index.js --debug

# Next.js debug
cd web-ui
npm run dev -- --debug
```

### TypeScript Errors

```bash
# Type check
cd web-ui
npx tsc --noEmit
```

## 📝 Scripts

### Root package.json

```json
{
  "scripts": {
    "build": "tsc",
    "start": "node build/index.js"
  }
}
```

### web-ui/package.json

```json
{
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start -p 3000",
    "lint": "next lint"
  }
}
```

## 🔐 Security Notes

- Web UI is for **local development/monitoring**
- No authentication by default
- Bound to localhost only
- For production: Add reverse proxy with authentication
- Use environment variables for sensitive config

## 🎯 Future Enhancements

Planned features:
- [ ] Authentication & authorization
- [ ] Dark/light theme toggle
- [ ] Advanced search & filtering
- [ ] Export data (JSON/CSV)
- [ ] Pagination for large datasets
- [ ] Real-time charts with Chart.js
- [ ] Mobile-responsive improvements
- [ ] Keyboard shortcuts
- [ ] Custom refresh intervals

## 📄 License

Same as main project (MIT)

---

**Happy Monitoring! 🎉**

For issues or questions, visit: [GitHub Issues](https://github.com/anthropics/claude-code/issues)
