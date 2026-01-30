# Deployment Guide: QA Dashboard to Google Cloud

This guide covers deploying the QA Dashboard to Google Cloud Platform using Firebase Hosting (frontend) and Cloud Run (backend).

## Architecture

- **Frontend**: Firebase Hosting (static React build)
- **Backend**: Cloud Run (serverless Node.js container)
- **Database**: Cloud SQL MySQL
- **Webhooks**: Permanent Cloud Run URL

## Prerequisites

1. Google Cloud account with billing enabled
2. Firebase project created
3. Cloud SQL MySQL instance created
4. `gcloud` CLI installed and authenticated
5. `firebase` CLI installed (`npm install -g firebase-tools`)

## Step 1: Set Up Firebase Project

```bash
# Login to Firebase
firebase login

# Initialize Firebase (if not already done)
firebase init hosting

# Select your Firebase project
# Set public directory: dist/client
# Configure as single-page app: Yes
```

Update `.firebaserc` with your Firebase project ID:
```json
{
  "projects": {
    "default": "your-firebase-project-id"
  }
}
```

## Step 2: Set Up Cloud SQL

1. **Create Cloud SQL MySQL Instance**:
   ```bash
   gcloud sql instances create qa-dashboard-db \
     --database-version=MYSQL_8_0 \
     --tier=db-f1-micro \
     --region=us-central1 \
     --root-password=your_secure_password
   ```

2. **Create Database**:
   ```bash
   gcloud sql databases create qa_dashboard --instance=qa-dashboard-db
   ```

3. **Get Connection Name**:
   ```bash
   gcloud sql instances describe qa-dashboard-db --format="value(connectionName)"
   # Output: PROJECT_ID:us-central1:qa-dashboard-db
   ```

## Step 3: Configure Environment Variables

Create `.env.production` file (copy from `.env.production.example`):

```bash
# Cloud SQL Connection
DATABASE_URL=mysql://root:your_password@/qa_dashboard?host=/cloudsql/PROJECT_ID:us-central1:qa-dashboard-db

# Or use individual variables:
# DB_HOST=/cloudsql/PROJECT_ID:us-central1:qa-dashboard-db
# DB_USER=root
# DB_PASSWORD=your_password
# DB_NAME=qa_dashboard

# OpenPhone
OPENPHONE_API_KEY=your_key
OPENPHONE_MAIN_PHONE_NUMBER_ID=PNVbbBqeqM
OPENPHONE_OUTBOUND_PHONE_NUMBER_ID=PNBANAZERt

# OpenAI
OPENAI_API_KEY=your_key

# User IDs
OPENPHONE_USER_ID_JOY=USO5QGjyIS
OPENPHONE_USER_ID_ALI=USamAZurZL

# Server
NODE_ENV=production
PORT=8080
```

## Step 4: Build Application

```bash
# Install dependencies
npm install

# Build both client and server
npm run build
```

This creates:
- `dist/client/` - Frontend build for Firebase Hosting
- `dist/server/` - Backend build for Cloud Run

## Step 5: Deploy Frontend to Firebase Hosting

```bash
# Deploy frontend
npm run deploy:firebase

# Or manually:
firebase deploy --only hosting
```

Your frontend will be available at: `https://YOUR_PROJECT_ID.web.app`

## Step 6: Deploy Backend to Cloud Run

### Option A: Deploy from Source (Recommended)

```bash
# Set environment variables
gcloud run deploy qa-dashboard-api \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --set-env-vars NODE_ENV=production \
  --set-env-vars DATABASE_URL="mysql://root:password@/qa_dashboard?host=/cloudsql/PROJECT_ID:us-central1:qa-dashboard-db" \
  --set-env-vars OPENPHONE_API_KEY="your_key" \
  --set-env-vars OPENAI_API_KEY="your_key" \
  --add-cloudsql-instances PROJECT_ID:us-central1:qa-dashboard-db
```

### Option B: Deploy Using Cloud Build

```bash
# Submit build
gcloud builds submit --config cloudbuild.yaml

# This will automatically deploy to Cloud Run
```

### Option C: Deploy Pre-built Docker Image

```bash
# Build Docker image
docker build -t gcr.io/YOUR_PROJECT_ID/qa-dashboard-api .

# Push to Container Registry
docker push gcr.io/YOUR_PROJECT_ID/qa-dashboard-api

# Deploy to Cloud Run
gcloud run deploy qa-dashboard-api \
  --image gcr.io/YOUR_PROJECT_ID/qa-dashboard-api \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --add-cloudsql-instances PROJECT_ID:us-central1:qa-dashboard-db \
  --set-env-vars NODE_ENV=production,DATABASE_URL="..."
```

## Step 7: Configure Cloud Run for Cloud SQL

Cloud Run needs permission to connect to Cloud SQL:

```bash
# Grant Cloud Run service account access to Cloud SQL
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

## Step 8: Update Frontend API URL

After deploying, update your frontend to use the Cloud Run URL:

1. Get your Cloud Run URL:
   ```bash
   gcloud run services describe qa-dashboard-api --region us-central1 --format="value(status.url)"
   ```

2. Update `client/src/lib/trpc.ts` or create environment variable:
   ```typescript
   const API_URL = import.meta.env.VITE_API_URL || 'https://qa-dashboard-api-xxxxx-uc.a.run.app';
   ```

3. Rebuild and redeploy frontend:
   ```bash
   npm run build:client
   npm run deploy:firebase
   ```

## Step 9: Set Up Webhooks

1. Get your Cloud Run URL (from Step 8)

2. Register webhook with OpenPhone:
   ```bash
   npm run register-webhooks https://qa-dashboard-api-xxxxx-uc.a.run.app
   ```

3. Verify webhook is registered:
   ```bash
   npm run list-webhooks
   ```

## Step 10: Run Database Migrations

```bash
# Connect to Cloud SQL and run migrations
gcloud sql connect qa-dashboard-db --user=root

# In MySQL shell:
USE qa_dashboard;
# Then run your migrations or use drizzle-kit push
```

Or use Cloud SQL Proxy locally:
```bash
# Install Cloud SQL Proxy
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.darwin.amd64
chmod +x cloud-sql-proxy

# Start proxy
./cloud-sql-proxy PROJECT_ID:us-central1:qa-dashboard-db

# In another terminal, run migrations
DATABASE_URL="mysql://root:password@127.0.0.1:3306/qa_dashboard" npm run db:push
```

## Step 11: Import Historical Data (Optional)

```bash
# Set up Cloud SQL Proxy (see Step 10)
# Then run bulk import
npm run bulk-import:all ~/Downloads/all.csv ~/Downloads/ali_inbound.csv
```

## Troubleshooting

### Database Connection Issues

- Verify Cloud SQL instance is running: `gcloud sql instances list`
- Check Cloud Run has Cloud SQL connection: `gcloud run services describe qa-dashboard-api --region us-central1`
- Verify service account has `cloudsql.client` role

### Build Issues

- Ensure Node.js 20+ is installed
- Check all dependencies are installed: `npm install`
- Verify build output: `ls -la dist/`

### Webhook Issues

- Verify Cloud Run URL is accessible: `curl https://your-cloud-run-url/webhooks/openphone/calls`
- Check Cloud Run logs: `gcloud run services logs read qa-dashboard-api --region us-central1`
- Verify webhook is registered: `npm run list-webhooks`

## Environment Variables Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Cloud SQL connection string | `mysql://user:pass@/db?host=/cloudsql/...` |
| `DB_HOST` | Cloud SQL socket path | `/cloudsql/PROJECT:REGION:INSTANCE` |
| `DB_USER` | Database user | `root` |
| `DB_PASSWORD` | Database password | `your_password` |
| `DB_NAME` | Database name | `qa_dashboard` |
| `OPENPHONE_API_KEY` | OpenPhone API key | `...` |
| `OPENAI_API_KEY` | OpenAI API key | `...` |
| `PORT` | Server port (Cloud Run sets this) | `8080` |
| `NODE_ENV` | Environment | `production` |

## Cost Estimation

- **Firebase Hosting**: Free tier (10 GB storage, 360 MB/day transfer)
- **Cloud Run**: Pay per use (~$0.40 per million requests)
- **Cloud SQL**: db-f1-micro ~$7/month
- **Total**: ~$10-15/month for low-medium traffic

## Next Steps

1. Set up custom domain in Firebase Hosting
2. Configure Cloud Run for higher traffic (increase CPU/memory)
3. Set up Cloud SQL backups
4. Configure monitoring and alerts
5. Set up CI/CD pipeline with Cloud Build

