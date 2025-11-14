# Web UI Design Documentation

## Overview

The web-ui has been redesigned with a modern chat interface inspired by ChatGPT, featuring a dark theme and clean, minimalist design.

## Design Inspiration

The design is based on the Figma design at: https://www.figma.com/design/KKRbWsbIMwuJogJeBd7FUZ/Untitled?node-id=0-1

Key design elements adopted:
- Chat-style sidebar with conversation history
- Welcome screen with capability cards
- Modern dark theme
- Clean, rounded UI elements
- Gradient accent colors (indigo/purple)

## Color Scheme (Dark Theme)

```css
--background: #0a0a0a       /* Main background */
--sidebar-bg: #1a1a1a       /* Sidebar background */
--card-bg: #1f1f1f          /* Card backgrounds */
--border: #2a2a2a           /* Border color */
--accent-primary: #5b5bd6   /* Primary accent (blue-purple) */
--accent-hover: #4a4ac0     /* Hover state */
--foreground: #e8e8e8       /* Main text */
--text-muted: #8a8a8a       /* Muted text */
--text-secondary: #b0b0b0   /* Secondary text */
```

## Components

### 1. ChatSidebar (`/components/ChatSidebar.tsx`)
- **Purpose**: Navigation and conversation management
- **Features**:
  - "New chat" button with gradient styling
  - Search functionality
  - Conversation list grouped by time (Today, Last 7 Days, Older)
  - Settings and user profile sections
  - Fully responsive with mobile support

### 2. WelcomeScreen (`/components/WelcomeScreen.tsx`)
- **Purpose**: Initial landing screen when no conversation is active
- **Features**:
  - Large welcome message
  - Three capability cards (Explore, Capabilities, Limitation)
  - Six example prompt cards with icons
  - Responsive grid layout

### 3. ChatInterface (`/components/ChatInterface.tsx`)
- **Purpose**: Active conversation view
- **Features**:
  - Message bubbles with user/assistant differentiation
  - Avatar icons with gradient backgrounds
  - Typing indicator animation
  - Auto-scrolling to latest message
  - Responsive message layout

### 4. SystemMonitor (`/components/SystemMonitor.tsx`)
- **Purpose**: Real-time system monitoring and statistics
- **Features**:
  - Floating action button (bottom-right corner)
  - Badge notification for running jobs
  - Slide-in panel with two tabs:
    - **Statistics**: Total jobs, completed, failed, running, pending, conversations
    - **Jobs**: Recent jobs with status, progress bars, error messages
  - Connection status indicator
  - Auto-refresh capability
  - Fully responsive drawer

### 5. Input Area
- **Features**:
  - Rounded, modern input box
  - Brain icon indicator
  - Auto-expanding textarea
  - Send button with gradient styling
  - Enter to send, Shift+Enter for new line

## Layout Structure

```
┌─────────────────────────────────────────────┐
│  Sidebar  │  Main Content Area              │
│           │                                  │
│  • Logo   │  ┌──────────────────────────┐  │
│  • New    │  │   Welcome Screen or      │  │
│    Chat   │  │   Chat Interface         │  │
│  • Search │  │                          │  │
│           │  └──────────────────────────┘  │
│  Convs:   │                                  │
│  • Conv 1 │  ┌──────────────────────────┐  │
│  • Conv 2 │  │   Input Area             │  │
│           │  └──────────────────────────┘  │
│  Settings │                                  │
│  User     │                                  │
└─────────────────────────────────────────────┘
```

## Responsive Design

### Desktop (lg: 1024px+)
- Sidebar fixed at 320px width
- Full feature visibility
- Three-column grid for capability cards
- Two-column grid for example cards

### Tablet (md: 768px - 1023px)
- Sidebar toggleable with overlay
- Two-column grids
- Adjusted padding and spacing

### Mobile (< 768px)
- Hidden sidebar (toggle button appears)
- Single-column layouts
- Smaller text sizes
- Reduced padding
- Full-width components

## Animations & Transitions

- Smooth color transitions (0.2s ease)
- Hover effects on cards and buttons
- Gradient button hover with shadow
- Typing indicator with staggered bounce animation
- Sidebar slide-in/out animation (300ms)

## Typography

- **Headers**: Bold, tight tracking
- **Body**: Regular weight, relaxed line-height
- **Muted text**: Smaller size, reduced opacity
- **Font stack**: System fonts (Apple, Segoe UI, Roboto)

## Icons

Using **lucide-react** for consistent, modern icons:
- Search, Plus, MessageCircle, Settings, User (Sidebar)
- Compass, Zap, AlertTriangle, Lightbulb, etc. (Welcome Screen)
- Send, Bot, User, Brain (Chat Interface)

## Development

### Running the server
```bash
cd web-ui
npm run dev
```
Server runs at: http://localhost:3000

### Building for production
```bash
cd web-ui
npm run build
npm start
```

## Future Enhancements

Potential improvements:
1. Real-time message streaming
2. Message reactions and editing
3. Dark/light theme toggle
4. Advanced search and filtering
5. Conversation export
6. Voice input support
7. Multi-language support
8. Custom themes
9. Keyboard shortcuts
10. Message markdown rendering

## Dependencies

- **Next.js 16.0.3**: React framework
- **React 19**: UI library
- **Tailwind CSS**: Styling
- **lucide-react**: Icon library
- **TypeScript**: Type safety

## Notes

- All colors use CSS custom properties for easy theming
- Components are fully typed with TypeScript
- Responsive breakpoints follow Tailwind's standard
- Custom scrollbar styling for consistent appearance
- Smooth animations without performance impact
