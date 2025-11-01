# Environment Setup & First Run

## Prerequisites

### Option A: Docker (Recommended - No extra deps)
- **Docker Desktop** 4.0+
- Works on: Windows, Mac, Linux
- Download: https://www.docker.com/products/docker-desktop

### Option B: Node.js Development
- **Node.js** 18.0+
- **npm** 9.0+
- Download: https://nodejs.org/

---

## Installation

### Step 1: Clone/Extract Project

```bash
# Extract sharesaas folder to your desired location
cd sharesaas
```

### Step 2: Choose Your Approach

#### **Approach A: Docker (Fastest)**

```bash
# Windows (PowerShell)
.\start.bat

# Or manually:
docker-compose up --build

# macOS/Linux
./start.sh
# Or manually:
docker-compose up --build
```

**Result:**
- Web: http://localhost:3000
- Signaling: ws://localhost:8080
- TURN: localhost:3478 + 5349

#### **Approach B: Node.js Development**

```bash
# Terminal 1: Install and start signaling
cd apps/signaling
npm install
npm start

# Terminal 2: Install and start web app
cd apps/web
npm install
npm run dev
```

**Result:**
- Web: http://localhost:3000
- Signaling: ws://localhost:8080
- TURN: Not running (for LAN only)

---

## Verify Installation

### Check Services Running

```bash
# Docker
docker-compose ps

# Should show:
# p2p-share-web        running (port 3000)
# p2p-share-signaling  running (port 8080)
# p2p-share-turn       running (port 3478, 5349)
```

### Health Check

```bash
# Test signaling server
curl http://localhost:8080/health

# Expected response:
# {"ok":true,"timestamp":"2024-01-15T10:30:45.123Z"}
```

### Access Web App

Open in browser:
- **Device A (Sender)**: http://localhost:3000
- **Device B (Receiver)**: http://<Your-IP>:3000 (same Wi-Fi)

---

## First Transfer Test

### Step 1: On Device A (Sender)
1. Open http://localhost:3000
2. Click **"Send Files"**
3. Copy the 6-digit code shown
4. Select any file (e.g., test.txt)

### Step 2: On Device B (Receiver)
1. Open http://<Device-A-IP>:3000 (or scan QR)
2. Click **"Receive Files"**
3. Enter the 6-digit code
4. Accept transfer

### Step 3: Monitor Transfer
- See progress bar on both devices
- Watch speed, ETA, file size
- File saves to Downloads on receiver
- See "✓ Verified" when done

---

## Troubleshooting Installation

### Problem: "Docker not found"
```bash
# Install Docker Desktop first
# https://www.docker.com/products/docker-desktop

# Verify after install
docker --version
docker-compose --version
```

### Problem: "Port 3000 already in use"
```bash
# Find what's using port 3000
sudo lsof -i :3000

# Kill it
sudo kill -9 <PID>

# Or use different port
docker-compose up -p 3001
```

### Problem: "Node modules missing"
```bash
# Reinstall dependencies
cd apps/web
rm -rf node_modules package-lock.json
npm install

cd ../signaling
rm -rf node_modules package-lock.json
npm install
```

### Problem: "WebSocket connection refused"
```bash
# Check signaling server is running
curl http://localhost:8080/health

# If not, restart
docker-compose restart signaling
# OR
cd apps/signaling && npm start
```

### Problem: "Files not received"
- [ ] Both devices on same Wi-Fi? ✓
- [ ] Browser console shows errors? Check
- [ ] Firewall blocking port 8080? Allow
- [ ] Try TURN relay? Uncomment in docker-compose.yml

---

## Common Commands

```bash
# Start services
docker-compose up -d

# View logs
docker-compose logs -f signaling

# Restart specific service
docker-compose restart web

# Stop all
docker-compose down

# Clean everything
docker-compose down -v

# Update packages (Node.js mode)
cd apps/web && npm update
cd ../signaling && npm update
```

---

## File Size Test Cases

### Small File (< 1 MB)
- Expected: Instant (~1 sec)
- Good for: Testing connection
- Command: `echo "test" > test.txt && # transfer`

### Medium File (100 MB)
- Expected: 5-30 sec (LAN)
- Good for: Typical use case
- Command: `dd if=/dev/urandom of=test-100mb.bin bs=1M count=100`

### Large File (1 GB)
- Expected: 1-3 min (LAN)
- Good for: Performance test
- Command: `dd if=/dev/urandom of=test-1gb.bin bs=1G count=1`

### Multiple Files (10 x 100 MB)
- Expected: Sequential transfer
- Good for: Queue testing
- Command: `for i in {1..10}; do dd if=/dev/urandom of=test-$i.bin bs=1M count=100; done`

---

## Network Configurations

### Configuration 1: Local LAN
```
Device A ──┐
           ├─ WiFi Router ─ Direct P2P
Device B ──┘

Speed: 100+ Mbps
Latency: < 5 ms
Signaling: HTTP (unencrypted ok)
```

### Configuration 2: Hotspot
```
Device A (Hotspot on) ─── Connection point
                         │
Device B (Connected) ────┘
         
Speed: 20-50 Mbps (hotspot limited)
Latency: 5-20 ms
Signaling: HTTP (local)
```

### Configuration 3: Internet (TURN)
```
Device A (Internet 1)     Device B (Internet 2)
         │                        │
    ┌────┴─┐                ┌────┴──┐
    │      │                │       │
    │   TURN Server         │       │
    │      │                │       │
    └────┬─┘                └────┬──┘

Speed: 5-50 Mbps (TURN limited)
Latency: 50-200 ms
Signaling: WSS (encrypted)
```

---

## Performance Optimization

### For Best Speed
1. Use **same Wi-Fi network** (avoids TURN)
2. Close other apps (free up bandwidth)
3. Disable VPN (removes encryption overhead)
4. Use **5 GHz WiFi** (faster than 2.4 GHz)
5. Wired connection (most stable)

### Chunk Size Tuning
Edit `apps/web/src/app/page.tsx` line ~200:
```typescript
const chunkSize = 64 * 1024;  // 64 KB default

// For fast networks (1+ Gbps):
const chunkSize = 256 * 1024;  // 256 KB

// For slow networks (< 10 Mbps):
const chunkSize = 16 * 1024;   // 16 KB
```

---

## Monitoring During Use

### Terminal: View Logs
```bash
# All services
docker-compose logs -f

# Realtime stats
docker stats
```

### Browser Console
- Press **F12** to open DevTools
- Check Console tab for JS errors
- Network tab shows WebRTC stats

### Signaling Stats
```bash
# See active sessions
curl http://localhost:8080/stats

# Response example:
# {"active_rooms":2,"timestamp":"2024-01-15T10:30:45.123Z"}
```

---

## Next: Production Setup

After confirming it works locally:

1. **Read**: `docs/DEPLOYMENT.md`
2. **Configure**: Domain, SSL certificates
3. **Deploy**: To cloud or self-hosted
4. **Monitor**: Setup logging & alerts
5. **Secure**: Update TURN credentials

---

## Support Resources

- **Quick Help**: See QUICKSTART.md
- **Full Docs**: See README.md
- **Architecture**: See docs/ARCHITECTURE.md
- **Deploy**: See docs/DEPLOYMENT.md
- **Errors**: Check browser console & docker logs

---

**You're all set!** 🎉

**Next step:** Open http://localhost:3000 and try transferring a file.

Questions? Check the docs folder or browser console for errors.
