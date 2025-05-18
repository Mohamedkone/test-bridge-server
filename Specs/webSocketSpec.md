# WebSocket Infrastructure Supplementary Design

## 1. Event Payload Structures

### Authentication Events

```typescript
// authenticate
interface AuthenticatePayload {
  token: string;  // JWT token for authentication
}

// authentication_successful
interface AuthSuccessPayload {
  userId: string;
  sessionId: string;
}

// authentication_failed
interface AuthFailurePayload {
  reason: string;
  code: 'invalid_token' | 'expired_token' | 'unauthorized';
}
```

### Room Events

```typescript
// join-room
interface JoinRoomPayload {
  roomId: string;
  userId: string;
}

// user-joined
interface UserJoinedPayload {
  roomId: string;
  userId: string;
  userName: string;
  joinedAt: string;  // ISO timestamp
}

// lock-room
interface LockRoomPayload {
  roomId: string;
  userId: string;
  reason?: string;
}

// room-locked
interface RoomLockedPayload {
  roomId: string;
  lockedBy: string;  // userId
  lockedByName: string;
  lockedAt: string;  // ISO timestamp
  reason?: string;
}
```

### File Events

```typescript
// file-upload-started
interface FileUploadStartedPayload {
  fileId: string;
  fileName: string;
  roomId: string;
  userId: string;
  size: number;
  mimeType?: string;
}

// file-upload-progress
interface FileUploadProgressPayload {
  fileId: string;
  uploadId: string;
  fileName: string;
  roomId: string;
  userId: string;
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
  uploadSpeed?: number;  // bytes per second
  estimatedTimeRemaining?: number;  // seconds
}

// file-added
interface FileAddedPayload {
  roomId: string;
  file: {
    id: string;
    name: string;
    size: number;
    mimeType: string;
    uploadedBy: string;
    uploadedByName: string;
    createdAt: string;
    parentId?: string;
    isFolder: boolean;
  }
}
```

## 2. Client Implementation Guidelines

### Connection Setup

```typescript
// Client connection with automatic reconnection
const socket = io('https://api.example.com', {
  path: '/socket.io',
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000,
  auth: {
    token: 'your-jwt-token'
  }
});

// Connection event handlers
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);
});
```

### Room Interaction Pattern

```typescript
// Join a room
function joinRoom(roomId) {
  socket.emit('join-room', { roomId, userId: currentUser.id });
}

// Listen for room events
socket.on('user-joined', (data) => {
  console.log(`${data.userName} joined room ${data.roomId}`);
  updateParticipantsList(data);
});

socket.on('room-locked', (data) => {
  console.log(`Room ${data.roomId} locked by ${data.lockedByName}`);
  updateRoomLockState(data);
});
```

### File Upload Monitoring

```typescript
// Report upload progress
function reportUploadProgress(fileId, uploadId, bytesUploaded, totalBytes) {
  socket.emit('file-upload-progress', {
    fileId,
    uploadId,
    fileName: currentFile.name,
    roomId: currentRoom.id,
    userId: currentUser.id,
    bytesUploaded,
    totalBytes,
    percentage: (bytesUploaded / totalBytes) * 100
  });
}

// Listen for other users' uploads
socket.on('file-upload-progress', (data) => {
  if (data.userId !== currentUser.id) {
    updateFileProgressUI(data);
  }
});
```

## 3. State Management in Redis

### Key Naming Conventions

- User sessions: `session:{sessionId}`
- Socket sessions: `socket:{socketId}`
- User-socket mapping: `user:{userId}:sockets`
- Room participants: `room:{roomId}:users`
- User rooms: `user:{userId}:rooms`
- Active uploads: `upload:{uploadId}:progress`

### Room State Structure

```typescript
// Redis hash structure for room:{roomId}
interface RoomState {
  id: string;
  name: string;
  isLocked: boolean;
  lockedBy?: string;
  lockedAt?: string;
  activeUsers: string[];  // Serialized array of user IDs
  activeUploads: string;  // Serialized object of active uploads
  lastActivity: string;   // ISO timestamp
}
```

### TTL Policies

- Socket sessions: 24 hours, refreshed on connection
- Room state: No expiration for active rooms, 7 days for inactive rooms
- Upload progress: 24 hours, or removed on completion
- Temporary tokens: 15 minutes

## 4. Testing Strategy

### Unit Testing Socket Handlers

```typescript
describe('Room Socket Handler', () => {
  let mockSocket;
  let mockIo;
  let roomHandler;
  
  beforeEach(() => {
    // Setup mock socket.io and socket
    mockSocket = {
      id: 'test-socket-id',
      join: jest.fn(),
      leave: jest.fn(),
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn()
    };
    
    roomHandler = new RoomSocketHandler(mockIo, socketStateManager, authService);
  });
  
  test('joinRoom should add user to room', async () => {
    // Test implementation
  });
});
```

### Integration Testing Setup

- Use Socket.IO client for real connection testing
- Use Redis client for state verification
- Test across multiple socket instances

### Load Testing Metrics

- Maximum concurrent connections: 10,000
- Message throughput: 1,000 messages/second
- Latency under load: < 100ms
- CPU/memory utilization: < 80%