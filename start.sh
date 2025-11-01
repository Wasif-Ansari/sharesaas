#!/bin/bash

# P2P Share - Quick Start Script

set -e

echo "🚀 P2P Share - Quick Start"
echo "================================"
echo ""

# Check prerequisites
check_cmd() {
  if ! command -v $1 &> /dev/null; then
    echo "❌ $1 is not installed"
    exit 1
  fi
}

echo "✓ Checking prerequisites..."
check_cmd docker
check_cmd docker-compose

echo ""
echo "📦 Building Docker images..."
docker-compose build

echo ""
echo "🚀 Starting services..."
docker-compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."
sleep 5

echo ""
echo "✅ Services started!"
echo ""
echo "📱 Web App:"
echo "  - Device A (Sender): http://localhost:3000"
echo "  - Device B (Receiver): http://<Device-A-IP>:3000"
echo ""
echo "🔗 Signaling Server:"
echo "  - Health: curl http://localhost:8080/health"
echo "  - Stats: curl http://localhost:8080/stats"
echo ""
echo "📡 TURN Server:"
echo "  - Listening on 3478 (TCP/UDP) and 5349 (TLS)"
echo ""
echo "📝 View logs:"
echo "  - docker-compose logs -f"
echo "  - docker-compose logs -f signaling"
echo ""
echo "🛑 Stop services:"
echo "  - docker-compose down"
echo ""
