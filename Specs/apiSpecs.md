# File Transfer API Specification

This document outlines the API endpoints for the File Transfer application, organized by domain.

## Table of Contents

- [Authentication API](#authentication-api)
- [User Management API](#user-management-api)
- [Company Management API](#company-management-api)
- [Company Members API](#company-members-api)
- [Guest Management API](#guest-management-api)
- [Room Management API](#room-management-api)
- [Room Access API](#room-access-api)
- [File Management API](#file-management-api)
- [File Sharing API](#file-sharing-api)
- [File Versions API](#file-versions-api)
- [Storage Management API](#storage-management-api)
- [OAuth Integration API](#oauth-integration-api)
- [Subscription and Billing API](#subscription-and-billing-api)
- [WebSocket Events API](#websocket-events-api)
- [Public File Sharing API](#public-file-sharing-api)
- [System Status API](#system-status-api)
- [Common Patterns](#common-patterns)

## Authentication API

Base Path: `/api/auth`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/login` | POST | Login with Auth0 token | `{ idToken: string }` | `{ user, token, expiresIn }` |
| `/me` | GET | Get current user profile | - | `{ user }` |
| `/logout` | POST | Invalidate session | - | `{ success: true }` |

## User Management API

Base Path: `/api/users`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/profile` | GET | Get user profile | - | `{ user }` |
| `/profile` | PATCH | Update user profile | `{ firstName?, lastName?, ... }` | `{ user }` |
| `/avatar` | POST | Upload profile picture | `FormData (file)` | `{ avatarUrl }` |

## Company Management API

Base Path: `/api/companies`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List user's companies | - | `{ companies: [...] }` |
| `/` | POST | Create new company | `{ name, email, ... }` | `{ company }` |
| `/:id` | GET | Get company details | - | `{ company }` |
| `/:id` | PATCH | Update company | `{ name?, email?, ... }` | `{ company }` |
| `/:id/settings` | GET | Get company settings | - | `{ settings }` |
| `/:id/settings` | PATCH | Update company settings | `{ trackDownloads?, maxFileSize?, ... }` | `{ settings }` |
| `/:id/logo` | POST | Upload company logo | `FormData (file)` | `{ logoUrl }` |
| `/:id/members` | GET | List company members | - | `{ members: [...] }` |

## Company Members API

Base Path: `/api/companies/:companyId/members`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | POST | Invite user to company | `{ email, role }` | `{ invitation }` |
| `/:userId` | PATCH | Update member role | `{ role }` | `{ success: true }` |
| `/:userId` | DELETE | Remove member | - | `{ success: true }` |

## Guest Management API

Base Path: `/api/companies/:companyId/guests`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List company guests | - | `{ guests: [...] }` |
| `/` | POST | Add guest to company | `{ email, firstName, lastName }` | `{ guest }` |
| `/:guestId` | GET | Get guest details | - | `{ guest }` |
| `/:guestId` | DELETE | Remove guest | - | `{ success: true }` |

## Room Management API

Base Path: `/api/rooms`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List accessible rooms | `{ companyId? }` | `{ rooms: [...] }` |
| `/` | POST | Create new room | `{ name, companyId, roomType, ... }` | `{ room }` |
| `/:id` | GET | Get room details | - | `{ room }` |
| `/:id` | PATCH | Update room | `{ name?, accessLevel?, ... }` | `{ room }` |
| `/:id` | DELETE | Delete room | - | `{ success: true }` |
| `/:id/lock` | POST | Lock room | - | `{ success: true, locked: true }` |
| `/:id/unlock` | POST | Unlock room | - | `{ success: true, locked: false }` |

## Room Access API

Base Path: `/api/rooms/:roomId/access`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List room members | - | `{ members: [...] }` |
| `/` | POST | Add member to room | `{ userId, accessType }` | `{ access }` |
| `/:userId` | PATCH | Update member access | `{ accessType }` | `{ access }` |
| `/:userId` | DELETE | Remove member | - | `{ success: true }` |

## File Management API

Base Path: `/api/files`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List files (with filtering) | `{ roomId?, folderId? }` | `{ files: [...] }` |
| `/upload-url` | POST | Get upload URL | `{ fileName, roomId, storageId?, size, ... }` | `{ uploadUrl, fileId, ... }` |
| `/complete-upload` | POST | Complete upload | `{ fileId, uploadId?, parts? }` | `{ file }` |
| `/folders` | POST | Create folder | `{ name, roomId, parentId? }` | `{ folder }` |
| `/:id` | GET | Get file details | - | `{ file }` |
| `/:id` | PATCH | Update file | `{ name?, parentId?, ... }` | `{ file }` |
| `/:id` | DELETE | Delete file | - | `{ success: true }` |
| `/:id/download-url` | GET | Get download URL | - | `{ downloadUrl, expiresAt }` |

## File Sharing API

Base Path: `/api/files/:fileId/shares`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List file shares | - | `{ shares: [...] }` |
| `/` | POST | Create file share | `{ expiresAt?, maxDownloads? }` | `{ share }` |
| `/:shareId` | GET | Get share details | - | `{ share }` |
| `/:shareId` | PATCH | Update share | `{ expiresAt?, maxDownloads? }` | `{ share }` |
| `/:shareId` | DELETE | Delete share | - | `{ success: true }` |

## File Versions API

Base Path: `/api/files/:fileId/versions`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List file versions | - | `{ versions: [...] }` |
| `/:versionId` | GET | Get specific version | - | `{ version }` |
| `/:versionId/download-url` | GET | Get version download URL | - | `{ downloadUrl, expiresAt }` |
| `/:versionId/restore` | POST | Restore to version | - | `{ file }` |

## Storage Management API

Base Path: `/api/storage`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/` | GET | List storage accounts | `{ companyId }` | `{ storageAccounts: [...] }` |
| `/` | POST | Add storage account | `{ name, companyId, storageType, credentials }` | `{ storageAccount }` |
| `/:id` | GET | Get storage details | - | `{ storageAccount }` |
| `/:id` | PATCH | Update storage | `{ name?, isDefault? }` | `{ storageAccount }` |
| `/:id` | DELETE | Delete storage | - | `{ success: true }` |
| `/:id/test` | POST | Test connection | - | `{ success: true, message? }` |
| `/:id/credentials` | PATCH | Update credentials | `{ credentials }` | `{ success: true }` |
| `/:id/stats` | GET | Get storage stats | - | `{ stats }` |

## OAuth Integration API

Base Path: `/api/oauth`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/google/authorize` | GET | Start Google OAuth flow | - | Redirect to Google |
| `/google/callback` | GET | Google OAuth callback | - | Redirect with token |
| `/dropbox/authorize` | GET | Start Dropbox OAuth flow | - | Redirect to Dropbox |
| `/dropbox/callback` | GET | Dropbox OAuth callback | - | Redirect with token |
| `/:provider/token` | POST | Store OAuth token | `{ code, companyId }` | `{ success: true, storageId }` |

## Subscription and Billing API

Base Path: `/api/subscriptions`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/plans` | GET | List available plans | - | `{ plans: [...] }` |
| `/company/:companyId` | GET | Get company subscription | - | `{ subscription }` |
| `/company/:companyId` | POST | Create subscription | `{ planId, paymentMethod }` | `{ subscription }` |
| `/company/:companyId` | PATCH | Update subscription | `{ planId? }` | `{ subscription }` |
| `/company/:companyId/cancel` | POST | Cancel subscription | `{ reason? }` | `{ subscription }` |
| `/payment-methods` | GET | List payment methods | - | `{ paymentMethods: [...] }` |
| `/payment-methods` | POST | Add payment method | `{ paymentMethod }` | `{ paymentMethod }` |
| `/invoices` | GET | List invoices | `{ companyId? }` | `{ invoices: [...] }` |
| `/invoices/:id` | GET | Get invoice | - | `{ invoice }` |

## WebSocket Events API

Connection: `/socket.io`

| Event | Direction | Description | Payload |
|-------|-----------|-------------|---------|
| `connect` | Client → Server | Establish connection | `{ token }` |
| `disconnect` | Client → Server | Close connection | - |
| `join-room` | Client → Server | Join a room | `{ roomId, userId }` |
| `leave-room` | Client → Server | Leave a room | `{ roomId, userId }` |
| `user-joined` | Server → Client | User joined room | `{ roomId, userId, userName }` |
| `user-left` | Server → Client | User left room | `{ roomId, userId }` |
| `lock-room` | Client → Server | Lock a room | `{ roomId, userId }` |
| `unlock-room` | Client → Server | Unlock a room | `{ roomId, userId }` |
| `room-locked` | Server → Client | Room was locked | `{ roomId, lockedBy }` |
| `room-unlocked` | Server → Client | Room was unlocked | `{ roomId, unlockedBy }` |
| `close-room` | Client → Server | Close a room | `{ roomId, userId }` |
| `room-closed` | Server → Client | Room was closed | `{ roomId, closedBy }` |
| `file-upload-started` | Client → Server | File upload started | `{ roomId, fileId, fileName, size }` |
| `file-upload-progress` | Client → Server | Upload progress | `{ roomId, fileId, progress }` |
| `file-upload-completed` | Client → Server | Upload completed | `{ roomId, fileId }` |
| `file-upload-failed` | Client → Server | Upload failed | `{ roomId, fileId, error }` |
| `file-added` | Server → Client | New file in room | `{ roomId, file }` |
| `file-updated` | Server → Client | File was updated | `{ roomId, file }` |
| `file-deleted` | Server → Client | File was deleted | `{ roomId, fileId }` |
| `error` | Server → Client | Error occurred | `{ code, message }` |

## Public File Sharing API

Base Path: `/api/public`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/shares/:token` | GET | Get shared file info | - | `{ file }` |
| `/shares/:token/download` | GET | Download shared file | - | File download |
| `/shares/:token/password` | POST | Submit password | `{ password }` | `{ success: true, downloadUrl? }` |

## System Status API

Base Path: `/api`

| Endpoint | Method | Description | Request Body | Response |
|----------|--------|-------------|--------------|----------|
| `/health` | GET | System health check | - | `{ status, version }` |
| `/status` | GET | Service status | - | `{ database, cache, services }` |

## Common Patterns

### API Response Formats

#### Success Response Format

```json
{
  "success": true,
  "data": {
    // Resource-specific data
  },
  "message": "Optional success message",
  "meta": {
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 100,
      "pages": 10
    }
  }
}
```

#### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      // Additional error details
    }
  }
}
```

### Common Error Codes

- `UNAUTHORIZED`: Authentication required
- `FORBIDDEN`: Permission denied
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Input validation failed
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `RESOURCE_CONFLICT`: Resource already exists
- `STORAGE_ERROR`: Storage operation failed
- `PAYMENT_REQUIRED`: Subscription issue
- `SERVER_ERROR`: Internal server error

### API Versioning

The API supports versioning through the URL path (e.g., `/api/v1/resource`) or Accept header (`Accept: application/vnd.filetransfer.v1+json`).

### Request Query Parameters

- **Pagination**: `?page=1&limit=20`
- **Sorting**: `?sort=fieldName&order=asc`
- **Filtering**: `?fieldName=value&otherField=value`
- **Search**: `?search=term`
- **Include relations**: `?include=relation1,relation2`

### Rate Limiting

- Standard endpoints: 100 requests per minute
- Authentication endpoints: 10 requests per minute
- File upload/download: 60 requests per minute
- WebSocket connections: 10 connections per user