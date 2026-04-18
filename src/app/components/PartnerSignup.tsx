import { useState } from "react";
import { projectId, publicAnonKey } from "../../../utils/supabase/info";

export function PartnerSignup({
  token,
  onAccepted,
}: {
  token: string;
  onAccepted: (sessionToken: string, userId: string, user: any) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim()) return setError("Email is required.");
    if (!password) return setError("Password is required.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");

    setLoading(true);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/accept-partner-invite`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ token, email: email.trim(), password }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data?.error || `Request failed (${res.status})`);
      }

      localStorage.setItem("sessionToken", data.sessionToken);
      localStorage.setItem("userId", data.user.userId);
      localStorage.setItem("primaryEmail", data.user.primaryEmail || data.user.email);
      if (data.user.secondaryEmail) localStorage.setItem("secondaryEmail", data.user.secondaryEmail);
      localStorage.setItem("loggedInEmail", data.user.loggedInEmail || data.user.secondaryEmail || "");
      localStorage.setItem("person1Name", data.user.person1Name);
      localStorage.setItem("person2Name", data.user.person2Name);

      onAccepted(data.sessionToken, data.user.userId, data.user);
    } catch (e: any) {
      setError(e?.message || "Failed to accept invite.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Homebase</h1>
          <p className="text-gray-600">Join your partner</p>
        </div>

        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Create your login</h2>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Your email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="you@example.com"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? "Creating…" : "Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

