#!/bin/bash
#
# JOB BOT - Deployment Script
#
# Usage:
#   ./deploy/deploy.sh              # Full deploy
#   ./deploy/deploy.sh --update     # Update only (no rebuild)
#   ./deploy/deploy.sh --logs       # Show logs
#

set -e

cd "$(dirname "$0")/.."
PROJECT_ROOT=$(pwd)

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              JOB BOT - DEPLOYMENT                              ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
# Database
DATABASE_URL=postgresql://jobbot:jobbot_secure_pass_123@localhost:5432/jobbot
DB_PASSWORD=jobbot_secure_pass_123

# Redis
REDIS_URL=redis://localhost:6379

# Telegram Bot (optional)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# OpenAI/Groq for AI matching (optional)
OPENAI_API_KEY=
GROQ_API_KEY=

# Server
PORT=3456
NODE_ENV=production
EOF
    echo "📝 Please edit .env with your credentials"
fi

case "$1" in
    --logs)
        docker-compose -f deploy/docker-compose.yml logs -f
        ;;
    --update)
        echo "📦 Pulling latest changes..."
        git pull origin main || true

        echo "🔄 Restarting app container..."
        docker-compose -f deploy/docker-compose.yml restart app

        echo "✅ Update complete!"
        ;;
    --stop)
        echo "🛑 Stopping services..."
        docker-compose -f deploy/docker-compose.yml down
        echo "✅ Stopped!"
        ;;
    --rebuild)
        echo "🔨 Rebuilding and restarting..."
        docker-compose -f deploy/docker-compose.yml down
        docker-compose -f deploy/docker-compose.yml build --no-cache
        docker-compose -f deploy/docker-compose.yml up -d
        echo "✅ Rebuilt and started!"
        ;;
    *)
        echo "🐳 Starting Docker services..."

        # Start services
        docker-compose -f deploy/docker-compose.yml up -d --build

        echo ""
        echo "⏳ Waiting for services to be ready..."
        sleep 10

        # Run database migrations
        echo "📊 Running database migrations..."
        docker-compose -f deploy/docker-compose.yml exec -T app npx prisma migrate deploy || true

        echo ""
        echo "╔═══════════════════════════════════════════════════════════════╗"
        echo "║              DEPLOYMENT COMPLETE!                              ║"
        echo "╠═══════════════════════════════════════════════════════════════╣"
        echo "║                                                                ║"
        echo "║  Dashboard: http://YOUR_SERVER_IP:3456                        ║"
        echo "║  Companies: http://YOUR_SERVER_IP:3456/companies              ║"
        echo "║  API:       http://YOUR_SERVER_IP:3456/api/stats              ║"
        echo "║                                                                ║"
        echo "║  Commands:                                                     ║"
        echo "║    ./deploy/deploy.sh --logs     View logs                    ║"
        echo "║    ./deploy/deploy.sh --update   Update app                   ║"
        echo "║    ./deploy/deploy.sh --stop     Stop services                ║"
        echo "║    ./deploy/deploy.sh --rebuild  Full rebuild                 ║"
        echo "║                                                                ║"
        echo "╚═══════════════════════════════════════════════════════════════╝"
        ;;
esac
