@echo off
REM P2P Share - Quick Start Script (Windows)

echo.
echo 🚀 P2P Share - Quick Start
echo ================================
echo.

REM Check prerequisites
where docker >nul 2>nul
if errorlevel 1 (
    echo ❌ Docker is not installed
    exit /b 1
)

where docker-compose >nul 2>nul
if errorlevel 1 (
    echo ❌ Docker Compose is not installed
    exit /b 1
)

echo ✓ Prerequisites verified
echo.

echo 📦 Building Docker images...
docker-compose build

echo.
echo 🚀 Starting services...
docker-compose up -d

echo.
echo ⏳ Waiting for services to be ready...
timeout /t 5 /nobreak

echo.
echo ✅ Services started!
echo.
echo 📱 Web App:
echo   - Device A (Sender): http://localhost:3000
echo   - Device B (Receiver): http://^<Device-A-IP^>:3000
echo.
echo 🔗 Signaling Server:
echo   - Health: curl http://localhost:8080/health
echo   - Stats: curl http://localhost:8080/stats
echo.
echo 📡 TURN Server:
echo   - Listening on 3478 (TCP/UDP) and 5349 (TLS)
echo.
echo 📝 View logs:
echo   - docker-compose logs -f
echo   - docker-compose logs -f signaling
echo.
echo 🛑 Stop services:
echo   - docker-compose down
echo.
