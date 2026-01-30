import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { verifyFirebaseToken } from "../lib/firebase-admin";
import { getUserByOpenId, upsertUser } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    // Extract Firebase ID token from Authorization header
    const authHeader = opts.req.headers.authorization;
    const idToken = authHeader?.replace("Bearer ", "");

    if (idToken) {
      // Verify Firebase token
      const firebaseUser = await verifyFirebaseToken(idToken);
      
      if (firebaseUser) {
        // Get or create user in database
        const existingUser = await getUserByOpenId(firebaseUser.uid);
        
        if (existingUser) {
          // Update last signed in
          await upsertUser({
            openId: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.name || null,
            lastSignedIn: new Date(),
          });
          user = existingUser;
        } else {
          // Create new user
          await upsertUser({
            openId: firebaseUser.uid,
            email: firebaseUser.email,
            name: firebaseUser.name || null,
            loginMethod: "google",
            role: "user", // Default role
            lastSignedIn: new Date(),
          });
          
          // Fetch the newly created user
          const newUser = await getUserByOpenId(firebaseUser.uid);
          user = newUser || null;
        }
      }
    }
  } catch (error) {
    // Authentication is optional for public procedures
    // Log error but don't throw
    console.error("[Context] Auth error:", error);
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
