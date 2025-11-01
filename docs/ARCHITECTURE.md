# P2P Share - Architecture & Design

## Overview

P2P Share is a **zero-storage file sharing system** where:
1. **No files are stored** on any server
2. **All data is ephemeral** - exists only during active transfer
3. **Point-to-point** transfer via WebRTC data channels
4. **Encrypted by default** via DTLS (WebRTC's built-in encryption)

## Data Flow

```
┌─────────────────────────────────────────┐
│ Sender                                  │
│ 1. Create Session (6-digit code + QR)   │
│ 2. Share code with receiver             │
│ 3. Wait for peer to join                │
└────────────────────┬────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ Signaling Server (WSS) │ ◄─ Ephemeral only
        │ - Code registry        │    (expires 5 min)
        │ - SDP exchange         │
        │ - ICE candidates       │
        │ - Session metadata     │
        └────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │ NAT Traversal          │
        │ 1. Try direct P2P      │
        │ 2. STUN (if fails)     │
        │ 3. TURN relay (backup) │
        └────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ Data Transfer (WebRTC Data Channel)     │
│ - DTLS encrypted end-to-end             │
│ - File chunks (64KB default)            │
│ - Metadata: name, size, hash            │
│ - Progress tracking                     │
│ - Resume support (byte offset)          │
│ - SHA-256 integrity check               │
└─────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────┐
│ Receiver                                │
│ 1. Verify hash matches sender's         │
│ 2. Save to local storage (Downloads)    │
│ 3. Session auto-terminates              │
│ 4. No logs of file content              │
└─────────────────────────────────────────┘
```

## Component Details

### 1. Signaling Server (Node.js + WebSocket)

**Responsibilities:**
- Register sessions with 6-digit codes
- Exchange WebRTC SDP (Session Description Protocol)
- Relay ICE candidates for NAT traversal
- Clean up expired sessions
- Rate limiting & abuse prevention

**What it stores:**
- Session ID (ephemeral, expires in 5 min)
- WebRTC negotiation data (SDP/ICE)
- Client IP (for rate limiting & logging)

**What it NEVER stores:**
- File names or content
- User data or metadata
- Persistent state

**Architecture:**
```
Express HTTP Server
├─ GET /health              (Kubernetes probes)
├─ GET /stats               (Active sessions count)
└─ WebSocket /              (Signaling messages)
   ├─ create                (Start session)
   ├─ join                  (Enter code)
   ├─ signal                (SDP/ICE exchange)
   └─ ping                  (Keep-alive)
```

### 2. Web Frontend (Next.js + React)

**Responsibilities:**
- User interface (Send/Receive modes)
- WebRTC peer connection management
- File selection & transfer queue
- Progress tracking & ETA calculation
- Hash computation & verification
- Screen wake lock during transfer

**Key Hooks & Functions:**
- `useSignaling()` - WebSocket connection + code exchange
- `computeFileSha256()` - Stream-based SHA-256 hashing
- `wireDataChannel()` - Handle incoming file chunks
- `startSending()` - Queue & send files with backpressure

**No Data Stored:**
- Files never written to disk
- Only RAM for chunked transfer
- Local caching only (temp during session)

### 3. TURN Relay Server (coturn)

**Responsibilities:**
- Fallback when direct P2P can't connect
- Relay audio/video or data between peers
- NAT traversal for restrictive networks

**Protocols:**
- STUN (discovery, port mapping)
- TURN (relay server - UDP, TCP, TLS/DTLS on 443)

**No Storage:**
- Packets pass through, never stored
- Connection-oriented (like a VPN tunnel)
- Stateless relay

## Data Transfer Protocol

### File Metadata
```json
{
  "type": "file_meta",
  "fileId": "abc123",
  "name": "document.pdf",
  "size": 1048576,
  "hash": "sha256_hex_digest"
}
```

### Chunked Data
- **Chunk size**: 64 KB (configurable)
- **Encoding**: Binary ArrayBuffer via WebRTC
- **Backpressure**: Pause sending if `bufferedAmount` exceeds 1 MB
- **Ordering**: Guaranteed (WebRTC `ordered: true`)

### Completion Signal
```json
{
  "type": "file_complete",
  "fileId": "abc123"
}
```

### Verification Flow
1. Receiver collects all chunks
2. Computes SHA-256 on full file
3. Compares against sender's hash
4. If match: save file
5. If mismatch: delete & show error

## Security Architecture

### Encryption Layers

**Layer 1: WebRTC DTLS (Mandatory)**
- RFC 6347 Datagram TLS
- 256-bit AES-GCM by default
- Automatic key exchange via WebRTC APIs
- Prevents middleman attacks

**Layer 2: Optional Client-Side (Planned)**
- AES-GCM or ChaCha20-Poly1305
- Client holds encryption key
- Server-side blind (can't decrypt even if intercepted)

### Authentication
- **Code**: Random 6-digit code (unlikely collision)
- **Session ID**: 128-bit hex string
- **Ephemeral**: Expires 5 minutes after generation
- **No passwords**: Code is sufficient for P2P use case

### Authorization
- Any device with the code can join
- No user accounts (P2P, not multi-user)
- IP-based rate limiting to prevent abuse

### Privacy
- **No logs of file content**: Only metadata
- **No IP logging**: Only for rate limiting (ephemeral)
- **No persistent state**: In-memory, destroyed on restart
- **No cloud backups**: Everything local

## Resilience & Error Handling

### Reconnection Logic
- If WebSocket closes: auto-reconnect with exponential backoff
- If P2P data channel closes: attempt re-establish
- If TURN connection fails: fallback to STUN or direct
- Session resumable by byte offset (planned)

### Integrity Checks
- SHA-256 hash before/after transfer
- Checksum per file (not per chunk)
- Automatic retry on mismatch
- User sees "Verified ✓" or "Hash mismatch ✗"

### Backpressure & Flow Control
- `bufferedAmountLowThreshold`: 1 MB
- Event listener: `bufferedamountlow` resumes sending
- Prevents memory overflow on slow networks

### Timeout & Keep-Alive
- Session TTL: 5 minutes
- Heartbeat ping every 30 seconds
- Connection drops after 3 failed pings

## Performance Characteristics

### Local LAN (Direct P2P)
- **Speed**: 100+ Mbps (theoretical: 1 Gbps)
- **Latency**: 1-10 ms
- **Efficiency**: 95%+ utilization

### Internet with TURN
- **Speed**: 5-50 Mbps (depends on relay)
- **Latency**: 50-200 ms
- **Efficiency**: 60-80% (relay overhead)

### Mobile (5G/4G)
- **Speed**: 10-100 Mbps
- **Latency**: 20-100 ms
- **Sensitivity**: Subject to network switches, backgrounding

## Scalability

### Horizontal Scaling
- **Signaling server**: Stateless → Add more behind load balancer
- **Web frontend**: Static build → Serve via CDN
- **TURN relay**: CPU-intensive → Need multiple for high load

### Vertical Scaling
- **Signaling**: Low resource (I/O bound)
  - Typical: 1-2 cores, 128-256 MB RAM
  - Can handle 10,000+ concurrent sessions
- **Web**: Build-time only, negligible runtime
- **TURN**: CPU-intensive
  - Typical: 4+ cores, 2-4 GB RAM
  - Bandwidth = active transfers

### Connection Pooling
- Currently: No connection pooling (stateless)
- Future: Redis for distributed state if needed

## Deployment Models

### Edge (Cloudflare Workers)
- Signaling only (lightweight)
- TURN must be on dedicated server

### Serverless (AWS Lambda)
- Not suitable (needs long-lived WebSocket)
- Could use API Gateway WebSocket API

### Docker Containers
- Recommended current approach
- Easy scaling with Kubernetes

### Monolithic VM
- Works fine for single deployment
- Simple setup for self-hosted

## Future Enhancements

### Encryption
- [ ] Client-side AES-GCM toggle
- [ ] QR-based key exchange
- [ ] PAKE (Password-Authenticated Key Exchange)

### Features
- [ ] Pause/resume transfers
- [ ] Parallel multi-file transfer
- [ ] Folder compression & transfer
- [ ] Video preview on receiver
- [ ] Clipboard sharing

### Observability
- [ ] Prometheus metrics export
- [ ] Grafana dashboards
- [ ] Distributed tracing (OpenTelemetry)
- [ ] Real-time analytics

### Performance
- [ ] Adaptive bitrate (tune chunk size by network)
- [ ] Compression pre-transfer
- [ ] Delta sync (only changed bytes)
- [ ] Connection pooling / session persistence

### Compliance
- [ ] GDPR: Right to deletion (auto-expire)
- [ ] SOC 2: Audit logs
- [ ] HIPAA: Encryption + compliance mode
- [ ] Data residency: Regional deployment options
