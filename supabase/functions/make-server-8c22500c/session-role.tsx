/**
 * Stores which partner role created the session (person1 vs person2) so server routes
 * (e.g. onboarding completion) can be scoped per partner on the shared account.
 */
import * as kv from "./kv_store.tsx";

const key = (token: string) => `session:logged_in_as:${token}`;

export async function setSessionPartnerRole(
  token: string,
  role: "person1" | "person2",
): Promise<void> {
  await kv.set(key(token), { role });
}

export async function getSessionPartnerRole(token: string): Promise<"person1" | "person2"> {
  const v = await kv.get(key(token));
  if (v?.role === "person2") return "person2";
  return "person1";
}

export async function clearSessionPartnerRole(token: string): Promise<void> {
  await kv.del(key(token));
}
