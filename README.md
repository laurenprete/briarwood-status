# Briarwood Status

Website uptime monitoring platform built for [Briarwood Software](https://briarwoodsoftware.com). Monitors URLs on a 5-minute interval, tracks response times and uptime, and sends email alerts when services go down or recover.

**Live:** [status.briarwoodsoftware.com](https://status.briarwoodsoftware.com)

## Architecture

```
                        ┌─────────────────────┐
                        │   Amplify Hosting    │
                        │   (React SPA)        │
                        └─────────┬───────────┘
                                  │
                                  ▼
┌──────────────┐        ┌─────────────────────┐        ┌──────────────────┐
│  EventBridge │───5m──▶│   API Gateway (HTTP) │        │    DynamoDB      │
│  Schedule    │        └─────────┬───────────┘        │                  │
└──────┬───────┘                  │                     │  monitors        │
       │                          ▼                     │  check-results   │
       │                ┌─────────────────────┐        │  monitor-state   │
       │                │   API Lambda (Hono)  │───────▶│                  │
       │                └─────────────────────┘        └──────────────────┘
       │
       ▼
┌─────────────────────┐        ┌──────────────────┐
│  Checker Lambda     │───────▶│    SMTP2Go       │
│  (health checks)    │        │    (email alerts) │
└─────────────────────┘        └──────────────────┘
```

**Backend:** Two Node.js 20 Lambda functions — one for the REST API (Hono), one for periodic health checks (EventBridge). Both read/write to three DynamoDB tables.

**Frontend:** React 19 SPA with Tailwind CSS, hosted on AWS Amplify. Public status page + authenticated admin dashboard (Cognito).

**Infrastructure:** AWS CDK (TypeScript). Amplify handles frontend hosting with git-push deploys.

## Project Structure

```
src/
  api/index.ts          # Hono REST API Lambda
  checker/index.ts      # Health check Lambda (runs every 5 min)
  shared/
    auth.ts             # Cognito JWT verification middleware
    db.ts               # DynamoDB wrapper (paginated)
    types.ts            # Shared TypeScript interfaces
    url-validator.ts    # SSRF-safe URL validation (IPv4 + IPv6)
    validation.ts       # Zod schemas for API input validation

frontend/
  src/
    pages/              # StatusPage, Dashboard, AdminPage, LoginPage, MonitorDetail
    components/         # AdminLayout, MonitorModal, StatusBadge, UptimeBar, ResponseChart
    auth.ts             # Cognito client-side auth
    api.ts              # API client

infra/
  lib/status-stack.ts   # CDK stack definition
  bin/app.ts            # CDK app entry point
```

## Local Development

### Backend (Lambdas)

```bash
npm install
npm run build:lambdas    # Builds both checker and API with esbuild
```

### Frontend

```bash
cd frontend
npm install
npm run dev              # Vite dev server on localhost:5173
```

Set `VITE_API_URL` to point at your API Gateway endpoint, or leave it unset to use `/api` (proxied in production via Amplify).

### Infrastructure

```bash
cd infra
npm install
npx cdk synth            # Synthesize CloudFormation template
npx cdk deploy --profile cdk-admin
```

## Deploying

**Lambdas** (manual deploy):

```bash
npm run deploy:checker   # Build, zip, and update checker Lambda
npm run deploy:api       # Build, zip, and update API Lambda
```

**Frontend:** Amplify auto-builds on push to `main`.

**Infrastructure:** `cd infra && npx cdk deploy --profile cdk-admin`

