# Cloud Media Player

A modern web-based audio player that streams music directly from your Dropbox account with playlist management and cross-device synchronization.

## Features

### 🎵 Core Audio Playback
- Stream audio files directly from Dropbox (MP3, WAV, OGG, M4A, FLAC, AAC)
- Built-in HTML5 audio player with standard controls
- Auto-advance through playlists, previous/next controls

### 📁 File Management
- Browse your entire Dropbox file structure
- Filtering to show only audio files and folders
- Add single files to playlist or recursive folder scanning to add all songs from a directory
- Real-time progress tracking during folder operations

### 🎼 Playlist Management
- Create and manage multiple playlists
- Shuffle and clear playlist options
- Visual indicators for currently playing tracks
- Auto-save current playback state

### ☁️ Cloud Synchronization
- Automatic playlist sync with Dropbox
- Cross-device playlist access
- Offline support with local storage fallback
- Conflict resolution with timestamp-based merging
- Manual force-sync options for individual playlists

### 🔐 Secure Authentication
- OAuth 2.0 with PKCE (Proof Key for Code Exchange)
- Secure token management with automatic refresh
- No password storage - uses Dropbox's secure authentication

### 📱 Responsive Design
- Mobile-friendly interface
- Adaptive layout for different screen sizes

## Technology Stack

### Frontend
- Angular 19
- TypeScript
- RxJS
- Standalone Components

### Backend
- ASP.NET Core 9.0
- Static File Serving

### External Services
- Dropbox API v2*
- OAuth 2.0 + PKCE

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- .NET 9.0 SDK
- Dropbox Developer Account

### 1. Clone and Install
```bash
git clone <repository-url>
cd CloudMediaPlayer
cd cloudmediaplayer.client
npm install
```

### 2. Dropbox App Setup
1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Create a new app with "App folder" access
3. Add redirect URIs:
   - `https://localhost:7028/auth/callback` (production)
   - `https://localhost:7028/` (development)
4. Copy your App Key

### 3. Configure App Key
Update `CLIENT_ID` in `src/app/core/services/dropbox.service.ts`:
```typescript
private readonly CLIENT_ID = 'your_dropbox_app_key_here';
```

### 4. Run the Application
```bash
# From the solution root
dotnet run --project CloudMediaPlayer.Server
```

The app will be available at `https://localhost:7028`

## Project Structure

```
CloudMediaPlayer/
├── CloudMediaPlayer.Server/          # ASP.NET Core backend
│   ├── Program.cs                    # Server configuration
│   └── wwwroot/                      # Built Angular app
│
└── cloudmediaplayer.client/          # Angular frontend
    ├── src/
    │   ├── app/
    │   │   ├── core/                 # Services and core functionality
    │   │   │   └── services/         # Business logic services
    │   │   ├── features/             # Feature modules
    │   │   │   ├── dropbox/          # Dropbox integration
    │   │   │   ├── media-player/     # Audio playback
    │   │   │   └── playlist/         # Playlist management
    │   │   ├── shared/               # Shared components and models
    │   │   │   ├── components/       # Reusable UI components
    │   │   │   └── models/           # TypeScript interfaces
    │   │   └── app.component.*       # Root component
    │   └── styles.css                # Global styles
    └── package.json                  # Dependencies
```

## Architecture Overview

### Component Hierarchy
```
AppComponent
└── MediaPlayerComponent (orchestrator)
    ├── DropboxConnectComponent (authentication)
    ├── AudioPlayerComponent (playback controls)
    ├── FileBrowserComponent (file navigation)
    └── PlaylistComponent (playlist management)
```

### Key Services
- **DropboxService** - API communication, file operations, authentication
- **PlaylistService** - Playlist CRUD, sync management, local storage
- **NotificationService** - User feedback and error handling
- **FileUtilService** - File validation, path manipulation

## Configuration

### Dropbox API Limits
- **Rate Limiting**: Built-in request throttling (50ms delays)
- **Concurrent Requests**: Limited to 5 simultaneous requests
- **File Size**: Dropbox temporary links support files up to 2GB

## Development

### Available Scripts
```bash
# Development server
npm start

# Build for production
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Lint code
npm run lint
```

### Testing
- **Unit Tests**: Jasmine + Karma

## Deployment

### Building for Production
```bash
cd cloudmediaplayer.client
npm run build
cd ../CloudMediaPlayer.Server
dotnet publish -c Release
```

### Environment Variables
For production deployment, configure:
- `ASPNETCORE_ENVIRONMENT=Production`
- `ASPNETCORE_URLS=https://+:443;http://+:80`

### HTTPS Requirements
- Dropbox OAuth requires HTTPS in production
- Use valid SSL certificates for custom domains
- Update Dropbox app redirect URIs for your domain

## Troubleshooting

### Common Issues

#### Authentication Fails
- Verify Dropbox App Key is correct
- Check redirect URIs match exactly
- Ensure HTTPS is used in production

#### Performance Issues
- Large folders may take time to scan
- Browser memory usage with very large playlists
- Network speed affects streaming quality

### Permissions
The app requests minimal Dropbox permissions:
- `files.metadata.read` - Browse your files
- `files.content.read` - Stream audio files
- `files.content.write` - Save playlists to app folder

## License

MIT License - see LICENSE file for details.

---

**Note**: This application is not affiliated with Dropbox, Inc. Dropbox is a trademark of Dropbox, Inc.
