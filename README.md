# Healthcare Scheduling Application

Full-stack TypeScript healthcare scheduling system with **retellai.com** voice agent integration, IntakeQ API sync, Availity insurance verification, and write-behind caching for sub-millisecond appointment booking.

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- Vite (build tool)
- Wouter (routing)
- TanStack Query (data fetching)
- Axios (HTTP client)

**Backend:**
- Node.js + Express + TypeScript
- PostgreSQL with Drizzle ORM
- retellai.com Web Agent API
- IntakeQ API (practice management)
- Availity API (insurance verification)

**Key Features:**
- ⚡ Write-behind cache (1ms appointment booking vs 42-284ms direct API)
- 🎙️ Voice AI agent "Matt" for phone scheduling
- 💳 Real-time insurance verification
- 🔒 HIPAA-compliant client verification
- 🔄 Background sync with exponential backoff retry

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- retellai.com API key
- IntakeQ API key
- Availity API credentials

### Installation

1. **Clone and install dependencies:**

```bash
npm install
cd client && npm install && cd ..
```

2. **Set up environment variables:**

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/healthcare_scheduling
RETELL_API_KEY=your_retell_api_key
INTAKEQ_API_KEY=your_intakeq_api_key
AVAILITY_CLIENT_ID=your_availity_client_id
AVAILITY_CLIENT_SECRET=your_availity_client_secret
SESSION_SECRET=your_secure_secret
JWT_SECRET=your_jwt_secret
PORT=3000
```

3. **Set up database:**

```bash
# Generate migrations
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data (providers)
npx tsx server/seed.ts
```

4. **Run the application:**

```bash
# Terminal 1: Backend API
npm run dev

# Terminal 2: Frontend
npm run client
```

- Backend: http://localhost:3000
- Frontend: http://localhost:5173
- Drizzle Studio: `npm run db:studio` → http://localhost:4983

## 📋 API Endpoints

### Voice Agent Tools (Called by retellai.com)

```
POST /api/tools/search-client
POST /api/tools/create-new-client
POST /api/tools/check-availability
POST /api/tools/book-appointment
POST /api/tools/verify-insurance
POST /api/tools/reschedule-appointment
POST /api/tools/cancel-appointment
```

### Agent Management

```
POST /api/agents - Create voice agent
GET /api/agents/:agentId - Get agent details
POST /api/agents/:agentId/authorize - Create web call session
GET /api/calls - List recent calls
GET /api/calls/:callId - Get call details
POST /api/webhooks/retell - Retell webhook handler
```

### Cache Management

```
GET /api/cache/stats - Get cache statistics
POST /api/cache/retry-failed - Retry failed syncs
```

## 🎙️ Voice Agent "Matt"

### COLLECT FIRST, VERIFY SECOND Workflow

1. **Greeting** → Ask if existing/new client
2. **Information Collection** → Gather ALL info (name, phone, DOB, etc.)
3. **Verification** → Call search_client/verify_insurance ONLY after collection
4. **Service** → Schedule/reschedule/cancel
5. **Confirmation** → Confirm details + copay if insurance verified

### HIPAA Verification

- ✅ Requires **both** phone number **AND** date of birth
- ✅ Never calls verification tools without complete information
- ✅ Encrypted data storage

### Provider Schedules

| Provider | Schedule | Notes |
|----------|----------|-------|
| Charles Maddix | Mon-Thu 10:30 AM - 6:00 PM | All appointment types |
| Ava Suleiman | Tue 10:30 AM - 6:00 PM | All appointment types |
| Dr. Soto | Mon-Thu 4:00 PM - 6:00 PM | **Follow-ups only** |

### Appointment Types

- **Comprehensive Evaluation** (60 min) - New clients or comprehensive assessments
- **Follow-up** (15 min) - Existing clients
- **Ketamine Consultation** (30 min)

### Accepted Insurance

✅ In-network only:
- Aetna
- Florida Blue (BCBS)
- Cigna
- Medicare
- Tricare

❌ Not accepted:
- HMOs
- Medicaid

## 💾 Write-Behind Cache System

### How It Works

1. **Appointment created** → Written to local DB immediately (1ms)
2. **Cache entry created** → Status: `pending`
3. **Background job** → Syncs to IntakeQ every 30 seconds
4. **Retry logic** → Exponential backoff up to 5 attempts
5. **Status tracking** → `pending` → `synced` / `failed`

### Performance Comparison

| Operation | Write-Behind Cache | Direct IntakeQ API |
|-----------|-------------------|-------------------|
| Book Appointment | **1ms** | 42-284ms |
| User Experience | Instant | Noticeable delay |
| Failure Handling | Retry in background | Immediate error |

### Cache Management

```bash
# View cache statistics
GET /api/cache/stats

# Manually retry failed syncs
POST /api/cache/retry-failed
```

## 🔐 Security

- ✅ HIPAA-compliant data encryption
- ✅ Client verification (phone + DOB)
- ✅ Session management
- ✅ API rate limiting
- ✅ Environment variable secrets

## 🏢 Practice Configuration

**Location:**
The Practice
3547 Hendricks Ave
Jacksonville, FL 32207

**Contact:** (904) 123-4567

## 📊 Database Schema

### Core Tables

- `clients` - Client information + insurance details
- `providers` - Provider schedules and appointment types
- `appointments` - Scheduled appointments
- `voice_calls` - Call logs and transcripts
- `appointment_cache` - Write-behind sync queue
- `insurance_verification_cache` - 24-hour eligibility cache

## 🔧 Development

### Database Management

```bash
# Generate migration
npm run db:generate

# Push schema changes
npm run db:push

# Open Drizzle Studio
npm run db:studio

# Seed database
npx tsx server/seed.ts
```

### Build for Production

```bash
# Build backend
npm run build

# Build frontend
npm run client:build

# Start production server
npm start
```

## 📝 Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `RETELL_API_KEY` | retellai.com API key |
| `INTAKEQ_API_KEY` | IntakeQ API key |
| `AVAILITY_CLIENT_ID` | Availity OAuth client ID |
| `AVAILITY_CLIENT_SECRET` | Availity OAuth client secret |
| `SESSION_SECRET` | Session encryption secret |
| `JWT_SECRET` | JWT signing secret |
| `PORT` | Server port (default: 3000) |
| `CACHE_SYNC_INTERVAL` | Sync interval in seconds (default: 30) |

## 🧪 Testing Voice Agent

1. Navigate to `/voice` in the frontend
2. Click "Create Voice Agent" (first time only)
3. Click the microphone button to start a call
4. Test workflow:
   - Say "I'm an existing client"
   - Provide name, phone, DOB
   - Request to schedule an appointment
   - Provide insurance information
   - Confirm appointment details

## 📚 API Integration Details

### retellai.com
- Custom tools point to backend endpoints
- Web SDK for browser-based calls
- Webhook support for call events

### IntakeQ
- Client management
- Appointment scheduling
- Provider availability
- Background sync via cache

### Availity
- OAuth2 authentication
- Real-time eligibility checks
- Copay/deductible parsing
- 24-hour cache to reduce API calls

## 🐛 Troubleshooting

**Cache not syncing?**
- Check `CACHE_SYNC_INTERVAL` environment variable
- Verify IntakeQ API credentials
- Check `/api/cache/stats` for errors

**Voice agent not connecting?**
- Verify `RETELL_API_KEY` is set
- Check microphone permissions in browser
- Review browser console for errors

**Insurance verification failing?**
- Verify Availity credentials
- Check client has policy number on file
- Ensure insurance company is in-network

## 📄 License

ISC

## 👥 Contributors

Healthcare Scheduling System built with Claude Code