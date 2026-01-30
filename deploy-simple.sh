#!/bin/bash

echo "🚀 QA Dashboard - Simple Docker Deploy"
echo "======================================"
echo ""

# Check environment variables
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

echo "✅ Environment variables set"
echo ""

PROJECT_ID="ojpm-qa-dashboard"
REGION="us-central1"
SERVICE_NAME="qa-dashboard-api"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "   Install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check if frontend is built
if [ ! -d "dist/client" ]; then
    echo "⚠️  Frontend not built. Building now..."
    npm run build:client
    if [ $? -ne 0 ]; then
        echo "❌ Frontend build failed"
        exit 1
    fi
fi

echo "📦 Building Docker image locally (AMD64 for Cloud Run compatibility)..."
docker build --platform linux/amd64 -t ${IMAGE_NAME}:latest .

if [ $? -ne 0 ]; then
    echo "❌ Docker build failed"
    exit 1
fi

echo "✅ Docker build successful"
echo ""

echo "📤 Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}:latest

if [ $? -ne 0 ]; then
    echo "❌ Docker push failed"
    echo "   You may need to run: gcloud auth configure-docker"
    exit 1
fi

echo "✅ Image pushed"
echo ""

echo "🚀 Deploying to Cloud Run..."

gcloud run deploy ${SERVICE_NAME} \
  --image=${IMAGE_NAME}:latest \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances=ojpm-qa-dashboard:us-central1:qa-dashboard-db \
  --set-env-vars="NODE_ENV=production,DB_SOCKET_PATH=/cloudsql/ojpm-qa-dashboard:us-central1:qa-dashboard-db,DB_USER=root,DB_PASSWORD=QADash2024Secure,DB_NAME=qa_dashboard,OPENPHONE_API_KEY=${OPENPHONE_API_KEY},OPENAI_API_KEY=${OPENAI_API_KEY},OPENPHONE_MAIN_PHONE_NUMBER_ID=PNVbbBqeqM,OPENPHONE_OUTBOUND_PHONE_NUMBER_ID=PNBANAZERt,OPENPHONE_USER_ID_JOY=USO5QGjyIS,OPENPHONE_USER_ID_ALI=USamAZurZL" \
  --memory=1Gi \
  --cpu=1 \
  --timeout=300 \
  --port=8080 \
  --max-instances=10

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🌐 Your service is now live at:"
    SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --region=${REGION} --format='value(status.url)')
    echo "   ${SERVICE_URL}"
    echo ""
    echo "📋 Next steps:"
    echo "   1. Update OpenPhone webhook URL to:"
    echo "      ${SERVICE_URL}/webhooks/openphone/calls"
    echo ""
    echo "   2. Run database migrations:"
    echo "      See DEPLOYMENT.md for instructions"
    echo ""
else
    echo "❌ Deployment failed"
    exit 1
fi

