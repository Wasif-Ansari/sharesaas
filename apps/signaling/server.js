import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import http from 'node:http';

const HTTP_PORT = process.env.PORT || 8080;
const SIGNALING_TTL_MS = 5 * 60_000; // 5 minutes
const MAX_CODES_PER_IP = 10; // rate limit: max 10 active sessions per IP

const app = express();
app.use(morgan('tiny'));
app.use(cors());

// Rate limiting: max 100 requests per 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 100,
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Signaling stats (for monitoring)
app.get('/stats', (_req, res) => {
  res.json({
    active_rooms: rooms.size,
    timestamp: new Date().toISOString(),
  });
});

const server = http.createServer(app);

server.listen(HTTP_PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Signaling server on 0.0.0.0:${HTTP_PORT}`);
  console.log('Health check: GET /health');
  console.log('Stats: GET /stats');
});

const wss = new WebSocketServer({ server, perMessageDeflate: false });

// Rooms: code -> { a: {ws, ip}, b: {ws, ip}, created, ttl, sessionId }
const rooms = new Map();

// Track connections per IP for rate limiting
const connsByIp = new Map();

const now = () => Date.now();
const makeCode = () => (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
const makeSessionId = () => crypto.randomBytes(16).toString('hex');

function getClientIp(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

function send(ws, msg) {
  if (!ws) return;
  try {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  } catch (e) {
    console.error('[WS] Send error:', e.message);
  }
}

function log(ip, action, details = '') {
  console.log(`[${new Date().toISOString()}] [${ip}] ${action} ${details}`);
}

// Cleanup expired sessions
setInterval(() => {
  const t = now();
  for (const [code, room] of rooms) {
    if (room.ttl < t || (!room.a && !room.b)) {
      log('cleanup', `Expired room ${code}`);
      rooms.delete(code);
    }
  }
  // Also prune IP connection tracking
  for (const [ip, count] of connsByIp) {
    if (count <= 0) connsByIp.delete(ip);
  }
}, 60_000); // Every minute

wss.on('connection', (ws, req) => {
  const clientIp = getClientIp(req);
  log(clientIp, 'WS connected');

  // Rate limit: max connections per IP
  const activeByIp = connsByIp.get(clientIp) || 0;
  if (activeByIp >= MAX_CODES_PER_IP) {
    log(clientIp, 'Rate limited (too many active sessions)');
    send(ws, { type: 'error', error: 'rate_limited' });
    ws.close(1008, 'Rate limited');
    return;
  }

  connsByIp.set(clientIp, activeByIp + 1);
  ws._ip = clientIp;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      log(clientIp, 'Malformed message');
      return;
    }

    const { type } = msg;

    // CREATE: Sender initiates a session
    if (type === 'create') {
      let code = makeCode();
      let attempts = 0;
      while (rooms.has(code) && attempts < 100) {
        code = makeCode();
        attempts++;
      }
      if (attempts >= 100) {
        log(clientIp, 'Failed to generate unique code');
        send(ws, { type: 'error', error: 'code_generation_failed' });
        return;
      }

      const sessionId = makeSessionId();
      rooms.set(code, {
        a: { ws, ip: clientIp },
        b: null,
        sessionId,
        created: now(),
        ttl: now() + SIGNALING_TTL_MS,
      });
      ws._room = code;
      ws._role = 'a';
      log(clientIp, `Session created`, `code=${code} session=${sessionId.slice(0, 8)}`);
      send(ws, { type: 'created', code, sessionId });
      return;
    }

    // JOIN: Receiver joins an existing session
    if (type === 'join') {
      const code = msg.code?.trim();
      if (!code || code.length !== 6) {
        log(clientIp, 'Invalid code format');
        send(ws, { type: 'error', error: 'invalid_code_format' });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        log(clientIp, 'Code not found', `code=${code}`);
        send(ws, { type: 'error', error: 'invalid_code' });
        return;
      }

      if (room.b) {
        log(clientIp, 'Session already has receiver', `code=${code}`);
        send(ws, { type: 'error', error: 'session_full' });
        return;
      }

      room.b = { ws, ip: clientIp };
      room.ttl = now() + SIGNALING_TTL_MS;
      ws._room = code;
      ws._role = 'b';

      log(clientIp, 'Joined session', `code=${code}`);
      send(room.a.ws, { type: 'peer_joined', code });
      send(ws, { type: 'joined', code, sessionId: room.sessionId });
      return;
    }

    // SIGNAL: WebRTC offer/answer/ICE exchange
    if (type === 'signal') {
      const room = rooms.get(ws._room);
      if (!room) {
        log(clientIp, 'No active room for signal');
        return;
      }

      const peer = ws === room.a.ws ? room.b : room.a;
      if (!peer) {
        log(clientIp, 'Peer not connected');
        return;
      }

      send(peer.ws, { type: 'signal', data: msg.data });
      return;
    }

    // PING: Keep-alive heartbeat
    if (type === 'ping') {
      send(ws, { type: 'pong' });
      const room = rooms.get(ws._room);
      if (room) room.ttl = now() + SIGNALING_TTL_MS;
      return;
    }

    log(clientIp, 'Unknown message type', type);
  });

  ws.on('close', () => {
    const code = ws._room;
    const role = ws._role;
    if (code && rooms.has(code)) {
      const room = rooms.get(code);
      if (ws === room.a?.ws) room.a = null;
      else if (ws === room.b?.ws) room.b = null;

      const peer = room.a || room.b;
      if (peer) {
        send(peer.ws, { type: 'peer_left', reason: 'disconnect' });
      }
      log(clientIp, `${role} disconnected`, `code=${code}`);

      if (!room.a && !room.b) {
        rooms.delete(code);
        log(clientIp, 'Room cleaned up', `code=${code}`);
      }
    }

    const activeByIp = connsByIp.get(clientIp) || 1;
    connsByIp.set(clientIp, activeByIp - 1);
    log(clientIp, 'WS closed');
  });

  ws.on('error', (err) => {
    log(clientIp, 'WS error', err.message);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
