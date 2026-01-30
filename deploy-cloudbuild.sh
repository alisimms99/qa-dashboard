#!/bin/bash

# QA Dashboard Cloud Build deployment (uses Cloud Build instead of source deploy)
# This avoids the ZIP timestamp issue

set -e

echo "🚀 QA Dashboard Cloud Run Deployment (Cloud Build)"
echo "=================================================="
echo ""

# Check if required env vars are set
if [ -z "$OPENPHONE_API_KEY" ]; then
  echo "❌ OPENPHONE_API_KEY is not set"
  echo "   Run: export OPENPHONE_API_KEY='your_key_here'"
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo "❌ OPENAI_API_KEY is not set"
  echo "   Run: export OPENAI_API_KEY='your_key_here'"
  exit 1
fi

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"
SERVICE_NAME="qa-dashboard-api"

echo "✅ Environment variables set"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo ""

# Check if frontend is built
if [ ! -d "dist/client" ]; then
  echo "⚠️  Frontend not built. Building now..."
  npm run build:client
fi

echo "📦 Building and deploying with Cloud Build..."
echo ""

# Use Cloud Build to build and deploy
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_SERVICE_NAME=${SERVICE_NAME},_SERVICE_NAME},_REGION:=${REGION} \
  --set-env-vars="OPENPHONE_API_KEY=$OPENPHONE_API_KEY,OPENAI_API_KEY=$OPENAI_API_KEY"

echo ""
echo "🚀 Deploying to Cloud Run..."
echo ""

# Deploy to Cloud Run with environment variables
gcloud run deploy ${SERVICE_NAME} \
  --image gcr.io/${PROJECT_ID}/${SERVICE_NAME}:latest \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances=ojpm-qa-dashboard:us-central1:qa-dashboard-db \
  --set-env-vars="NODE_ENV=production,DB_SOCKET_PATH=/cloudsql/ojpm-qa-dashboard:us-central1:qa-dashboard-db,DB_USER=root,DB_PASSWORD=QADash2024Secure,DB_NAME=qa_dashboard,OPENPHONE_API_KEY=$OPENPHONE_API_KEY,OPENAI_API_KEY=$OPENAI_API_KEY,OPENPHONE_MAIN_PHONE_NUMBER_ID=PNVbbBqeqM,OPENPHONE_OUTBOUND_PHONE_NUMBER_ID=PNBANAZERt,OPENPHONE_USER_ID_JOY=USO5QGjyIS,OPENPHONE_USER_ID_ALI=USamAZurZL" \
  --port=8080 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=300 \
  --max-instances=10

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Get your service URL:"
echo "      gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)'"
echo ""
echo "   2. Update OpenPhone webhook URL to:"
echo "      https://YOUR-SERVICE-URL/webhooks/openphone/calls"
echo ""
echo "   3. Run database migrations (see DEPLOYMENT.md)"

