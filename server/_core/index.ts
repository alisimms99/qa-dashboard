import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
// OAuth disabled - single-user localhost app doesn't need authentication
// import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ensureMySQLRunning } from "../utils/check-mysql";
import { openphoneWebhookRouter } from "../webhooks/openphone";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Add CORS middleware
  app.use(cors({
    origin: [
      'https://ojpm-qa-dashboard.web.app',
      'https://ojpm-qa-dashboard.firebaseapp.com',
      'http://localhost:5173', // For local development
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // Webhook routes (must be registered before tRPC routes for proper body parsing)
  app.use(openphoneWebhookRouter);
  
  // Training Manual API endpoint
  app.post('/api/training-manual/generate', async (req, res) => {
    try {
      const { generateTrainingManual } = await import('../utils/training-manual-generator');
      const options = req.body || {};
      const result = await generateTrainingManual(options);
      res.json(result);
    } catch (error) {
      console.error('[API] Training manual generation failed:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to generate training manual' 
      });
    }
  });
  
  // Outbound Analytics API endpoint
  app.get('/api/outbound/analytics', async (req, res) => {
    try {
      const { getOutboundAnalytics } = await import('../utils/outbound-analytics');
      const daysAgo = req.query.days ? parseInt(req.query.days as string) : 30;
      const analytics = await getOutboundAnalytics({ daysAgo });
      res.json(analytics);
    } catch (error) {
      console.error('[API] Outbound analytics failed:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Failed to get analytics' 
      });
    }
  });
  
  // Export API endpoints
  app.post('/api/export/pdf', async (req, res) => {
    try {
      const { exportToPDF } = await import('../utils/export');
      const filters = req.body.filters || {};
      const filepath = await exportToPDF(filters);
      res.download(filepath, (err) => {
        if (err) {
          console.error('[API] PDF download error:', err);
          res.status(500).json({ error: 'Failed to download PDF' });
        }
        // Clean up file after download
        setTimeout(() => {
          try {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          } catch (cleanupError) {
            console.error('[API] Failed to cleanup PDF file:', cleanupError);
          }
        }, 1000);
      });
    } catch (error) {
      console.error('[API] PDF export failed:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Export failed' 
      });
    }
  });

  app.post('/api/export/docx', async (req, res) => {
    try {
      const { exportToDOCX } = await import('../utils/export');
      const filters = req.body.filters || {};
      const filepath = await exportToDOCX(filters);
      res.download(filepath, (err) => {
        if (err) {
          console.error('[API] DOCX download error:', err);
          res.status(500).json({ error: 'Failed to download DOCX' });
        }
        // Clean up file after download
        setTimeout(() => {
          try {
            if (fs.existsSync(filepath)) {
              fs.unlinkSync(filepath);
            }
          } catch (cleanupError) {
            console.error('[API] Failed to cleanup DOCX file:', cleanupError);
          }
        }, 1000);
      });
    } catch (error) {
      console.error('[API] DOCX export failed:', error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : 'Export failed' 
      });
    }
  });
  
  // Health check endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      service: 'qa-dashboard-api'
    });
  });
  
  // Serve training materials directory
  app.use('/training-materials', express.static(path.join(process.cwd(), 'training-materials')));
  
  // OAuth disabled - single-user localhost app doesn't need authentication
  // registerOAuthRoutes(app);
  
  // tRPC API - MUST be before static file serving to avoid catch-all route
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    // Conditionally import vite.ts only in development (uses import.meta, not compatible with CommonJS)
    const viteModule = await import('./vite.js');
    await viteModule.setupVite(app, server);
  } else {
    // In production, serve pre-built static files from dist/client
    app.use(express.static(path.join(process.cwd(), 'dist/client')));
    // Fallback to index.html for SPA routing - but exclude API routes
    app.get('*', (req, res, next) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/')) {
        return next();
      }
      res.sendFile(path.join(process.cwd(), 'dist/client', 'index.html'));
    });
  }

  // Initialize scheduled sync service (only in development - production uses Cloud Scheduler)
  if (process.env.NODE_ENV !== 'production') {
    const { initializeScheduler } = await import('../scheduler.js');
    initializeScheduler();
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const preferredPort = parseInt(process.env.PORT || "3001");
  
  // In production, use PORT directly. In development, find available port.
  const PORT = isProduction ? preferredPort : await findAvailablePort(preferredPort);

  if (!isProduction && PORT !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${PORT} instead`);
  }

  // Only use ngrok in development
  if (!isProduction) {
    try {
      const { startNgrok } = await import('../utils/ngrok-setup.js');
      await startNgrok(PORT);
    } catch (error) {
      console.error('⚠️  Ngrok failed to start. Webhooks will not work without a public URL.');
      console.error('   To enable webhooks, add NGROK_AUTH_TOKEN to your .env file.');
    }
  } else {
    console.log('🚀 Production mode - using Cloud Run URL');
    console.log('Webhook endpoint: https://[YOUR-CLOUD-RUN-URL]/webhooks/openphone/calls');
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server listening on port ${PORT}`);
  });
}

/**
 * Startup function - ensures MySQL is running before starting the server
 */
async function startup() {
  try {
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Only check MySQL in development (Cloud Run uses Cloud SQL)
    if (!isProduction) {
      // Ensure MySQL is running and database is accessible
      await ensureMySQLRunning();
    } else {
      console.log('🚀 Production mode - skipping local MySQL check (using Cloud SQL)');
    }

    // Start the server
    await startServer();
  } catch (error) {
    console.error("\n❌ Failed to start server:", error);
    process.exit(1);
  }
}

startup();
