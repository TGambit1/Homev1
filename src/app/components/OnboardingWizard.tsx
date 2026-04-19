import React, { useEffect, useMemo, useRef, useState } from "react";
import { projectId } from "../../../utils/supabase/info";
import { extractPartnerInviteSmsBody } from "../../utils/partnerInviteSms";
import { useCalendarConnections } from "../hooks/useCalendarConnections";
import { useFinancialConnections } from "../hooks/useFinancialConnections";

type OnboardingPhase =
  | "provisioning"
  | "theme"
  | "phone"
  | "phoneVerify"
  | "calendar"
  | "financial"
  | "partnerInvite"
  | "textAgent"
  | "complete";

const STEPS = [
  { key: "space", label: "Setting up your shared space..." },
  { key: "agent", label: "Creating your Homebase agent..." },
  { key: "ready", label: "Getting your weekly check-in ready..." },
];

/** Minimum time to show the provisioning card before the theme step (avoids a sub-second flash). */
const PROVISIONING_MIN_MS = 7200;

async function postJson<T>(url: string, token: string, body: any): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function OnboardingWizard({
  sessionToken,
  userId,
  user,
  accentColor,
  onDone,
  onContinueHomebase,
  onRefreshUser,
  onUiThemeSaved,
}: {
  sessionToken: string | null;
  userId: string | null;
  user: any;
  accentColor: string;
  onDone: () => void;
  onContinueHomebase?: () => void;
  /** After theme preferences are saved, refresh session user from profiles (relationship name, etc.). */
  onRefreshUser?: () => void | Promise<void>;
  /** Keeps App `theme` and `document.documentElement` in sync with onboarding UI theme. */
  onUiThemeSaved?: (theme: "light" | "dark" | "auto") => void;
}) {
  const [phase, setPhase] = useState<OnboardingPhase>("provisioning");
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingTheme, setSavingTheme] = useState(false);
  const [relationshipName, setRelationshipName] = useState("");
  const [location, setLocation] = useState("");
  const [selectedAccent, setSelectedAccent] = useState(accentColor);
  const [selectedUiTheme, setSelectedUiTheme] = useState<"light" | "dark" | "auto">("light");
  const [phone1, setPhone1] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otp1, setOtp1] = useState("");
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [phone1Verified, setPhone1Verified] = useState(false);
  const [phone2, setPhone2] = useState("");
  const [otp2, setOtp2] = useState("");
  const [phone2Verified, setPhone2Verified] = useState(false);

  const person1Name = useMemo(() => user?.person1Name || user?.person1_name || "Partner 1", [user]);
  const person2Name = useMemo(() => user?.person2Name || user?.person2_name || "Partner 2", [user]);
  const rawPerson2NameFromProfile = useMemo(
    () => String(user?.person2Name ?? user?.person2_name ?? "").trim(),
    [user?.person2Name, user?.person2_name],
  );
  const hasCustomPartner2DisplayName =
    rawPerson2NameFromProfile.length > 0 && person2Name !== "Partner 2";
  const activePartner = useMemo<"person1" | "person2">(
    () => (user?.loggedInAs === "person2" ? "person2" : "person1"),
    [user?.loggedInAs],
  );
  const isPartner2 = activePartner === "person2";
  const hasPartner2Email = useMemo(
    () => !!(user?.secondaryEmail && String(user.secondaryEmail).trim()),
    [user?.secondaryEmail],
  );
  const person1PhoneLabel = `${person1Name}'s phone`;
  const person2PhoneLabel = `${person2Name}'s phone`;

  const {
    person1Connected,
    person2Connected,
    loading: calLoading,
    error: calHookErr,
    connectGoogleCalendar,
    disconnectCalendar,
  } = useCalendarConnections(userId);

  const {
    linkedAccounts,
    financialError,
    financialLoading,
    connectBankAccount,
  } = useFinancialConnections(userId);

  const p1BankCount = useMemo(
    () =>
      linkedAccounts.filter((a) => ((a as { partner_role?: string }).partner_role || "person1") === "person1")
        .length,
    [linkedAccounts],
  );
  const p2BankCount = useMemo(
    () =>
      linkedAccounts.filter((a) => (a as { partner_role?: string }).partner_role === "person2").length,
    [linkedAccounts],
  );

  const helperNumber = "+12014855992";

  const partnerInviteUrl = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/partner-invite/message`;
  const partnerInviteSendUrl = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/partner-invite/send`;
  const partnerDisplayNameUrl = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/partner-display-name`;
  const draftClosingLine = "Does this sound like you? You can send it as is, or tell me what to change.";

  const [partnerInviteDisplayNameSaved, setPartnerInviteDisplayNameSaved] = useState(false);
  const [partner2InviteNameDraft, setPartner2InviteNameDraft] = useState("");
  const [savingPartnerDisplayName, setSavingPartnerDisplayName] = useState(false);
  const canStartPartnerInviteChat = hasCustomPartner2DisplayName || partnerInviteDisplayNameSaved;

  const [inviteThreadId] = useState(() =>
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `invite-${Date.now()}`,
  );
  const [inviteMessages, setInviteMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [inviteDraftSms, setInviteDraftSms] = useState<string | null>(null);
  const [inviteInput, setInviteInput] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteRetryKey, setInviteRetryKey] = useState(0);
  const inviteBootstrapRef = useRef(false);
  const inviteMessagesEndRef = useRef<HTMLDivElement>(null);

  const [partnerInviteSent, setPartnerInviteSent] = useState(false);
  const [partner2PhoneInput, setPartner2PhoneInput] = useState("");
  const [partnerInviteSendNowLoading, setPartnerInviteSendNowLoading] = useState(false);
  const [partnerInviteSentPhone, setPartnerInviteSentPhone] = useState<string | null>(null);
  const partnerInvitePhoneHydratedRef = useRef(false);

  const latestDraft = useMemo(() => {
    const lastAssistant = [...inviteMessages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant?.text) return null;
    const t = lastAssistant.text.trim();
    return t.endsWith(draftClosingLine) ? t : null;
  }, [inviteMessages]);

  useEffect(() => {
    inviteMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [inviteMessages, inviteLoading, inviteSending]);

  const palette = [
    "#7eb6eb",
    "#8b5cf6",
    "#14b8a6",
    "#f97316",
    "#ec4899",
    "#22c55e",
  ];

  // Parent re-renders pass a new onDone identity and user may get a new reference; keep init effect
  // keyed only to sessionToken/userId so we don’t reset phase mid-flow.
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const initNamesRef = useRef({ person1Name, person2Name });
  initNamesRef.current = { person1Name, person2Name };

  /** Relationship label lives only on profiles; hydrate theme field from verify/login user once per theme visit. */
  const relationshipHydratedRef = useRef(false);
  useEffect(() => {
    relationshipHydratedRef.current = false;
  }, [userId]);

  useEffect(() => {
    if (phase !== "theme") return;
    if (relationshipHydratedRef.current) return;
    const v = user?.relationshipName ?? user?.relationship_name;
    if (v != null && String(v).trim()) {
      setRelationshipName(String(v).trim());
    }
    relationshipHydratedRef.current = true;
  }, [phase, user?.relationshipName, user?.relationship_name]);

  // Apply UI theme immediately during onboarding so selection is visible.
  useEffect(() => {
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (!root) return;

    const clear = () => {
      root.classList.remove("dark");
      root.removeAttribute("data-theme");
    };

    if (selectedUiTheme === "auto") {
      clear();
      const prefersDark =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      root.classList.toggle("dark", !!prefersDark);
      root.setAttribute("data-theme", prefersDark ? "dark" : "light");
      return;
    }

    root.classList.toggle("dark", selectedUiTheme === "dark");
    root.setAttribute("data-theme", selectedUiTheme);
  }, [selectedUiTheme]);

  useEffect(() => {
    if (phase !== "partnerInvite") {
      partnerInvitePhoneHydratedRef.current = false;
      return;
    }
    if (partnerInviteSent) return;
    if (partnerInvitePhoneHydratedRef.current) return;

    const pref =
      user?.person2Phone ??
      user?.person2_phone ??
      user?.person2PhoneNumber ??
      user?.phone2 ??
      "";
    const normalized = typeof pref === "string" ? pref.trim() : "";
    if (normalized) setPartner2PhoneInput(normalized);

    partnerInvitePhoneHydratedRef.current = true;
  }, [phase, partnerInviteSent, user]);

  /** Bootstrap partner-invite thread (isolated from main /chat). Person 2 uses a different step (no invite SMS). */
  useEffect(() => {
    if (phase !== "partnerInvite" || !sessionToken || isPartner2) return;
    if (!canStartPartnerInviteChat) return;
    if (inviteBootstrapRef.current) return;
    inviteBootstrapRef.current = true;
    let cancelled = false;
    (async () => {
      setInviteLoading(true);
      setError(null);
      try {
        const data = await postJson<{ success: boolean; reply: string; draftSms?: string }>(
          partnerInviteUrl,
          sessionToken,
          {
          start: true,
          threadId: inviteThreadId,
          },
        );
        if (cancelled) return;
        setInviteMessages([{ role: "assistant", text: data.reply }]);
        if (typeof data.draftSms === "string" && data.draftSms.trim()) {
          setInviteDraftSms(data.draftSms.trim());
        } else {
          setInviteDraftSms(null);
        }
      } catch (e: unknown) {
        inviteBootstrapRef.current = false;
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setInviteLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, sessionToken, partnerInviteUrl, inviteThreadId, inviteRetryKey, canStartPartnerInviteChat, isPartner2]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let waitTimer: number | undefined;

    const runSteps = () => {
      // Step ticks within PROVISIONING_MIN_MS so all three states show before theme.
      const timers: number[] = [];
      timers.push(window.setTimeout(() => setStepIndex(1), 2400));
      timers.push(window.setTimeout(() => setStepIndex(2), 5200));
      return () => timers.forEach((t) => window.clearTimeout(t));
    };

    const cleanupSteps = runSteps();

    const waitProvisioningMinimum = () =>
      new Promise<void>((resolve) => {
        const elapsed = Date.now() - startedAt;
        const ms = Math.max(0, PROVISIONING_MIN_MS - elapsed);
        if (ms <= 0) {
          resolve();
          return;
        }
        waitTimer = window.setTimeout(() => {
          waitTimer = undefined;
          resolve();
        }, ms);
      });

    const init = async () => {
      if (!sessionToken || !userId) {
        setError("Missing auth state. Please log in again.");
        setLoading(false);
        setPhase("theme");
        return;
      }

      try {
        setError(null);
        setLoading(true);

        const { person1Name: p1, person2Name: p2 } = initNamesRef.current;
        const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/initialize`;
        const data = await postJson<{
          success: boolean;
          alreadyComplete?: boolean;
        }>(url, sessionToken, { person1Name: p1, person2Name: p2 });

        if (cancelled) return;

        if (data?.alreadyComplete) {
          onDoneRef.current();
          return;
        }

        await waitProvisioningMinimum();
        if (cancelled) return;
        setPhase("theme");
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || "Failed to start onboarding. Please try again.");
        await waitProvisioningMinimum();
        if (cancelled) return;
        setPhase("theme");
      } finally {
        if (!cancelled) setLoading(false);
        cleanupSteps();
      }
    };

    init();

    return () => {
      cancelled = true;
      if (waitTimer !== undefined) window.clearTimeout(waitTimer);
      cleanupSteps();
    };
  }, [sessionToken, userId]);

  const handleFinish = async () => {
    if (!sessionToken || !userId) {
      onDone();
      return;
    }

    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/complete`;
      await postJson(url, sessionToken, {});
    } catch (_) {
      // Don’t block finishing UX if marking completed fails.
    } finally {
      onDone();
    }
  };

  const handleContinueHomebase = async () => {
    // Mark onboarding as completed, then navigate to the app home page.
    if (sessionToken) {
      try {
        const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/complete`;
        await postJson(url, sessionToken, {});
      } catch (_) {
        // Navigation should still work even if completion fails.
      }
    }

    if (onContinueHomebase) {
      onContinueHomebase();
    } else {
      onDone();
    }
  };

  const saveThemeAndContinue = async () => {
    if (!sessionToken) return;
    if (!relationshipName.trim()) {
      setError("Please enter a relationship name to continue.");
      return;
    }
    setSavingTheme(true);
    setError(null);
    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/preferences`;
      await postJson(url, sessionToken, {
        relationshipName,
        location,
        accentColor: selectedAccent,
        uiTheme: selectedUiTheme,
      });
      if (typeof window !== "undefined") {
        localStorage.setItem("homebase-ui-theme", selectedUiTheme);
      }
      onUiThemeSaved?.(selectedUiTheme);
      await onRefreshUser?.();
      setPhase("phone");
    } catch (e: any) {
      setError(e?.message || "Failed to save personalization");
    } finally {
      setSavingTheme(false);
    }
  };

  const sendOtp = async (which: "person1" | "person2" = "person1"): Promise<boolean> => {
    if (!sessionToken) return false;
    const phone = which === "person2" ? phone2 : phone1;
    const label = which === "person2" ? person2PhoneLabel : person1PhoneLabel;
    if (!phone.trim()) {
      setError(`Please enter ${label} first.`);
      return false;
    }
    setSendingOtp(true);
    setError(null);
    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/send-otp`;
      const data = await postJson<{ success: boolean; phone: string }>(url, sessionToken, {
        phone,
      });
      if (which === "person2") setPhone2(data.phone);
      else setPhone1(data.phone);
      return true;
    } catch (e: any) {
      setError(e?.message || "Failed to send OTP.");
      return false;
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async (which: "person1" | "person2" = "person1"): Promise<boolean> => {
    if (!sessionToken) return false;
    const phone = which === "person2" ? phone2 : phone1;
    const otp = which === "person2" ? otp2 : otp1;
    if (!phone.trim() || !otp.trim()) {
      setError("Phone and OTP code are required.");
      return false;
    }
    setVerifyingOtp(true);
    setError(null);
    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/onboarding/verify-otp`;
      await postJson(url, sessionToken, { phone, code: otp });
      if (which === "person2") setPhone2Verified(true);
      else setPhone1Verified(true);
      return true;
    } catch (e: any) {
      setError(e?.message || "Invalid OTP.");
      return false;
    } finally {
      setVerifyingOtp(false);
    }
  };

  const savePhonesAndContinue = async (opts?: { assumeVerified?: boolean }) => {
    if (!sessionToken) return;
    if (!opts?.assumeVerified && !phone1Verified && !phone2Verified) {
      setError("Please verify your phone number with the code we sent to continue.");
      return;
    }
    setError(null);
    try {
      const url = `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/add-phone`;
      await postJson(url, sessionToken, {
        person1Phone: isPartner2 ? null : phone1.trim() ? phone1 : null,
        person2Phone: isPartner2 ? (phone2.trim() ? phone2 : null) : null,
      });
      setPhase("partnerInvite");
    } catch (e: any) {
      setError(e?.message || "Failed to save phone numbers");
    }
  };

  async function sendPartnerInviteMessage() {
    if (!sessionToken || !inviteInput.trim()) return;
    setInviteSending(true);
    setError(null);
    const text = inviteInput.trim();
    setInviteInput("");
    setInviteMessages((prev) => [...prev, { role: "user", text }]);
    try {
      const data = await postJson<{ success: boolean; reply: string; draftSms?: string }>(
        partnerInviteUrl,
        sessionToken,
        {
        message: text,
        threadId: inviteThreadId,
        },
      );
      setInviteMessages((prev) => [...prev, { role: "assistant", text: data.reply }]);
      if (typeof data.draftSms === "string" && data.draftSms.trim()) {
        setInviteDraftSms(data.draftSms.trim());
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setInviteInput(text);
      setInviteMessages((prev) => prev.slice(0, -1));
    } finally {
      setInviteSending(false);
    }
  }

  async function savePartnerInviteDisplayName() {
    if (!sessionToken) return;
    const name = partner2InviteNameDraft.trim();
    if (!name || name.length > 80) {
      setError("Enter your partner's name as it should appear in the text (max 80 characters).");
      return;
    }
    setSavingPartnerDisplayName(true);
    setError(null);
    try {
      await postJson(partnerDisplayNameUrl, sessionToken, { person2DisplayName: name });
      setPartnerInviteDisplayNameSaved(true);
      await onRefreshUser?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPartnerDisplayName(false);
    }
  }

  async function sendPartnerInviteSmsNow() {
    if (!sessionToken) return;
    if (!inviteDraftSms && !latestDraft) return;
    if (!partner2PhoneInput.trim()) {
      setError(`Please enter ${person2Name}'s phone number.`);
      return;
    }

    setPartnerInviteSendNowLoading(true);
    setError(null);
    try {
      const url = partnerInviteSendUrl;
      const smsBody =
        inviteDraftSms?.trim()
          ? inviteDraftSms.trim()
          : extractPartnerInviteSmsBody(latestDraft as string, person2Name, person1Name);
      const data = await postJson<{ success?: boolean }>(url, sessionToken, {
        toPhone: partner2PhoneInput.trim(),
        draftSms: smsBody,
        message: smsBody, // backward compatibility for older server versions
        threadId: inviteThreadId,
      });

      if (!data?.success) {
        throw new Error("Failed to send invitation.");
      }

      setPartnerInviteSent(true);
      setPartnerInviteSentPhone(partner2PhoneInput.trim());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPartnerInviteSendNowLoading(false);
    }
  }

  function reopenPartnerInvitePhoneStep() {
    setPartnerInviteSent(false);
    setPartnerInviteSentPhone(null);
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: accentColor }}
            aria-hidden
          />
          <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Welcome to Homebase</h1>
        </div>
        {!partnerInviteSent && (
          <button
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={onDone}
            type="button"
          >
            Skip
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-2xl mx-auto">
          {phase === "provisioning" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-3">Setting things up…</h2>
              <div className="space-y-3">
                {STEPS.map((s, idx) => (
                  <div key={s.key} className="flex items-center gap-3">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center border"
                      style={{
                        borderColor: idx <= stepIndex ? accentColor : "rgb(229 231 235)",
                        backgroundColor: idx <= stepIndex ? `${accentColor}22` : "transparent",
                        color: idx <= stepIndex ? accentColor : "rgb(156 163 175)",
                      }}
                    >
                      {idx < stepIndex ? "✓" : idx === stepIndex ? "•" : ""}
                    </div>
                    <div className="text-sm text-gray-700 dark:text-gray-200">{s.label}</div>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <div
                  className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 border-t-gray-600 dark:border-gray-600 dark:border-t-gray-300 animate-spin"
                  aria-hidden
                />
                <div>Almost there.</div>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-200 px-4 py-3 rounded-xl mb-4 text-sm">
              {error}
            </div>
          )}

          {phase === "theme" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Personalize</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Set up your shared space so Homebase feels like you.
              </p>

              <div>
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Relationship name</label>
                <input
                  value={relationshipName}
                  onChange={(e) => setRelationshipName(e.target.value)}
                  placeholder='e.g., "The Johnsons" or "Bobby & Sarah"'
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600"
                />
              </div>

              <div className="mt-4">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Location</label>
                <select
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-600 px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select a city</option>
                  <option value="New York">New York</option>
                  <option value="San Francisco">San Francisco</option>
                  <option value="Los Angeles">Los Angeles</option>
                  <option value="Chicago">Chicago</option>
                  <option value="Austin">Austin</option>
                  <option value="Seattle">Seattle</option>
                  <option value="Boston">Boston</option>
                </select>
              </div>

              <div className="mt-5">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">Pick your theme</h3>
                <div className="mb-4">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Color palette</label>
                  <div className="flex flex-wrap gap-2">
                    {palette.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setSelectedAccent(color)}
                        className={`w-8 h-8 rounded-full border-2 ${selectedAccent === color ? "border-gray-900 dark:border-white" : "border-white dark:border-gray-600"}`}
                        style={{ backgroundColor: color }}
                        aria-label={`Select ${color}`}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Theme mode</label>
                  <div className="flex items-center gap-2">
                    {(["light", "dark", "auto"] as const).map((mode) => {
                      const isSelected = selectedUiTheme === mode;
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSelectedUiTheme(mode)}
                          className={`rounded-lg px-3 py-1.5 text-xs border font-medium ${
                            isSelected
                              ? "text-white"
                              : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                          }`}
                          style={isSelected ? { backgroundColor: selectedAccent, borderColor: selectedAccent } : undefined}
                        >
                          {mode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={saveThemeAndContinue}
                  disabled={savingTheme}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: selectedAccent }}
                >
                  {savingTheme ? "Saving..." : "Save and continue"}
                </button>
              </div>
            </div>
          )}

          {phase === "phone" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Add phone number</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                We&apos;ll text you a 6-digit code to verify your number.
              </p>

              <div className="space-y-4">
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/40 p-3">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">
                    {isPartner2 ? person2PhoneLabel : person1PhoneLabel}
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="tel"
                      value={isPartner2 ? phone2 : phone1}
                      onChange={(e) => {
                        if (isPartner2) {
                          setPhone2(e.target.value);
                          setPhone2Verified(false);
                        } else {
                          setPhone1(e.target.value);
                          setPhone1Verified(false);
                        }
                      }}
                      placeholder="+1234567890"
                      className="flex-1 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                    />
                  </div>
                </div>
              </div>

              <div className="mt-5 space-y-2">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await sendOtp(isPartner2 ? "person2" : "person1");
                    if (ok) setPhase("phoneVerify");
                  }}
                  disabled={sendingOtp}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: selectedAccent }}
                >
                  {sendingOtp ? "Sending..." : "Send code"}
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setPhase("calendar"); }}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Skip for now
                </button>
              </div>
            </div>
          )}

          {phase === "phoneVerify" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Verify your number</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Enter the 6-digit code we sent to {isPartner2 ? person2PhoneLabel : person1PhoneLabel}.
              </p>

              <div className="rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/40 p-3">
                <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Verification code</label>
                <input
                  value={isPartner2 ? otp2 : otp1}
                  onChange={(e) => (isPartner2 ? setOtp2(e.target.value) : setOtp1(e.target.value))}
                  placeholder="6-digit code"
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400"
                  inputMode="numeric"
                />
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await verifyOtp(isPartner2 ? "person2" : "person1");
                    if (!ok) return;
                    await savePhonesAndContinue({ assumeVerified: true });
                  }}
                  disabled={verifyingOtp}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: selectedAccent }}
                >
                  {verifyingOtp ? "Verifying..." : "Continue"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    if (isPartner2) setOtp2("");
                    else setOtp1("");
                    setPhase("phone");
                  }}
                  disabled={verifyingOtp}
                  className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-60"
                >
                  Change Number
                </button>
                <button
                  type="button"
                  onClick={() => { setError(null); setPhase("calendar"); }}
                  disabled={verifyingOtp}
                  className="mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-60"
                >
                  Skip verification
                </button>
              </div>
            </div>
          )}

          {phase === "calendar" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Connect Google Calendar</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Link your calendar so Homebase can reflect your schedule. You can skip and connect later in Settings → Connections.
              </p>
              {calHookErr && (
                <div className="mb-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                  {calHookErr}
                </div>
              )}
              {calLoading && (
                <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">Checking calendar connection…</div>
              )}
              <div className="space-y-3">
                {!isPartner2 && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/40 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{`${person1Name}'s Google Calendar`}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {person1Connected ? "Connected" : "Not connected"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        person1Connected ? disconnectCalendar("person1") : connectGoogleCalendar("person1")
                      }
                      disabled={calLoading}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
                    >
                      {person1Connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                )}

                {isPartner2 && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/40 p-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{`${person2Name}'s Google Calendar`}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {person2Connected ? "Connected" : "Not connected"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        person2Connected ? disconnectCalendar("person2") : connectGoogleCalendar("person2")
                      }
                      disabled={calLoading}
                      className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-medium bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 shrink-0"
                    >
                      {person2Connected ? "Disconnect" : "Connect"}
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setPhase("financial")}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: selectedAccent }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {phase === "financial" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Financial connections</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                Link your bank securely (Stripe Financial Connections). Optional now—you can finish in Settings → Connections.
              </p>
              {financialError && (
                <div className="mb-3 text-xs text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900 rounded-lg px-3 py-2">
                  {financialError}
                </div>
              )}
              <div className="space-y-3">
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 dark:bg-gray-800/40 p-3 flex flex-col gap-2">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">Accounts</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {linkedAccounts.length > 0 ? `${linkedAccounts.length} linked` : "No accounts linked"}
                  </div>
                  <button
                    type="button"
                    onClick={() => connectBankAccount(isPartner2 ? "person2" : "person1")}
                    disabled={financialLoading || !userId}
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white w-full sm:w-auto disabled:opacity-50"
                    style={{ backgroundColor: selectedAccent }}
                  >
                    {financialLoading ? "Opening…" : "Connect bank"}
                  </button>
                </div>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => setPhase("partnerInvite")}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: selectedAccent }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {phase === "partnerInvite" && isPartner2 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">You&apos;re joining Homebase</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                {person1Name} has already set up your shared space. Next, connect your calendar and bank if you
                like—same steps they went through.
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPhase("textAgent")}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: selectedAccent }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {phase === "partnerInvite" && !isPartner2 && partnerInviteSent && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm flex flex-col min-h-[320px]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">Invitation sent</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                We sent your message{partnerInviteSentPhone ? ` to ${partnerInviteSentPhone}` : ""}.
              </p>

              <div className="mt-auto flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void handleContinueHomebase()}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: selectedAccent }}
                >
                  Continue to Homebase
                </button>
                <button
                  type="button"
                  onClick={reopenPartnerInvitePhoneStep}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Wrong number? Edit and resend
                </button>
              </div>
            </div>
          )}

          {phase === "partnerInvite" && !isPartner2 && !partnerInviteSent && !canStartPartnerInviteChat && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm flex flex-col min-h-[320px]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Your partner&apos;s name</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                We&apos;ll use this in the invite text and in your space. First name or the name they go by is
                perfect.
              </p>
              {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200 mb-3">
                  {error}
                </div>
              )}
              <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">Partner&apos;s name</label>
              <input
                value={partner2InviteNameDraft}
                onChange={(e) => setPartner2InviteNameDraft(e.target.value)}
                placeholder="e.g. Alex"
                disabled={savingPartnerDisplayName || !sessionToken}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 mb-4"
                maxLength={80}
              />
              <div className="mt-auto">
                <button
                  type="button"
                  disabled={
                    savingPartnerDisplayName || !partner2InviteNameDraft.trim() || !sessionToken
                  }
                  onClick={() => void savePartnerInviteDisplayName()}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: selectedAccent }}
                >
                  {savingPartnerDisplayName ? "Saving…" : "Continue"}
                </button>
              </div>
            </div>
          )}

          {phase === "partnerInvite" && !isPartner2 && !partnerInviteSent && canStartPartnerInviteChat && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm flex flex-col min-h-[320px]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Invite {person2Name}</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                We&apos;ll ask where you are as a couple, a shared goal, and something you&apos;re excited about,
                then a few reflective questions—so we can draft a text to {person2Name} inviting them to Homebase.
                Nothing is sent automatically.
              </p>

              {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-800 dark:text-red-200 mb-3">
                  {error}
                  {inviteMessages.length === 0 && (
                    <button
                      type="button"
                      className="ml-2 underline font-medium"
                      onClick={() => {
                        inviteBootstrapRef.current = false;
                        setInviteRetryKey((k) => k + 1);
                        setError(null);
                      }}
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}

              <div className="flex-1 overflow-y-auto max-h-[min(360px,50vh)] space-y-3 mb-4 pr-1">
                {inviteMessages.map((m, i) => (
                  <div
                    key={i}
                    className={`rounded-xl px-3 py-2 text-sm max-w-[95%] whitespace-pre-wrap ${
                      m.role === "user"
                        ? "ml-auto bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        : "mr-auto border border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {m.text}
                  </div>
                ))}
                {(inviteLoading || inviteSending) && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">…</div>
                )}
                <div ref={inviteMessagesEndRef} aria-hidden />
              </div>

              {(inviteDraftSms || latestDraft) && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-3 py-3 mb-3">
                  <label className="block text-xs text-gray-600 dark:text-gray-400 mb-2">{person2Name}&apos;s phone number</label>
                  <div className="flex items-end gap-2">
                    <input
                      value={partner2PhoneInput}
                      onChange={(e) => setPartner2PhoneInput(e.target.value)}
                      placeholder="+1234567890"
                      disabled={partnerInviteSendNowLoading || inviteLoading || inviteSending || !sessionToken}
                      className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600"
                      inputMode="tel"
                    />
                    <button
                      type="button"
                      disabled={
                        partnerInviteSendNowLoading ||
                        inviteLoading ||
                        inviteSending ||
                        !partner2PhoneInput.trim() ||
                        !sessionToken
                      }
                      onClick={() => void sendPartnerInviteSmsNow()}
                      className="rounded-xl px-4 py-2 text-sm font-semibold text-white shrink-0 disabled:opacity-50"
                      style={{ backgroundColor: selectedAccent }}
                    >
                      {partnerInviteSendNowLoading ? "Sending…" : "Send now"}
                    </button>
                  </div>
                </div>
              )}

              {latestDraft && isPartner2 && (
                <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-3 py-3 mb-3">
                  <div className="text-sm text-gray-700 dark:text-gray-200">
                    You’re all set. You can send this later, or just keep going.
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => void handleContinueHomebase()}
                      className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                      style={{ backgroundColor: selectedAccent }}
                    >
                      Continue to Homebase
                    </button>
                  </div>
                </div>
              )}

              <div className="flex gap-2 items-end mt-auto">
                <textarea
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendPartnerInviteMessage();
                    }
                  }}
                  placeholder={inviteLoading ? "Starting…" : "Type your reply…"}
                  disabled={inviteLoading || inviteSending || !sessionToken}
                  rows={3}
                  className="flex-1 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-offset-0 dark:focus:ring-offset-gray-900 disabled:bg-gray-50 dark:disabled:bg-gray-800/80 disabled:text-gray-400 dark:disabled:text-gray-500"
                  style={{ ["--tw-ring-color" as string]: selectedAccent }}
                />
                <button
                  type="button"
                  disabled={inviteLoading || inviteSending || !inviteInput.trim() || !sessionToken}
                  onClick={() => void sendPartnerInviteMessage()}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-white shrink-0 disabled:opacity-50"
                  style={{ backgroundColor: selectedAccent }}
                >
                  {inviteSending ? "…" : "Send"}
                </button>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setPhase("textAgent")}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: selectedAccent }}
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {phase === "textAgent" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">Welcome to Homebase</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">All your information in one place. Unlimited memory.</p>
              <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/50 p-4 mb-4">
                <div className="text-xs text-blue-700 dark:text-blue-300 mb-1">Text Homebase at</div>
                <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{helperNumber}</div>
              </div>

              <div className="mt-5">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== "undefined") {
                      window.location.href = `sms:${helperNumber}`;
                    }
                    setPhase("complete");
                  }}
                  className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: selectedAccent }}
                >
                  Send a text to Homebase
                </button>
              </div>
            </div>
          )}

          {phase === "complete" && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-2">
                {hasPartner2Email
                  ? `Setup complete for ${person1Name} & ${person2Name}`
                  : `Setup complete for ${person1Name}`}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                You can now use Homebase from Settings and SMS. No web chat is required.
              </p>

              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold text-white"
                  style={{ backgroundColor: accentColor }}
                >
                  Finish setup
                </button>
              </div>
            </div>
          )}

          {phase !== "complete" && loading && (
            <div className="mt-4 text-center text-xs text-gray-500 dark:text-gray-400">Talking to Homebase…</div>
          )}
        </div>
      </div>
    </div>
  );
}

