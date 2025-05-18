# File Transfer Architecture Design

## Overview

The file transfer system allows users to securely upload large files (50GB+) directly to storage providers, track progress in real-time, and share files with others. The architecture is designed to handle large files efficiently, ensure data security, and provide a seamless user experience.

## Key Components

### 1. Direct-to-Storage Upload Flow

![Direct-to-Storage Upload Flow](https://mermaid.ink/svg/pako:eNqVVE1v2zAM_SuETgXSBkmyAb0U2Y5ZdtiKHXYRdiAkmhG6D4-SE2zA_vuoOEmTrEvbrT5I5CP5-EjrzFUoFVGROS3eFR0vIVdGAX6I4xKuNW-wnPBrXAJUdM1rMAoyupNoasK3EKIq2JZUk7hESbcKlZbwyeW8BXnrVQBDzSMt-s-Bj92Bq6VXCdYe5bXc9Pp7dN5A2hTAeUl4g4S1LK6RH3wT-yjy6JvPrQPNlZ-gK_4eN1fwXfVLKd2MNc_bZUfbqeWAEfcYlQaL50S2-Sv6xdEhWFcMfqpXTZxRx_x9j2_yT10DHMnQGJtXtsbGVGgcL4Yr5IfaQsfJ2UrJFlNhQxZh42q-a5hM3nDJbHLsVr5oauNk-a8w_o0H9QXCkbCTQ7aTRhsHJd3S-99i6dZW3_KSd9Q-SdZY1J7nSRpNm8bdUZpB3E0HaNqAHZO2uoTr4-uEHYbqCbj1XLEfHNhR1j5xbqyfzb7hZj7VyPJ6jPBYg8f-15yydZXQaAXPYeR5zy3yLVZF5gPiXJmVc_xH5-zCJDiDGhWzhcPpXN95YjXVKw1dYJZoZ5S7GOhc0fYHuOcDW3VkYcYNg9Ew-W1hRMqgUcj86aTXCm6Ur3pv8Bj7v8RRKxMB74rknnCXeN9TZKXvYBG6H76G-SrGwu2uB-99o-R_uQn3Uw)

1. **Client Initialization**:
   - Client requests upload session from server
   - Server validates request and generates a multipart upload ID
   - Server returns signed URLs for each chunk and tracking ID

2. **Client-Side Processing**:
   - File is split into chunks (e.g., 10MB each)
   - Optional client-side encryption is applied
   - Chunks are uploaded directly to storage provider
   - Upload progress is reported to server via WebSockets

3. **Server Coordination**:
   - Server monitors upload progress
   - Server broadcasts progress to relevant users
   - Server finalizes upload after all chunks are received
   - Server updates database with file metadata

4. **Completion Processing**:
   - Server validates uploaded file (checksum verification)
   - Server generates thumbnails or previews if applicable
   - Server notifies all room participants of new file

### 2. Large File Handling Strategy

#### Upload Strategy

1. **Chunk Management**
   - Default chunk size: 10MB
   - Adaptive chunking based on connection quality
   - Concurrent chunk uploads (5-10 parallel uploads)
   - Each chunk gets a separate signed URL

2. **Resumable Uploads**
   - Server tracks uploaded chunks in Redis
   - Interrupted uploads can be resumed from last successful chunk
   - Upload session valid for 7 days before cleanup

3. **Failure Handling**
   - Automatic retry for failed chunks (with exponential backoff)
   - Chunk upload timeout detection and recovery
   - Automatic reconnection after network interruptions

#### Download Strategy

1. **Streaming Downloads**
   - Files streamed directly from storage to client
   - Range requests for partial downloads
   - Download continuation after interruption

2. **Optimized Delivery**
   - Pre-signed URLs with short expiration
   - Acceleration via CDN for frequently accessed files
   - Parallel chunk downloads for large files

### 3. Real-time Progress Tracking

1. **WebSocket Events**
   ```
   // Upload progress event
   {
     "event": "file-upload-progress",
     "data": {
       "fileId": "uuid",
       "uploadId": "upload-session-id",
       "fileName": "large-file.zip",
       "roomId": "room-uuid",
       "bytesUploaded": 104857600,
       "totalBytes": 1073741824,
       "percentage": 9.7656,
       "uploadSpeed": 1048576,
       "estimatedTimeRemaining": 970
     }
   }
   ```

2. **Progress Aggregation**
   - Client reports progress after each chunk upload
   - Server stores aggregate progress in Redis
   - Server throttles broadcasts (max 4 updates/second)
   - All room participants receive real-time updates

3. **UI Feedback**
   - Progress bars for active uploads/downloads
   - Estimated time remaining
   - Transfer speed indicators
   - Pause/resume controls

### 4. Security Architecture

#### Data in Transit

1. **Secure Connections**
   - TLS 1.2+ for all API communication
   - WebSocket connections over WSS
   - HTTPS-only signed URLs

2. **Temporary Access**
   - Short-lived pre-signed URLs (15 minutes)
   - One-time use tokens for sensitive operations
   - Rate limiting on URL generation

#### Data at Rest

1. **Client-Side Encryption (E2EE)**
   - Browser-based AES-256-GCM encryption
   - Per-file encryption keys
   - Key exchange via secure channel

2. **Server-Side Encryption (Optional)**
   - Storage provider encryption (Wasabi/Storj SSE)
   - AWS KMS for key management
   - Envelope encryption for sensitive data

3. **Access Control**
   - Granular permissions per file
   - Audit logging of all file operations
   - Optional MFA for sensitive operations

### 5. Storage Provider Integration

#### Provider Abstraction Layer

```
┌─────────────────────────────────────────────────────────┐
│                 Storage Provider Interface               │
└─────────────────────────────────────────────────────────┘
          ▲               ▲               ▲               ▲
          │               │               │               │
┌─────────┴──────┐ ┌──────┴─────┐ ┌──────┴─────┐ ┌───────┴──────┐
│  Wasabi/Storj  │ │ AWS S3     │ │ Google     │ │ Dropbox      │
│  Provider      │ │ Provider   │ │ Drive      │ │ Provider     │
└────────────────┘ └────────────┘ └────────────┘ └──────────────┘
```

1. **Common Interface**
   - Unified API across all storage providers
   - Provider-specific optimizations behind interface
   - Feature detection for provider capabilities

2. **Provider Registration**
   - OAuth flow for third-party providers
   - Credential validation and connection testing
   - Automatic refresh of expired credentials

3. **Provider Fallback**
   - Automatic failover between providers
   - Load balancing for multi-provider setups
   - Health checks for provider availability

### 6. File Sharing System

1. **Share Link Generation**
   - Cryptographically secure random tokens
   - Optional password protection
   - Configurable expiration and download limits

2. **Access Controls**
   - Tracking of access attempts
   - IP-based restrictions (optional)
   - Revocable access at any time

3. **Preview Capabilities**
   - Browser-based preview for common file types
   - On-demand decryption for preview
   - Watermarking for sensitive documents

## Technical Implementation Details

### Multipart Upload Flow

```typescript
// Server-side upload initialization
async function initializeUpload(req, res) {
  const { fileName, size, roomId, storageId } = req.body;
  const user = req.user;
  
  // Validate permissions
  const canUpload = await authService.canUploadToRoom(user.id, roomId);
  if (!canUpload) return res.status(403).json({ error: "Permission denied" });
  
  // Determine optimal chunk size based on file size
  const chunkSize = determineOptimalChunkSize(size);
  const chunkCount = Math.ceil(size / chunkSize);
  
  // Initialize multipart upload with storage provider
  const storage = await storageService.getStorageProvider(storageId);
  const { uploadId, key } = await storage.createMultipartUpload({
    key: generateStorageKey(roomId, fileName),
    contentType: determineContentType(fileName),
    metadata: {
      userId: user.id,
      roomId,
      originalName: fileName
    }
  });
  
  // Generate signed URLs for each chunk
  const signedUrls = [];
  for (let i = 0; i < chunkCount; i++) {
    const partNumber = i + 1;
    const url = await storage.getSignedUrlForPart({
      key,
      uploadId,
      partNumber,
      contentLength: Math.min(chunkSize, size - i * chunkSize)
    });
    signedUrls.push({ partNumber, url });
  }
  
  // Store upload session in Redis
  const uploadSession = {
    id: uploadId,
    fileId: await generateFileId(),
    key,
    fileName,
    size,
    chunkSize,
    chunkCount,
    uploadedChunks: [],
    userId: user.id,
    roomId,
    storageId,
    startedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  };
  
  await redisClient.set(
    `upload:${uploadId}`, 
    JSON.stringify(uploadSession),
    { EX: 7 * 24 * 60 * 60 } // 7 days expiry
  );
  
  return res.json({
    uploadId,
    fileId: uploadSession.fileId,
    signedUrls,
    chunkSize,
    expiresAt: uploadSession.expiresAt
  });
}

// Client-side upload implementation
async function uploadLargeFile(file, roomId, storageId, progressCallback) {
  // Initialize upload session
  const session = await api.post('/files/upload-url', {
    fileName: file.name,
    size: file.size,
    roomId,
    storageId
  });
  
  const { uploadId, fileId, signedUrls, chunkSize } = session;
  const chunks = Math.ceil(file.size / chunkSize);
  const uploadedParts = [];
  
  // Connect to WebSocket for progress reporting
  socketService.emit('file-upload-started', {
    fileId,
    uploadId,
    fileName: file.name,
    roomId,
    size: file.size
  });
  
  // Upload each chunk in parallel (with concurrency limit)
  const uploadTasks = signedUrls.map((part, index) => async () => {
    const start = index * chunkSize;
    const end = Math.min(file.size, start + chunkSize);
    const chunk = file.slice(start, end);
    
    // Optional client-side encryption
    const encryptedChunk = await encryptionService.encryptChunk(chunk);
    
    // Upload the chunk directly to storage
    const response = await fetch(part.url, {
      method: 'PUT',
      body: encryptedChunk,
      headers: {
        'Content-Type': 'application/octet-stream'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload part ${part.partNumber}`);
    }
    
    // Get ETag from response headers
    const etag = response.headers.get('ETag');
    uploadedParts.push({ PartNumber: part.partNumber, ETag: etag });
    
    // Report progress
    const totalUploaded = uploadedParts.length * chunkSize;
    const percentage = Math.min(100, (totalUploaded / file.size) * 100);
    
    socketService.emit('file-upload-progress', {
      fileId,
      uploadId,
      bytesUploaded: totalUploaded,
      totalBytes: file.size,
      percentage
    });
    
    if (progressCallback) {
      progressCallback(percentage, totalUploaded, file.size);
    }
    
    return { partNumber: part.partNumber, etag };
  });
  
  // Execute uploads with controlled concurrency
  const results = await executeConcurrentTasks(uploadTasks, 5);
  
  // Complete the multipart upload
  await api.post('/files/complete-upload', {
    fileId,
    uploadId,
    parts: results.sort((a, b) => a.partNumber - b.partNumber)
  });
  
  // Notify of completion
  socketService.emit('file-upload-completed', {
    fileId,
    uploadId,
    roomId
  });
  
  return fileId;
}
```

### Integration with Redis for Upload State

```typescript
// Redis schema for upload tracking
const UPLOAD_SESSION_KEY = 'upload:{uploadId}';
const UPLOAD_PROGRESS_KEY = 'progress:{uploadId}';
const USER_UPLOADS_KEY = 'user:{userId}:uploads';
const ROOM_UPLOADS_KEY = 'room:{roomId}:uploads';

// Structure for upload session
interface UploadSession {
  id: string;
  fileId: string;
  key: string;
  fileName: string;
  size: number;
  chunkSize: number;
  chunkCount: number;
  uploadedChunks: number[];
  userId: string;
  roomId: string;
  storageId: string;
  startedAt: string;
  expiresAt: string;
  encryptionInfo?: {
    algorithm: string;
    keyId: string;
    iv: string;
  };
}

// Structure for upload progress
interface UploadProgress {
  bytesUploaded: number;
  percentage: number;
  uploadSpeed: number;
  lastUpdated: string;
  estimatedTimeRemaining: number;
}

// Updating upload progress in Redis
async function updateUploadProgress(uploadId: string, bytesUploaded: number, totalBytes: number) {
  const now = Date.now();
  const key = `progress:${uploadId}`;
  
  // Get previous progress to calculate speed
  const prevProgress = await redisClient.get(key);
  let uploadSpeed = 0;
  let lastUpdated = now;
  
  if (prevProgress) {
    const prev = JSON.parse(prevProgress);
    const timeDiff = (now - new Date(prev.lastUpdated).getTime()) / 1000; // seconds
    const bytesDiff = bytesUploaded - prev.bytesUploaded;
    
    if (timeDiff > 0) {
      uploadSpeed = bytesDiff / timeDiff; // bytes per second
    }
    
    lastUpdated = prev.lastUpdated;
  }
  
  const percentage = (bytesUploaded / totalBytes) * 100;
  const estimatedTimeRemaining = uploadSpeed > 0 
    ? Math.round((totalBytes - bytesUploaded) / uploadSpeed)
    : 0;
  
  const progress: UploadProgress = {
    bytesUploaded,
    percentage,
    uploadSpeed,
    lastUpdated: new Date(now).toISOString(),
    estimatedTimeRemaining
  };
  
  // Save progress to Redis
  await redisClient.set(key, JSON.stringify(progress), { EX: 86400 }); // 24 hour expiry
  
  return progress;
}
```

### WebSocket Integration for Real-Time Progress

```typescript
// Socket.io event handlers for file transfers
export function setupFileTransferHandlers(io: Server, socket: Socket) {
  // File upload started
  socket.on('file-upload-started', async (data: {
    fileId: string;
    uploadId: string;
    fileName: string;
    roomId: string;
    size: number;
  }) => {
    // Authenticate and authorize
    const user = await getUserFromSocket(socket);
    if (!user) return socket.emit('error', { message: 'Unauthorized' });
    
    // Join room-specific channel
    socket.join(`room:${data.roomId}`);
    
    // Log start of upload
    logger.info(`Upload started: ${data.fileName} by ${user.id} in room ${data.roomId}`);
    
    // Broadcast to room
    io.to(`room:${data.roomId}`).emit('file-upload-started', {
      ...data,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      startedAt: new Date().toISOString()
    });
  });
  
  // File upload progress
  socket.on('file-upload-progress', async (data: {
    fileId: string;
    uploadId: string;
    bytesUploaded: number;
    totalBytes: number;
  }) => {
    const user = await getUserFromSocket(socket);
    if (!user) return;
    
    // Get upload session
    const uploadSession = await getUploadSession(data.uploadId);
    if (!uploadSession || uploadSession.userId !== user.id) return;
    
    // Update progress in Redis
    const progress = await updateUploadProgress(
      data.uploadId,
      data.bytesUploaded,
      data.totalBytes
    );
    
    // Throttle broadcasts to avoid overwhelming clients
    const shouldBroadcast = await shouldThrottleBroadcast(data.uploadId);
    if (!shouldBroadcast) return;
    
    // Broadcast to room
    io.to(`room:${uploadSession.roomId}`).emit('file-upload-progress', {
      fileId: data.fileId,
      uploadId: data.uploadId,
      fileName: uploadSession.fileName,
      roomId: uploadSession.roomId,
      userId: user.id,
      bytesUploaded: data.bytesUploaded,
      totalBytes: data.totalBytes,
      percentage: progress.percentage,
      uploadSpeed: progress.uploadSpeed,
      estimatedTimeRemaining: progress.estimatedTimeRemaining
    });
  });
  
  // File upload completed
  socket.on('file-upload-completed', async (data: {
    fileId: string;
    uploadId: string;
    roomId: string;
  }) => {
    const user = await getUserFromSocket(socket);
    if (!user) return;
    
    // Clean up Redis data
    await cleanupUploadSession(data.uploadId);
    
    // Get file details from database
    const file = await fileService.getFileById(data.fileId);
    
    // Broadcast completion to room
    io.to(`room:${data.roomId}`).emit('file-added', {
      roomId: data.roomId,
      file
    });
    
    logger.info(`Upload completed: ${file.name} by ${user.id} in room ${data.roomId}`);
  });
}
```

## Optimizations for Large Files

1. **Adaptive Chunking**
   - Smaller chunks for unstable connections
   - Larger chunks for high-speed connections
   - Dynamic adjustment based on upload speeds

2. **Intelligent Retries**
   - Only retry failed chunks, not the entire file
   - Exponential backoff for retries
   - Circuit breaker to prevent endless retries

3. **Bandwidth Management**
   - Prioritize business-critical transfers
   - Background uploads for large archives
   - QoS policies for different file types

4. **Cache Strategy**
   - Cache frequently downloaded files
   - Pre-warm cache for anticipated downloads
   - Invalidate cache on file updates

## Monitoring and Observability

1. **Transfer Metrics**
   - Upload/download success rates
   - Transfer speeds by provider
   - Failure rates and types

2. **Storage Metrics**
   - Storage usage by provider
   - Cost optimization opportunities
   - Growth trends

3. **User Experience Metrics**
   - Time to first byte
   - Average transfer speeds
   - Abort/retry rates

## Scaling Considerations

1. **Horizontal Scaling**
   - Stateless API servers with shared Redis state
   - Socket.io with Redis adapter for multiple instances
   - Database connection pooling

2. **Throttling and Quotas**
   - Per-user upload/download limits
   - Company-wide bandwidth allocation
   - Time-based throttling during peak hours

3. **Regional Optimization**
   - Geo-distributed storage access
   - Edge caching for downloads
   - Regional upload endpoints