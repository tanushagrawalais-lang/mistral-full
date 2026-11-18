import { useState, type FormEvent } from "react";
import { useSignInWithGoogle } from "@convex-dev/auth/methods/google/react";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Moon,
  Sun,
  User as UserIcon,
} from "lucide-react";
import { api } from "@convex/api";
import nurseBg from "../assets/images/nurse_bg.jpg";

type AuthFormMode = "signin" | "signup" | "forgot";

interface WelcomeAuthPageProps {
  theme: "light" | "dark";
  onToggleTheme: () => void;
  compact?: boolean;
}

export function WelcomeAuthPage({ theme, onToggleTheme, compact = false }: WelcomeAuthPageProps) {
  const { signIn } = useSignInWithGoogle(api.auth);
  const [authMode, setAuthMode] = useState<AuthFormMode>("signin");
  const [fullName, setFullName] = useState("");
  const [phcDistrict, setPhcDistrict] = useState("Satara District Hub");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const resetMessages = () => {
    setErrorMessage(null);
    setInfoMessage(null);
  };

  const handleGoogleSignIn = () => {
    resetMessages();
    setIsSubmitting(true);
    void signIn().catch((error: unknown) => {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Google sign-in could not be started. Please try again.",
      );
      setIsSubmitting(false);
    });
  };

  const handleEmailAuthSubmit = (event: FormEvent) => {
    event.preventDefault();
    resetMessages();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }
    if (authMode === "forgot") {
      setInfoMessage(
        `Password reset for ${cleanEmail} is not available yet. Continue with Google to open the console.`,
      );
      return;
    }
    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }
    if (authMode === "signup" && !fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }
    setErrorMessage(
      compact
        ? "Email and password sign-in is not connected on this field unit. Continue with Google, then complete nurse onboarding."
        : "Email and password sign-in is not connected on this console. Continue with Google, then complete specialist onboarding.",
    );
  };

  const title =
    authMode === "signin"
      ? compact
        ? "PHC Nurse Sign In"
        : "Specialist Physician Sign In"
      : authMode === "signup"
        ? compact
          ? "Create Nurse Account"
          : "Create Specialist Account"
        : "Reset Account Password";

  return (
    <div
      className={`relative z-10 min-h-screen flex flex-col transition-colors ${
        compact
          ? "text-[#FAF9F6] bg-cover bg-center bg-fixed"
          : "text-[#111315] dark:text-[#F8FAFC]"
      }`}
      style={compact ? { backgroundImage: `url(${nurseBg})` } : undefined}
    >
      <div className={compact ? "min-h-screen flex flex-col backdrop-blur-md bg-[#111315]/35" : "min-h-screen flex flex-col"}>
      <div className="px-4 sm:px-6 lg:px-10 pt-7 pb-2">
        <div className={`${compact ? "max-w-[430px]" : "max-w-6xl"} w-full mx-auto flex items-center justify-between gap-4`}>
          <span className={`font-serif font-bold tracking-tight leading-none ${compact ? "text-[#FAF9F6] text-3xl" : "text-[#111315] dark:text-[#F8FAFC] text-4xl sm:text-5xl lg:text-[3.5rem]"}`}>
            Mistral
          </span>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light mode" : "Night mode"}
            className={`inline-flex items-center justify-center min-h-12 min-w-12 w-12 h-12 rounded-full backdrop-blur-md transition-all duration-300 ease-out cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 ${
              compact
                ? "border border-white/25 bg-white/15 text-[#FAF9F6] hover:bg-white hover:text-[#111315] focus-visible:outline-white"
                : "border border-[#111315]/18 dark:border-white/22 bg-[#FFFFFF]/88 dark:bg-[#111827]/85 text-[#111315] dark:text-[#F8FAFC] hover:bg-[#111315] hover:text-[#FAF9F6] dark:hover:bg-[#F8FAFC] dark:hover:text-[#111315] focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
            }`}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Moon className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <section
        id="top-welcome"
        className="flex-1 flex items-center py-6 lg:py-12 px-4 sm:px-6 lg:px-10"
      >
        <div className={`${compact ? "max-w-[430px]" : "max-w-6xl"} w-full mx-auto grid grid-cols-1 ${compact ? "" : "lg:grid-cols-12 gap-10 lg:gap-12"} items-center`}>
          {!compact && (
          <div className="lg:col-span-7 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs font-medium text-[#111315]/75 dark:text-[#E2E8F0]/85">
              <span
                className="inline-block w-2 h-2 rounded-xs bg-[#0D9488] dark:bg-[#2DD4BF]"
                aria-hidden="true"
              />
              <span>District Respiratory Telemetry & Triage</span>
            </div>

            <h1 className="font-serif text-5xl sm:text-6xl lg:text-[4.25rem] font-semibold tracking-tight leading-[1.02] text-[#111315] dark:text-[#F8FAFC] text-balance">
              Listen closer to every <span className="italic font-medium">breath.</span>
            </h1>

            <p className="max-w-xl text-base sm:text-[17px] leading-relaxed text-[#111315]/85 dark:text-[#E2E8F0]/90">
              SpiroVoice bridges the diagnostic gap between rural Primary Health Centres and
              urban pulmonologists through ultra-low-bandwidth acoustic triage. Built to
              survive unstable 2G and 3G networks, the platform compresses cough and
              sustained vocal phonation samples by over 98%—turning heavy audio into
              sub-20 KB clinical packets paired with real-time edge frequency biomarkers and
              longitudinal patient logbooks.
            </p>

            <div className="pt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs font-mono tabular-nums text-[#111315]/80 dark:text-[#E2E8F0]/80">
              <span>18.4 KB Avg Opus Packet</span>
              <span aria-hidden="true">·</span>
              <span>98.9% Bandwidth Saved vs WAV</span>
              <span aria-hidden="true">·</span>
              <span>Urgent-First District Queue</span>
            </div>
          </div>
          )}

          <div id="doctor-signin" className={compact ? "" : "lg:col-span-5"}>
            <div className="rounded-2xl border border-white/20 bg-[#FFFFFF]/88 dark:bg-[#111827]/86 backdrop-blur-md p-6 sm:p-7 shadow-lg space-y-5 text-[#111315] dark:text-[#F8FAFC] transition-all duration-300 ease-out">
              <div className="space-y-1">
                <h2 className="text-lg font-bold tracking-tight text-[#111315] dark:text-[#F8FAFC]">
                  {title}
                </h2>
                {compact && (
                  <p className="text-xs text-[#111315]/65 dark:text-[#F1F5F9]/70">
                    Rural PHC field unit. Google sign-in opens nurse onboarding on first use.
                  </p>
                )}
              </div>

              {authMode !== "forgot" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleGoogleSignIn}
                    className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-[#111315]/20 dark:border-white/18 bg-[#FFFFFF] dark:bg-[#1E293B] hover:bg-[#FAF9F6] dark:hover:bg-[#273549] text-xs font-semibold text-[#111315] dark:text-[#F8FAFC] transition-colors cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <GoogleMark />
                    )}
                    <span>Continue with Google</span>
                  </button>

                  <div className="relative flex items-center py-0.5">
                    <div className="flex-grow border-t border-[#111315]/12 dark:border-white/12" />
                    <span className="shrink mx-3 text-[11px] font-medium text-[#111315]/50 dark:text-[#F1F5F9]/55">
                      or with email
                    </span>
                    <div className="flex-grow border-t border-[#111315]/12 dark:border-white/12" />
                  </div>
                </>
              )}

              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-[#E63946]/35 dark:border-[#E63946]/50 bg-[#E63946]/[0.07] dark:bg-[#E63946]/[0.14] px-3 py-2.5 text-xs text-[#111315] dark:text-[#F8FAFC]"
                >
                  <span className="font-semibold text-[#E63946] dark:text-[#FF6B77]">
                    Authentication notice:{" "}
                  </span>
                  {errorMessage}
                </div>
              )}

              {infoMessage && (
                <div
                  role="status"
                  className="rounded-lg border border-[#0D9488]/35 dark:border-[#2DD4BF]/40 bg-[#0D9488]/[0.08] dark:bg-[#0D9488]/[0.16] px-3 py-2.5 text-xs text-[#111315] dark:text-[#F8FAFC] flex items-start gap-2"
                >
                  <CheckCircle2
                    className="w-4 h-4 text-[#0D9488] dark:text-[#2DD4BF] shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                  <span>{infoMessage}</span>
                </div>
              )}

              <form onSubmit={handleEmailAuthSubmit} className="space-y-3.5" noValidate>
                {authMode === "signup" && (
                  <>
                    <div className="space-y-1">
                      <label
                        htmlFor="doc-name"
                        className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]"
                      >
                        Full Name
                      </label>
                      <div className="relative">
                        <UserIcon
                          className="w-3.5 h-3.5 text-[#111315]/45 dark:text-[#F1F5F9]/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="doc-name"
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Dr. Aarav Kulkarni"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/40 dark:placeholder:text-[#F1F5F9]/40 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label
                        htmlFor="doc-district"
                        className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]"
                      >
                        Assigned District / PHC Hub
                      </label>
                      <div className="relative">
                        <MapPin
                          className="w-3.5 h-3.5 text-[#111315]/45 dark:text-[#F1F5F9]/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                          aria-hidden="true"
                        />
                        <input
                          id="doc-district"
                          type="text"
                          value={phcDistrict}
                          onChange={(e) => setPhcDistrict(e.target.value)}
                          placeholder="Satara District Hub"
                          className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/40 dark:placeholder:text-[#F1F5F9]/40 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-1">
                  <label
                    htmlFor="doc-email"
                    className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail
                      className="w-3.5 h-3.5 text-[#111315]/45 dark:text-[#F1F5F9]/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                      aria-hidden="true"
                    />
                    <input
                      id="doc-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="doctor@districthealth.org"
                      className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/40 dark:placeholder:text-[#F1F5F9]/40 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
                    />
                  </div>
                </div>

                {authMode !== "forgot" && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <label
                        htmlFor="doc-password"
                        className="block text-xs font-semibold text-[#111315] dark:text-[#F8FAFC]"
                      >
                        Password
                      </label>
                      {authMode === "signin" && (
                        <button
                          type="button"
                          onClick={() => {
                            resetMessages();
                            setAuthMode("forgot");
                          }}
                          className="text-[11px] font-medium text-[#111315]/65 dark:text-[#F1F5F9]/65 hover:text-[#111315] dark:hover:text-[#F8FAFC] underline-offset-2 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock
                        className="w-3.5 h-3.5 text-[#111315]/45 dark:text-[#F1F5F9]/50 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                        aria-hidden="true"
                      />
                      <input
                        id="doc-password"
                        type={showPassword ? "text" : "password"}
                        required
                        autoComplete={authMode === "signup" ? "new-password" : "current-password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full pl-9 pr-9 py-2 text-xs rounded-lg border border-[#111315]/18 dark:border-white/18 bg-[#FAF9F6] dark:bg-[#0B0F17]/80 text-[#111315] dark:text-[#F8FAFC] placeholder:text-[#111315]/40 dark:placeholder:text-[#F1F5F9]/40 focus:bg-[#FFFFFF] dark:focus:bg-[#0B0F17] focus:outline-none focus:border-[#111315] dark:focus:border-[#F8FAFC]"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#111315]/50 dark:text-[#F1F5F9]/55 hover:text-[#111315] dark:hover:text-[#F8FAFC] cursor-pointer"
                      >
                        {showPassword ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 rounded-lg bg-[#111315] dark:bg-[#F8FAFC] text-[#FAF9F6] dark:text-[#111315] text-xs font-bold tracking-tight hover:bg-[#111315]/88 dark:hover:bg-[#E2E8F0] transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111315] dark:focus-visible:outline-[#F8FAFC]"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                  <span>
                    {authMode === "signin"
                      ? compact
                        ? "Sign In to Field Unit"
                        : "Sign In to Console"
                      : authMode === "signup"
                        ? compact
                          ? "Create Nurse Account"
                          : "Create Specialist Account"
                        : "Send Reset Link"}
                  </span>
                  {!isSubmitting && <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />}
                </button>
              </form>

              <div className="pt-2 border-t border-[#111315]/10 dark:border-white/10 flex items-center justify-between text-xs text-[#111315]/70 dark:text-[#F1F5F9]/70">
                {authMode === "signin" ? (
                  <>
                    <span>{compact ? "New PHC nurse?" : "New district specialist?"}</span>
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setAuthMode("signup");
                      }}
                      className="font-semibold text-[#0D9488] dark:text-[#2DD4BF] hover:underline cursor-pointer"
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    <span>Already registered?</span>
                    <button
                      type="button"
                      onClick={() => {
                        resetMessages();
                        setAuthMode("signin");
                      }}
                      className="font-semibold text-[#111315] dark:text-[#F8FAFC] hover:underline cursor-pointer"
                    >
                      Back to sign in
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}
