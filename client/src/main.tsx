import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

// Get API URL - always use Cloud Run URL in production
const getApiUrl = () => {
  // In production, always use the Cloud Run URL directly
  if (import.meta.env.PROD) {
    return "https://qa-dashboard-api-azn4h2uypq-uc.a.run.app/api/trpc";
  }
  
  // Check for environment variable override
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) {
    return `${envUrl}/api/trpc`;
  }
  
  // In development, use relative path (Vite proxy handles it)
  return "/api/trpc";
};

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: getApiUrl(),
      transformer: superjson,
      async headers() {
        // Get Firebase ID token from auth
        const { auth } = await import("./lib/firebase");
        const user = auth.currentUser;
        
        if (user) {
          try {
            const idToken = await user.getIdToken();
            return {
              authorization: `Bearer ${idToken}`,
            };
          } catch (error) {
            console.error("[TRPC] Failed to get ID token:", error);
            return {};
          }
        }
        
        return {};
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
