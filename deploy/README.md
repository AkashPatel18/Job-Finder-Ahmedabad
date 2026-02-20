# Job Bot Deployment Guide

## Quick Start (Oracle Cloud Free Tier)

### 1. Create Oracle Cloud Account
1. Go to https://www.oracle.com/cloud/free/
2. Sign up with real information (they verify identity)
3. Choose region: **ap-mumbai-1** (for India) or closest to you

### 2. Create Free VM
```
Compute > Instances > Create Instance

Shape: VM.Standard.A1.Flex (ARM - Always Free)
OCPU: 4
Memory: 24 GB
OS: Ubuntu 22.04
Boot Volume: 100 GB

Network: Create new VCN with public subnet
SSH: Upload your public key
```

### 3. Configure Firewall (Oracle Cloud Console)
```
Networking > Virtual Cloud Networks > Your VCN > Security Lists > Default

Add Ingress Rules:
- Port 80 (HTTP)
- Port 443 (HTTPS)
- Port 3456 (Job Bot)
```

### 4. Connect to Server
```bash
ssh ubuntu@YOUR_SERVER_IP
```

### 5. Clone and Setup
```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/job-bot.git
cd job-bot

# Run setup script
chmod +x deploy/setup-server.sh
./deploy/setup-server.sh

# Log out and back in (for Docker group)
exit
ssh ubuntu@YOUR_SERVER_IP

# Deploy
cd job-bot
./deploy/deploy.sh
```

### 6. Access Dashboard
```
http://YOUR_SERVER_IP:3456
http://YOUR_SERVER_IP:3456/companies
```

---

## Alternative: Railway.app (Easiest)

1. Go to https://railway.app
2. Connect GitHub
3. Import your job-bot repo
4. Add PostgreSQL service
5. Add Redis service
6. Set environment variables
7. Deploy!

Railway handles everything automatically.

---

## Commands

```bash
# Deploy/Start
./deploy/deploy.sh

# View logs
./deploy/deploy.sh --logs

# Update (after git pull)
./deploy/deploy.sh --update

# Stop
./deploy/deploy.sh --stop

# Full rebuild
./deploy/deploy.sh --rebuild
```

---

## SSL Setup (Optional)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate (replace domain)
sudo certbot --nginx -d yourdomain.com

# Auto-renewal is configured automatically
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure:

```env
# Required
DATABASE_URL=postgresql://jobbot:password@localhost:5432/jobbot
REDIS_URL=redis://localhost:6379

# Optional (for notifications)
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Optional (for AI matching)
GROQ_API_KEY=your_groq_key
```

---

## Monitoring

```bash
# Check container status
docker ps

# Check logs
docker logs job-bot-app -f

# Check resource usage
docker stats
```

---

## Troubleshooting

### Container won't start
```bash
# Check logs
docker logs job-bot-app

# Check if ports are in use
sudo lsof -i :3456
```

### Database connection issues
```bash
# Check postgres is running
docker logs job-bot-postgres

# Connect manually
docker exec -it job-bot-postgres psql -U jobbot
```

### Scraper not working
- Playwright needs Chromium dependencies
- Check if running as non-root user
- Some sites may block cloud IPs
