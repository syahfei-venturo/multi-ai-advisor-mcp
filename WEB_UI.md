# Web UI Dashboard

Multi-AI Advisor MCP Server comes with a built-in web dashboard for monitoring conversations, jobs, and system statistics in real-time.

## Features

- **Real-time Updates**: WebSocket-powered live updates for conversations and jobs
- **Session Management**: View and manage multiple conversation sessions
- **Job Monitoring**: Track job progress, status, and results
- **Statistics Dashboard**: Overview of system activity and performance
- **Modern UI**: Responsive dark theme interface with smooth animations

## Quick Start

### 1. Enable Web UI (Default: Enabled)

The Web UI is enabled by default. To start the server with Web UI:

```bash
npm run build
node build/index.js
```

The dashboard will be available at: **http://localhost:3000**

### 2. Configuration Options

#### Via CLI Arguments

```bash
# Custom port
node build/index.js --web-ui-port 8080

# Disable Web UI
node build/index.js --web-ui false
```

#### Via Environment Variables

```bash
# .env file
WEB_UI_ENABLED=true
WEB_UI_PORT=3000
```

## Dashboard Components

### 1. Statistics Cards

Real-time overview of:
- Total Jobs
- Completed Jobs
- Running Jobs
- Active Conversations

### 2. Sessions Panel (Left)

- Lists all conversation sessions
- Shows last activity timestamp
- Click to view session details
- Auto-refreshes on updates

### 3. Conversations Panel (Center)

- Displays messages for selected session
- Shows user and assistant messages
- Includes timestamps
- Auto-scrolls to latest message
- Clear conversation button

### 4. Jobs Panel (Right)

- Lists all jobs with status
- Shows job progress
- Displays creation and completion times
- Color-coded status indicators:
  - 🟢 Completed (green)
  - 🟡 Running (yellow)
  - 🔴 Failed (red)
  - 🔵 Pending (blue)

## API Endpoints

The Web UI server exposes REST API endpoints:

### Conversations

```http
GET /api/conversations?session_id={id}
GET /api/sessions
DELETE /api/conversations/:sessionId
```

### Jobs

```http
GET /api/jobs
GET /api/jobs/:id
POST /api/jobs/:id/cancel
```

### Statistics

```http
GET /api/stats
```

## WebSocket Events

The dashboard subscribes to real-time events:

- `connected` - Initial connection confirmation
- `conversation_updated` - New message added
- `conversation_cleared` - Session cleared
- `job_updated` - Job status changed
- `job_cancelled` - Job cancelled

## Browser Compatibility

Tested and working on:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## Architecture

```
src/
├── infrastructure/
│   └── web/
│       └── WebServer.ts          # Express + WebSocket server
└── public/
    ├── index.html                # Dashboard UI
    ├── styles.css                # Dark theme styles
    └── app.js                    # WebSocket client + API calls
```

## Development

### Running in Development Mode

```bash
# Terminal 1: Build and watch
npm run build -- --watch

# Terminal 2: Start server
node build/index.js --debug --web-ui-port 3000
```

### Customizing the UI

Edit files in `public/`:
- `index.html` - HTML structure
- `styles.css` - Styling and theme
- `app.js` - Client-side logic

No build step needed for UI changes - just refresh the browser.

## Troubleshooting

### Port Already in Use

```bash
# Use a different port
node build/index.js --web-ui-port 3001
```

### WebSocket Connection Failed

Check that:
1. Server is running
2. No firewall blocking port 3000
3. Browser console for errors

### Data Not Loading

1. Check server logs for errors
2. Verify database file exists: `data/conversations.db`
3. Open browser DevTools → Network tab

## Security Notes

- Web UI is for local development/monitoring
- No authentication by default
- Bind to localhost only (not exposed externally)
- For production, use reverse proxy with auth

## Examples

### Monitor Remote Server

```bash
# Start server on remote machine
ssh user@remote "cd /path/to/mcp && node build/index.js --web-ui-port 3000"

# Forward port to local machine
ssh -L 3000:localhost:3000 user@remote

# Open http://localhost:3000 in browser
```

### Custom Port and Debug Mode

```bash
node build/index.js --debug --web-ui-port 8080
```

Then open: http://localhost:8080

## Performance

- WebSocket auto-reconnects on disconnect
- Auto-refresh every 30 seconds
- Efficient SQLite queries
- Minimal memory footprint (~10MB)

## Limitations

- Max 100 recent conversations shown
- Jobs list limited to last 100
- No pagination (yet)
- No search functionality (yet)

## Future Enhancements

Planned features:
- [ ] Search and filter conversations
- [ ] Export data to JSON/CSV
- [ ] Pagination for large datasets
- [ ] User authentication
- [ ] Dark/light theme toggle
- [ ] Custom refresh intervals
- [ ] Advanced job management

## License

Same as main project (MIT)
