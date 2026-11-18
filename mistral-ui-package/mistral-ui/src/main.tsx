import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import { createRoot } from "react-dom/client";
import { api } from "@convex/api";
import App from "./App.tsx";
import "./index.css";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

createRoot(document.getElementById("root")!).render(
  <ConvexAuthProvider
    client={convex}
    api={{
      refreshSession: api.auth.refreshSession,
      signOut: api.auth.signOut,
      isAuthenticated: api.auth.isAuthenticated,
    }}
  >
    <App />
  </ConvexAuthProvider>,
);
