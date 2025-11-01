# File Transfer Testing Guide

## What I've Fixed

### 1. **Added Comprehensive Logging**
   - Every WebRTC connection step now logs to console
   - ICE connection state tracking
   - Data channel state tracking
   - File transfer progress logging

### 2. **Fixed QR Code URL**
   - Already set to port 3001: `http://[hostname]:3001?code=[6-digit-code]`

### 3. **Fixed ICE Candidate Handling**
   - ICE candidates now properly sent via signaling
   - Added connection state change handlers

### 4. **Mobile Responsive Design**
   - Touch-friendly buttons (min 48px height)
   - Responsive font sizes and padding
   - Proper viewport meta tags
   - File names wrap properly on small screens

## How to Test

### Step 1: Open Browser Console
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Keep it open during testing

### Step 2: Sender Device
1. Click "📤 Send Files"
2. **Watch console** for:
   ```
   🔗 Creating session...
   ✅ Session created with code: XXXXXX
   🔗 Initializing RTCPeerConnection
   ```
3. Share the 6-digit code or QR with receiver

### Step 3: Receiver Device
1. Click "📥 Receive Files"
2. Enter the 6-digit code (or scan QR)
3. Click "Join"
4. **Watch console** for:
   ```
   🔗 Joining session: XXXXXX
   ✅ Joined session successfully
   🎯 Peer joined! Creating data channel...
   🔗 Wiring data channel...
   ✅ Data channel OPEN. Ready to transfer!
   ```

### Step 4: Send Files (Sender Side)
1. Click "Tap to select files" area
2. Choose file(s)
3. **Watch console** for:
   ```
   📤 handleSendFiles called
   Files selected: X
   Peer connected: true
   Data channel state: open
   🎯 Data channel is open, starting transfer
   📤 Starting to send file: [filename]
   📝 File hash computed: [hash]
   ✅ Sent file_info
   📤 Sent X chunks (XX/XX bytes)
   ✅ All chunks sent
   ✅ File transfer complete: [filename]
   ```

### Step 5: Receive Files (Receiver Side)
**Watch console** for:
```
📩 Received message: file_info
📁 Starting to receive file: [filename] Size: XXXXX bytes
📥 Chunk received: 16384 bytes (16384/XXXXX)
📥 Chunk received: 16384 bytes (32768/XXXXX)
...
✅ All chunks received, finalizing...
💾 Finalizing file download: [filename]
📦 Created blob: XXXXX bytes
✅ File downloaded successfully
```

## Troubleshooting

### If "Peer not connected" error:
**Check console for:**
- `❌ ICE connection state: failed` → Network/firewall issue
- `❌ WebRTC connection state: failed` → Try refreshing both devices
- `❌ Data channel ERROR` → Connection dropped

### If "Data channel not ready" error:
**Check console for:**
- `Data channel state: connecting` → Wait a few seconds
- `Data channel state: closed` → Connection lost, reset and retry
- No data channel logs → WebRTC connection failed

### If files selected but not transferring:
**Check sender console for:**
- `📤 handleSendFiles called` → Handler triggered
- `Peer connected: false` → Receiver not connected
- `Data channel state: [not open]` → Connection not ready
- `❌ No data channel` → Data channel not created

### If connection takes too long:
1. Both devices on same network? (WiFi/LAN)
2. Firewall blocking WebRTC?
3. Try refreshing both pages
4. Check if signaling server is running on port 8080

## Expected Console Output (Success)

### Sender Console:
```
🔗 Creating session...
✅ Session created with code: ABC123
🔗 Initializing RTCPeerConnection
🎯 Peer joined! Creating data channel...
🔗 Wiring data channel...
✅ Data channel OPEN. Ready to transfer!
📤 handleSendFiles called
📤 Starting to send file: test.pdf
✅ Sent file_info
📤 Sent 50 chunks (819200/1048576 bytes)
✅ All chunks sent (64 total)
✅ File transfer complete: test.pdf
```

### Receiver Console:
```
🔗 Joining session: ABC123
✅ Joined session successfully
📩 Received signal: offer
🔗 Wiring data channel...
✅ Data channel OPEN. Ready to transfer!
📩 Received message: file_info
📁 Starting to receive file: test.pdf Size: 1048576 bytes
📥 Chunk received: 16384 bytes (16384/1048576)
...
✅ All chunks received, finalizing...
💾 Finalizing file download: test.pdf
✅ File downloaded successfully
```

## Common Issues & Solutions

| Issue | Check Console For | Solution |
|-------|------------------|----------|
| "Peer not connected" | ICE connection state | Refresh both devices, check network |
| "Data channel not ready" | Data channel state | Wait 2-3 seconds, ensure receiver joined |
| Files not sending | handleSendFiles logs | Check peerConnected and DC state |
| Slow transfer | Chunk logs frequency | Normal for large files, check network speed |
| Download not starting | finalizeFileReceive logs | Browser may block, check permissions |

## Network Requirements

- **Signaling Server**: Port 8080 (WebSocket)
- **Web App**: Port 3001 (HTTP)
- **WebRTC**: UDP ports for P2P (handled by browser)
- **STUN Server**: stun.l.google.com:19302 (for NAT traversal)

## Mobile Testing Tips

1. **Same WiFi**: Ensure both devices on same network
2. **QR Code**: Use phone camera or QR scanner app
3. **Touch Targets**: All buttons are 48px+ for easy tapping
4. **Screen Size**: UI adapts from 320px to 1920px width
5. **Portrait Mode**: Works best in portrait on mobile

## Performance Notes

- **Chunk Size**: 16KB per chunk
- **Backpressure**: Waits if buffer > 64KB
- **Progress**: Updates every chunk received
- **Speed**: Depends on network (typically 1-10 MB/s on WiFi)
