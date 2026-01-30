#!/bin/bash

# QA Dashboard Cloud Run Deployment (Fixed - uses Cloud Build to avoid ZIP timestamp issue)
# Usage: ./deploy-fixed.sh

set -e

echo "🚀 QA Dashboard Cloud Run Deployment (Fixed)"
echo "============================================"
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
echo "   (This avoids the ZIP timestamp issue)"
echo ""

# Submit build with environment variables
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_OPENPHONE_API_KEY="${OPENPHONE_API_KEY}",_OPENAI_API_KEY="${OPENAI_API_KEY}"

echo ""
echo "🔧 Setting environment variables on Cloud Run service..."
echo ""

# Set environment variables (Cloud Build doesn't support secrets in substitutions easily)
gcloud run services update qa-dashboard-api \
  --region=${REGION} \
  --update-env-vars="OPENPHONE_API_KEY=${OPENPHONE_API_KEY},OPENAI_API_KEY=${OPENAI_API_KEY}"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Get your service URL:"
echo "      gcloud run services describe qa-dashboard-api --region=${REGION} --format='value(status.url)'"
echo ""
echo "   2. Update OpenPhone webhook URL to:"
echo "      https://YOUR-SERVICE-URL/webhooks/openphone/calls"
echo ""
echo "   3. Run database migrations (see DEPLOYMENT.md)"

