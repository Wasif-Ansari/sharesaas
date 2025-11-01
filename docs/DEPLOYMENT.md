# P2P Share - Deployment Guide

## Single-Device Testing (Mac/Linux/Windows)

### Using Localhost with Port Forwarding

```bash
# Terminal 1: Start services
docker-compose up

# Terminal 2: Simulate Device B on same machine
# Browser 1 (Device A): http://localhost:3000
# Browser 2 (Device B): http://localhost:3001 (if you want separate)
# OR use private browsing/incognito for both
```

## Multi-Device Testing (LAN)

### Find Your Local IP

**macOS/Linux:**
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

**Windows:**
```powershell
ipconfig | findstr "IPv4"
```

### Setup

1. **Device A (Sender/Server):**
   ```bash
   docker-compose up
   # Note your local IP: e.g., 192.168.1.100
   ```

2. **Device B (Receiver):**
   - Open browser: `http://192.168.1.100:3000`
   - Or scan QR on Device A
   - Click "Receive Files"

3. **Transfer:**
   - Device A: Click "Send Files" → Copy code → Select files
   - Device B: Enter code → Receive files

## Hotspot Testing

### Windows Hotspot (Sender)

```powershell
# Settings → Network & Internet → Mobile hotspot → Turn On
# Run Docker on this device
docker-compose up

# Share hotspot SSID and password
```

### iOS/Android (Receiver)

1. Connect to hotspot
2. Open browser: `http://<Hotspot-Device-IP>:3000`
3. Scan QR or enter code
4. Receive files

## Production Deployment

### AWS EC2

```bash
# 1. Launch t2.micro instance (Ubuntu 22.04)
# 2. SSH into instance
ssh -i your-key.pem ec2-user@your-instance.com

# 3. Install Docker & Docker Compose
sudo apt update && sudo apt install -y docker.io docker-compose

# 4. Clone repo
git clone https://github.com/yourusername/saas-p2p.git
cd saas-p2p

# 5. Configure domain (update docker-compose.yml)
nano docker-compose.yml
# Change: NEXT_PUBLIC_SIGNALING_URL=ws://your-domain.com

# 6. Start services
sudo docker-compose up -d

# 7. Setup reverse proxy with Nginx (optional)
sudo apt install -y nginx
# Configure nginx to proxy :3000 and :8080
```

### Azure Container Instances

```bash
# Create resource group
az group create --name saas-p2p --location eastus

# Deploy container group
az container create \
  --resource-group saas-p2p \
  --name p2p-share \
  --image docker-compose-image \
  --ports 3000 8080 \
  --environment-variables \
    NEXT_PUBLIC_SIGNALING_URL=ws://your-domain.com

# Get public IP
az container show --resource-group saas-p2p --name p2p-share --query ipAddress.fqdn
```

### Kubernetes (k8s)

See `k8s/` folder for deployment manifests.

```bash
# Apply manifests
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/signaling-deployment.yaml
kubectl apply -f k8s/web-deployment.yaml
kubectl apply -f k8s/turn-deployment.yaml

# Check status
kubectl get pods -n saas-p2p
kubectl logs -n saas-p2p -l app=signaling -f
```

## Performance Testing

### Load Testing Signaling Server

```bash
# Using Apache Bench
ab -n 1000 -c 100 http://localhost:8080/health

# Using wrk
wrk -t12 -c400 -d30s http://localhost:8080/health
```

### File Transfer Benchmark

```bash
# Create test file
dd if=/dev/urandom of=test-1gb.bin bs=1G count=1

# Transfer via local P2P, note speed/time
# Typical: 100+ Mbps on LAN
```

## SSL/TLS Certificate Setup

### Let's Encrypt (Production)

```bash
# Install certbot
sudo apt install -y certbot python3-certbot-nginx

# Get certificate
sudo certbot certonly --standalone -d yourdomain.com

# Update docker-compose.yml to use certs
# Mount: /etc/letsencrypt/live/yourdomain.com

# Auto-renewal
sudo systemctl enable certbot.timer
```

### Self-Signed (Development)

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout server.key -out server.crt \
  -days 365 -nodes \
  -subj "/CN=localhost"

# Place in docker/certs/ folder
```

## Monitoring & Alerts

### Check Service Health

```bash
# Signaling server health
curl http://localhost:8080/health

# Stats
curl http://localhost:8080/stats

# Docker stats
docker stats

# Logs with timestamps
docker-compose logs --timestamps signaling
```

### Prometheus Metrics (Planned)

Expose metrics on `http://localhost:8080/metrics` for integration with Prometheus/Grafana.

## Scaling Considerations

- **Signaling server**: Stateless, can run multiple instances behind load balancer
- **Web frontend**: Static build, serve via CDN (CloudFlare, AWS CloudFront)
- **TURN relay**: CPU-bound, may need multiple instances for high load
- **Database**: Currently none (state is ephemeral, in-memory)

## Troubleshooting

### Port already in use

```bash
# Find process using port 3000
sudo lsof -i :3000
# Kill it
sudo kill -9 <PID>

# Or use different port
docker-compose up -e "WEB_PORT=3001"
```

### WebSocket connection refused

- Check signaling server is running: `docker-compose logs signaling`
- Verify firewall allows port 8080
- Check `NEXT_PUBLIC_SIGNALING_URL` in web app

### Files not transferring

- Check browser console for errors
- Verify both devices on same network
- Try TURN relay: configure `NEXT_PUBLIC_TURN_SERVERS`
- Check data channel is open: browser DevTools → Network → WebRTC

## Security Checklist

- [ ] Use HTTPS in production (Let's Encrypt)
- [ ] Use WSS (secure WebSocket) for signaling
- [ ] Enable CORS only for your domain
- [ ] Rotate TURN credentials regularly
- [ ] Monitor for abuse (rate limiting active)
- [ ] Keep Docker images updated
- [ ] Use firewall rules (only allow 3000, 8080, 3478, 5349)
- [ ] Enable audit logging
- [ ] Regular backups (if persistent storage added)
