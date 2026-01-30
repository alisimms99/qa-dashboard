#!/bin/bash

echo "🗄️  QA Dashboard - Cloud SQL Migration Runner"
echo "=============================================="
echo ""

PROJECT_ID="ojpm-qa-dashboard"
REGION="us-central1"
INSTANCE_NAME="qa-dashboard-db"
DB_NAME="qa_dashboard"
DB_USER="root"
DB_PASSWORD="QADash2024Secure"
PROXY_PORT="3307"

# Check if cloud-sql-proxy is installed
if ! command -v cloud-sql-proxy &> /dev/null; then
    echo "❌ cloud-sql-proxy is not installed"
    echo ""
    echo "Install it with:"
    echo "  brew install cloud-sql-proxy"
    echo ""
    echo "Or download from:"
    echo "  https://cloud.google.com/sql/docs/mysql/sql-proxy"
    exit 1
fi

echo "✅ cloud-sql-proxy found"
echo ""

# Check if proxy is already running
if lsof -Pi :${PROXY_PORT} -sTCP:LISTEN -t >/dev/null ; then
    echo "⚠️  Cloud SQL proxy is already running on port ${PROXY_PORT}"
    echo "   Using existing proxy connection..."
    PROXY_PID=""
else
    echo "🔌 Starting Cloud SQL proxy on port ${PROXY_PORT}..."
    cloud-sql-proxy ${PROJECT_ID}:${REGION}:${INSTANCE_NAME} --port ${PROXY_PORT} &
    PROXY_PID=$!
    
    # Wait for proxy to start
    echo "⏳ Waiting for proxy to connect..."
    sleep 3
    
    if ! lsof -Pi :${PROXY_PORT} -sTCP:LISTEN -t >/dev/null ; then
        echo "❌ Failed to start Cloud SQL proxy"
        exit 1
    fi
    
    echo "✅ Cloud SQL proxy started (PID: ${PROXY_PID})"
fi

echo ""
echo "📊 Running database migrations..."
echo ""

# Set DATABASE_URL for migrations
export DATABASE_URL="mysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PROXY_PORT}/${DB_NAME}"

# Run drizzle-kit push to sync schema
npm run db:push

MIGRATION_EXIT_CODE=$?

if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo ""
    echo "✅ Migrations completed successfully!"
    echo ""
    echo "📋 Created/Updated tables:"
    echo "   - coaching_notes"
    echo "   - webhook_health"
    echo ""
else
    echo ""
    echo "❌ Migration failed with exit code: ${MIGRATION_EXIT_CODE}"
fi

# Clean up proxy if we started it
if [ ! -z "$PROXY_PID" ]; then
    echo ""
    echo "🛑 Stopping Cloud SQL proxy..."
    kill $PROXY_PID 2>/dev/null
    wait $PROXY_PID 2>/dev/null
    echo "✅ Proxy stopped"
fi

echo ""
if [ $MIGRATION_EXIT_CODE -eq 0 ]; then
    echo "✅ All done! Database schema is now in sync."
else
    echo "❌ Migration failed. Check the error messages above."
    exit 1
fi

