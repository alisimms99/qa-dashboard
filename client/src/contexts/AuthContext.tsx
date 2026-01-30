import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
  User,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { toast } from "sonner";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Allowed email domains
const ALLOWED_DOMAIN = "oddjobspropertymaintenance.com";
const ALLOWED_EMAILS = [
  "ali@oddjobspropertymaintenance.com",
  "mary@oddjobspropertymaintenance.com",
  "fatima@oddjobspropertymaintenance.com",
];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Verify domain restriction
        const email = firebaseUser.email;
        if (!email) {
          console.error("[Auth] No email found for user");
          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }

        // Check if email is in allowed list OR matches domain
        const isAllowed =
          ALLOWED_EMAILS.includes(email.toLowerCase()) ||
          email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

        if (!isAllowed) {
          console.error(`[Auth] Unauthorized email domain: ${email}`);
          toast.error("Access denied. Only @oddjobspropertymaintenance.com emails are allowed.");
          await signOut(auth);
          setUser(null);
          setLoading(false);
          return;
        }

        setUser(firebaseUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async () => {
    try {
      setLoading(true);
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Verify domain restriction
      const email = user.email;
      if (!email) {
        throw new Error("No email found");
      }

      const isAllowed =
        ALLOWED_EMAILS.includes(email.toLowerCase()) ||
        email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);

      if (!isAllowed) {
        await signOut(auth);
        throw new Error("Access denied. Only @oddjobspropertymaintenance.com emails are allowed.");
      }

      toast.success(`Welcome, ${user.displayName || email}!`);
    } catch (error: any) {
      console.error("[Auth] Sign in error:", error);
      if (error.code === "auth/popup-closed-by-user") {
        toast.error("Sign-in cancelled");
      } else if (error.message.includes("Access denied")) {
        toast.error(error.message);
      } else {
        toast.error("Failed to sign in. Please try again.");
      }
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast.success("Signed out successfully");
    } catch (error) {
      console.error("[Auth] Logout error:", error);
      toast.error("Failed to sign out");
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

