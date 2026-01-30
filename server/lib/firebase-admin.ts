import * as admin from "firebase-admin";

// Initialize Firebase Admin SDK lazily
let app: admin.app.App | undefined;
let authInstance: admin.auth.Auth | null = null;

export function initializeFirebaseAdmin(): admin.app.App | undefined {
  // Return existing app if already initialized
  if (app) {
    return app;
  }

  // Check if already initialized globally
  if (admin.apps.length > 0) {
    app = admin.apps[0];
    authInstance = admin.auth(app);
    return app;
  }

  try {
    // Try to use service account JSON from environment variable
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    
    if (serviceAccountJson) {
      try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        app = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.FIREBASE_PROJECT_ID || "ojpm-qa-dashboard",
        });
        authInstance = admin.auth(app);
        console.log("[Firebase Admin] ✅ Initialized with service account JSON");
        return app;
      } catch (error) {
        console.error("[Firebase Admin] ❌ Failed to parse service account JSON:", error);
        // Continue to try default credentials
      }
    }
    
    // Try default credentials (works in Cloud Run with proper IAM)
    try {
      app = admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.FIREBASE_PROJECT_ID || "ojpm-qa-dashboard",
      });
      authInstance = admin.auth(app);
      console.log("[Firebase Admin] ✅ Initialized with default credentials");
      return app;
    } catch (defaultError) {
      console.warn("[Firebase Admin] ⚠️ Default credentials failed:", defaultError);
      // Try without credentials (for local dev)
      try {
        app = admin.initializeApp({
          projectId: process.env.FIREBASE_PROJECT_ID || "ojpm-qa-dashboard",
        });
        authInstance = admin.auth(app);
        console.log("[Firebase Admin] ⚠️ Initialized without credentials (auth will be disabled)");
        return app;
      } catch (noCredsError) {
        console.warn("[Firebase Admin] ⚠️ Could not initialize Firebase Admin - auth will be disabled");
        console.warn("[Firebase Admin] This is OK for development/testing without Firebase credentials");
        app = undefined;
        authInstance = null;
        return undefined;
      }
    }
  } catch (error) {
    console.error("[Firebase Admin] ❌ Initialization error:", error);
    console.warn("[Firebase Admin] ⚠️ Auth will be disabled - app can still run without authentication");
    app = undefined;
    authInstance = null;
    return undefined;
  }
}

export function getAuth(): admin.auth.Auth | null {
  if (!app) {
    initializeFirebaseAdmin();
  }
  return authInstance;
}

// Verify Firebase ID token and check domain restriction
export async function verifyFirebaseToken(idToken: string): Promise<{
  uid: string;
  email: string;
  name?: string;
  picture?: string;
} | null> {
  const auth = getAuth();
  
  if (!auth) {
    console.warn("[Auth] Firebase Admin not initialized - skipping token verification");
    return null;
  }

  try {
    const decodedToken = await auth.verifyIdToken(idToken);
    
    const email = decodedToken.email;
    if (!email) {
      console.error("[Auth] No email in token");
      return null;
    }

    // Verify domain restriction
    const ALLOWED_DOMAIN = "oddjobspropertymaintenance.com";
    const ALLOWED_EMAILS = [
      "ali@oddjobspropertymaintenance.com",
      "mary@oddjobspropertymaintenance.com",
      "fatima@oddjobspropertymaintenance.com",
    ];

    const isAllowed =
      ALLOWED_EMAILS.includes(email.toLowerCase()) ||
      email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

    if (!isAllowed) {
      console.error(`[Auth] Unauthorized email domain: ${email}`);
      return null;
    }

    return {
      uid: decodedToken.uid,
      email: email,
      name: decodedToken.name,
      picture: decodedToken.picture,
    };
  } catch (error) {
    console.error("[Auth] Token verification failed:", error);
    return null;
  }
}

export async function verifyIdToken(token: string) {
  return verifyFirebaseToken(token);
}

export default app;

