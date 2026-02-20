#!/bin/bash
#
# JOB BOT - Server Setup Script
# For Ubuntu 22.04 on Oracle Cloud Free Tier (ARM)
#
# Usage:
#   chmod +x setup-server.sh
#   ./setup-server.sh
#

set -e

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              JOB BOT - SERVER SETUP                            ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║  This script will install:                                     ║"
echo "║  • Docker & Docker Compose                                     ║"
echo "║  • Node.js 20                                                  ║"
echo "║  • PostgreSQL (Docker)                                         ║"
echo "║  • Redis (Docker)                                              ║"
echo "║  • Nginx (reverse proxy)                                       ║"
echo "║  • Certbot (SSL)                                               ║"
echo "║  • PM2 (process manager)                                       ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install dependencies
echo "📦 Installing dependencies..."
sudo apt install -y curl wget git build-essential nginx certbot python3-certbot-nginx

# Install Docker
echo "🐳 Installing Docker..."
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
rm get-docker.sh

# Install Docker Compose
echo "🐳 Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install Node.js 20
echo "📦 Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install PM2
echo "📦 Installing PM2..."
sudo npm install -g pm2

# Install Playwright dependencies
echo "🎭 Installing Playwright dependencies..."
sudo npx playwright install-deps chromium

# Create app directory
echo "📁 Creating app directory..."
sudo mkdir -p /opt/job-bot
sudo chown $USER:$USER /opt/job-bot

# Configure firewall
echo "🔥 Configuring firewall..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3456 -j ACCEPT
sudo netfilter-persistent save

echo ""
echo "✅ Base setup complete!"
echo ""
echo "Next steps:"
echo "1. Log out and back in (for Docker group)"
echo "2. Run: ./deploy/setup-docker.sh"
echo "3. Run: ./deploy/deploy.sh"
