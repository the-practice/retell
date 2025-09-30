# Deployment Guide - Vultr Cloud Server

## Prerequisites

- Vultr account
- Domain name (optional but recommended)
- API keys (Retell, IntakeQ, Availity)

## Step 1: Provision Vultr Server

1. **Create a new Cloud Compute instance:**
   - OS: Ubuntu 22.04 LTS
   - Plan: $12/month (2 vCPU, 4GB RAM) or higher
   - Location: Choose nearest to Jacksonville, FL (e.g., Atlanta)
   - Enable IPv4

2. **Note your server IP address** from Vultr dashboard

## Step 2: Initial Server Setup

SSH into your server:

```bash
ssh root@your_server_ip
```

### Update system and install dependencies:

```bash
# Update package list
apt update && apt upgrade -y

# Install Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql postgresql-contrib

# Install Nginx (reverse proxy)
apt install -y nginx

# Install PM2 (process manager)
npm install -g pm2

# Install Git
apt install -y git
```

## Step 3: Configure PostgreSQL

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE DATABASE healthcare_scheduling;
CREATE USER healthcare_user WITH ENCRYPTED PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE healthcare_scheduling TO healthcare_user;
\q
```

Edit PostgreSQL to allow local connections:
```bash
nano /etc/postgresql/14/main/pg_hba.conf
```

Change this line:
```
local   all   all   peer
```
To:
```
local   all   all   md5
```

Restart PostgreSQL:
```bash
systemctl restart postgresql
```

## Step 4: Deploy Application

### Clone or upload your code:

**Option A: From Git (recommended)**
```bash
cd /var/www
git clone your_repository_url retell
cd retell
```

**Option B: Upload via SCP from your local machine**
```bash
# From your local machine:
scp -r c:/Users/Ziad\ Youssef/retell root@your_server_ip:/var/www/
```

### Install dependencies:

```bash
cd /var/www/retell

# Backend dependencies
npm install

# Frontend dependencies
cd client
npm install
cd ..
```

## Step 5: Configure Environment Variables

```bash
cd /var/www/retell
nano .env
```

Add your production configuration:

```env
# Database
DATABASE_URL=postgresql://healthcare_user:your_secure_password@localhost:5432/healthcare_scheduling

# retellai.com API
RETELL_API_KEY=your_retell_api_key_here

# IntakeQ API
INTAKEQ_API_KEY=your_intakeq_api_key_here

# Availity Insurance Verification
AVAILITY_CLIENT_ID=your_availity_client_id
AVAILITY_CLIENT_SECRET=your_availity_client_secret
AVAILITY_TOKEN_URL=https://api.availity.com/availity/v1/token
AVAILITY_API_BASE_URL=https://api.availity.com

# Session & Security
SESSION_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)

# Server Configuration
PORT=3000
NODE_ENV=production

# Practice Configuration
PRACTICE_NAME=The Practice
PRACTICE_ADDRESS=3547 Hendricks Ave, Jacksonville, FL 32207
PRACTICE_PHONE=(904) 123-4567

# Cache Sync Interval (seconds)
CACHE_SYNC_INTERVAL=30
```

## Step 6: Set Up Database

```bash
cd /var/www/retell

# Generate and push schema
npm run db:generate
npm run db:push

# Seed initial data
npx tsx server/seed.ts
```

## Step 7: Build Application

```bash
cd /var/www/retell

# Build backend
npm run build

# Build frontend
npm run client:build
```

## Step 8: Configure Nginx Reverse Proxy

```bash
nano /etc/nginx/sites-available/healthcare-scheduling
```

Add this configuration:

```nginx
server {
    listen 80;
    server_name your_domain.com;  # Or use your_server_ip

    # Frontend (React app)
    location / {
        root /var/www/retell/client/dist;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # WebSocket support for Retell
    location /api/webhooks {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Enable the site:
```bash
ln -s /etc/nginx/sites-available/healthcare-scheduling /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

## Step 9: Start Application with PM2

```bash
cd /var/www/retell

# Start backend with PM2
pm2 start dist/server/index.js --name healthcare-api

# Save PM2 process list
pm2 save

# Set PM2 to start on boot
pm2 startup systemd
```

## Step 10: Configure Firewall

```bash
# Allow SSH, HTTP, and HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

## Step 11: Set Up SSL (Optional but Recommended)

Install Certbot:
```bash
apt install -y certbot python3-certbot-nginx
```

Obtain SSL certificate:
```bash
certbot --nginx -d your_domain.com
```

Follow prompts to configure HTTPS.

## Step 12: Verify Deployment

Test the application:
```bash
# Check backend is running
curl http://localhost:3000/health

# Check PM2 status
pm2 status

# View logs
pm2 logs healthcare-api

# Check Nginx status
systemctl status nginx
```

Visit your domain or IP in a browser:
- Frontend: `http://your_domain.com` or `http://your_server_ip`
- API Health: `http://your_domain.com/api/health`

## Ongoing Management

### View Logs
```bash
# Backend logs
pm2 logs healthcare-api

# Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### Restart Services
```bash
# Restart backend
pm2 restart healthcare-api

# Restart Nginx
systemctl restart nginx

# Restart PostgreSQL
systemctl restart postgresql
```

### Update Application
```bash
cd /var/www/retell

# Pull latest code
git pull

# Install dependencies
npm install
cd client && npm install && cd ..

# Rebuild
npm run build
npm run client:build

# Restart
pm2 restart healthcare-api
```

### Database Backups
```bash
# Create backup script
nano /usr/local/bin/backup-db.sh
```

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/healthcare"
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
pg_dump -U healthcare_user healthcare_scheduling > $BACKUP_DIR/backup_$DATE.sql
# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql" -mtime +7 -delete
```

```bash
chmod +x /usr/local/bin/backup-db.sh

# Add to crontab (daily at 2 AM)
crontab -e
```
Add: `0 2 * * * /usr/local/bin/backup-db.sh`

## Security Checklist

- ✅ Change default PostgreSQL password
- ✅ Use strong SESSION_SECRET and JWT_SECRET
- ✅ Enable UFW firewall
- ✅ Install SSL certificate (HTTPS)
- ✅ Regularly update system packages
- ✅ Set up automated database backups
- ✅ Use environment variables (never commit secrets)
- ✅ Monitor PM2 logs for errors
- ✅ Configure Nginx rate limiting for API endpoints

## Monitoring

### Install monitoring tools (optional):
```bash
# Install htop for system monitoring
apt install -y htop

# PM2 monitoring
pm2 monit
```

### Set up PM2 monitoring dashboard (optional):
```bash
pm2 install pm2-server-monit
```

## Troubleshooting

**Backend not starting:**
```bash
pm2 logs healthcare-api
# Check for missing environment variables or database connection issues
```

**Database connection failed:**
```bash
# Test PostgreSQL connection
psql -U healthcare_user -d healthcare_scheduling -h localhost
```

**Nginx 502 Bad Gateway:**
```bash
# Check backend is running
pm2 status
curl http://localhost:3000/health
```

**Port already in use:**
```bash
# Find process using port 3000
lsof -i :3000
# Kill if needed
kill -9 PID
```

## Performance Optimization

### For high traffic:
1. Increase Vultr plan to 4 vCPU, 8GB RAM
2. Enable Redis caching
3. Configure PostgreSQL connection pooling
4. Enable Nginx caching for static assets
5. Use PM2 cluster mode: `pm2 start dist/server/index.js -i max`

## Cost Estimate

- Vultr Server ($12-24/month)
- Domain name (~$12/year)
- Total: ~$15-30/month

---

Need help? Check logs first:
- Backend: `pm2 logs healthcare-api`
- Nginx: `tail -f /var/log/nginx/error.log`
- PostgreSQL: `tail -f /var/log/postgresql/postgresql-14-main.log`