# Quick Start Guide - 5 Minutes

## ⚡ Super Fast Setup (Windows)

### Method 1: Docker (Easiest)

```bash
# 1. Install Docker Desktop: https://www.docker.com/products/docker-desktop
# 2. Open PowerShell in sharesaas folder
# 3. Run:

.\start.bat
# OR
docker-compose up --build

# 4. Open browser:
# Device A: http://localhost:3000
# Device B: http://<Device-A-IP>:3000 (on same Wi-Fi)
```

**Done! Files transfer directly. No cloud, no storage.**

---

### Method 2: Node.js (Dev Mode)

**Prerequisites:** Node.js 18+

```powershell
# Terminal 1:
cd apps/signaling
npm install
npm start

# Terminal 2:
cd apps/web
npm install
npm run dev

# Browser: http://localhost:3000
```

---

## 📱 How to Use

### Sender (Device A)
1. Click **"Send Files"**
2. Get 6-digit code or scan QR
3. Share code with receiver
4. Select files
5. Watch transfer (shows speed, ETA, %)
6. Done ✓

### Receiver (Device B)
1. Click **"Receive Files"**
2. Enter 6-digit code or scan QR
3. Files save to Downloads
4. Verify checksum automatically
5. Done ✓

---

## 🔧 Key Features

✅ **No Storage** - Files transferred directly, never stored  
✅ **No Registration** - Just a 6-digit code  
✅ **Fast** - LAN speeds (100+ Mbps)  
✅ **Secure** - DTLS encrypted, E2E  
✅ **Resume** - SHA-256 verification  
✅ **Mobile** - Works on iOS/Android/Desktop  

---

## 🚨 Troubleshooting

### "Can't connect"
- [ ] Both devices on same Wi-Fi? ✓
- [ ] Same hotspot? ✓
- [ ] Firewall disabled? ✓
- [ ] Correct code? ✓

### "Hash mismatch"
- Retry transfer
- Check network stability
- Try TURN: `docker-compose.yml` - uncomment TURN config

### "Peer disconnected"
- Keep app in foreground
- Don't switch networks
- Stay on same Wi-Fi

---

## 📊 Performance

| Setup | Speed |
|-------|-------|
| Local LAN | 100+ Mbps |
| Hotspot | 20-50 Mbps |
| TURN relay | 5-20 Mbps |

---

## 📚 More Info

- **Full Docs**: See `README.md`
- **Architecture**: See `docs/ARCHITECTURE.md`
- **Deployment**: See `docs/DEPLOYMENT.md`
- **Logs**: `docker-compose logs -f`

---

**Questions?** Open an issue or check docs folder.

**Let's share files the right way.** 🚀
