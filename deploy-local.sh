#!/bin/bash

# QA Dashboard Cloud Run deployment (builds Docker image locally first)
# This avoids the ZIP timestamp issue with gcloud source deployment

set -e

echo "🚀 QA Dashboard Cloud Run Deployment (Local Build)"
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
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "✅ Environment variables set"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Image: ${IMAGE_NAME}"
echo ""

# Check if frontend is built
if [ ! -d "dist/client" ]; then
  echo "⚠️  Frontend not built. Building now..."
  npm run build:client
fi

echo "📦 Building Docker image..."
echo ""

# Build Docker image
docker build -t ${IMAGE_NAME} .

echo ""
echo "📤 Pushing Docker image to Google Container Registry..."
echo ""

# Push to GCR
docker push ${IMAGE_NAME}

echo ""
echo "🚀 Deploying to Cloud Run..."
echo ""

# Deploy to Cloud Run
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
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

