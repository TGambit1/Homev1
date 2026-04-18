import { createClient } from "jsr:@supabase/supabase-js@2.49.8";
import * as kv from "./kv_store.tsx";

const client = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ============ USER / ACCOUNT / PROFILE MODELS ============

// NOTE: In the database, "accounts" + "profiles" is the normalized schema.
// The legacy "users" table still exists, but this code now treats "user id"
// as the account id and reconstructs a User view from accounts+profiles.

export interface Account {
  id: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  account_id: string;
  email: string | null;
  name: string | null;
  phone: string | null;
  password_hash?: string | null;
  relationship_name?: string | null;
  role: string; // 'person1' | 'person2' | future roles
  avatar_url: string | null;
  date_of_birth: string | null;
  location: string | null;
  created_at: string;
  updated_at: string;
}

// Backwards‑compatible "User" view used by existing code.
export interface User {
  id: string; // account id
  primary_email: string;
  secondary_email: string;
  password_hash: string;
  person1_phone: string | null;
  person2_phone: string | null;
  person1_name: string;
  person2_name: string;
  /** From profiles (person1 row; kept in sync on both profiles via theme / Account). */
  relationship_name: string | null;
  person1_avatar_url: string | null;
  person1_date_of_birth: string | null;
  person1_location: string | null;
  person2_avatar_url: string | null;
  person2_date_of_birth: string | null;
  person2_location: string | null;
  created_at: string;
  updated_at: string;
}

function mapAccountAndProfilesToUser(
  account: Account,
  profiles: Profile[]
): User | null {
  const person1 = profiles.find((p) => p.role === "person1");
  const person2 = profiles.find((p) => p.role === "person2");

  // Require at least person1; person2 is optional
  if (!person1) return null;

  const rawRel = person1.relationship_name ?? person2?.relationship_name;
  const relationship_name =
    rawRel != null && String(rawRel).trim() ? String(rawRel).trim() : null;

  return {
    id: account.id,
    primary_email: person1.email || "",
    secondary_email: person2?.email || "",
    password_hash: account.password_hash,
    person1_phone: person1.phone,
    person2_phone: person2?.phone || null,
    person1_name: person1.name || "Partner 1",
    person2_name: person2?.name || "Partner 2",
    relationship_name,
    person1_avatar_url: person1.avatar_url || null,
    person1_date_of_birth: person1.date_of_birth || null,
    person1_location: person1.location || null,
    person2_avatar_url: person2?.avatar_url || null,
    person2_date_of_birth: person2?.date_of_birth || null,
    person2_location: person2?.location || null,
    created_at: account.created_at,
    updated_at: account.updated_at,
  };
}

// ============ USER OPERATIONS (BACKED BY ACCOUNTS + PROFILES) ============

export async function createUser(userData: {
  id: string;
  primary_email: string;
  password_hash: string;
  person1_name?: string;
}): Promise<User> {
  const supabase = client();

  const primaryEmail = userData.primary_email.toLowerCase().trim();

  // 1) Create account (no longer writing to users table)
  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .insert({
      id: userData.id,
      password_hash: userData.password_hash,
    })
    .select()
    .single();

  if (accountError) throw new Error(accountError.message);

  // 2) Person1 profile + placeholder person2 (no partner email/name until invite or Account)
  const { error: p1Err } = await supabase.from("profiles").insert({
    account_id: account.id,
    email: primaryEmail,
    name: userData.person1_name || "Partner 1",
    phone: null,
    role: "person1",
  });
  if (p1Err) throw new Error(p1Err.message);

  const { error: p2Err } = await supabase.from("profiles").insert({
    account_id: account.id,
    email: null,
    name: null,
    phone: null,
    role: "person2",
  });
  if (p2Err) throw new Error(p2Err.message);

  const { data: profiles, error: profilesFetchError } = await supabase
    .from("profiles")
    .select("*")
    .eq("account_id", account.id);

  if (profilesFetchError) throw new Error(profilesFetchError.message);

  const user = mapAccountAndProfilesToUser(account as Account, profiles as Profile[]);
  if (!user) throw new Error("Failed to construct user from account/profiles");

  return user;
}

export async function getUserById(userId: string): Promise<User | null> {
  const supabase = client();

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (accountError) throw new Error(accountError.message);
  if (!account) return null;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("account_id", userId);

  if (profilesError) throw new Error(profilesError.message);

  const user = mapAccountAndProfilesToUser(account as Account, profiles as Profile[]);
  return user;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const supabase = client();
  const normalizedEmail = email.toLowerCase().trim();

  // Look up profile by email, then hydrate account + all profiles
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);
  if (!profile) return null;

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("*")
    .eq("id", (profile as Profile).account_id)
    .maybeSingle();

  if (accountError) throw new Error(accountError.message);
  if (!account) return null;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("*")
    .eq("account_id", (profile as Profile).account_id);

  if (profilesError) throw new Error(profilesError.message);

  const user = mapAccountAndProfilesToUser(account as Account, profiles as Profile[]);
  return user;
}

export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const supabase = client();
  const normalizedEmail = email.toLowerCase().trim();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as Profile | null;
}

export async function setPerson2PasswordHash(accountId: string, passwordHash: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from("profiles")
    .update({ password_hash: passwordHash })
    .eq("account_id", accountId)
    .eq("role", "person2");
  if (error) throw new Error(error.message);
}

export async function createPartnerInviteToken(accountId: string, opts?: { expiresInMinutes?: number }): Promise<string> {
  const supabase = client();
  const token = crypto.randomUUID();
  const expiresInMinutes = typeof opts?.expiresInMinutes === "number" ? opts.expiresInMinutes : 60 * 24 * 7; // 7 days
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000).toISOString();

  const { error } = await supabase.from("partner_invite_tokens").insert({
    token,
    account_id: accountId,
    role: "person2",
    expires_at: expiresAt,
  });
  if (error) throw new Error(error.message);
  return token;
}

export async function consumePartnerInviteToken(token: string): Promise<{ accountId: string } | null> {
  const supabase = client();
  const cleaned = token.trim();
  if (!cleaned) return null;

  const { data, error } = await supabase
    .from("partner_invite_tokens")
    .select("token,account_id,expires_at")
    .eq("token", cleaned)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const expiresAt = new Date((data as { expires_at: string }).expires_at);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
    return null;
  }

  // One-time token: delete after consumption.
  await supabase.from("partner_invite_tokens").delete().eq("token", cleaned);

  return { accountId: (data as { account_id: string }).account_id };
}

// Legacy function - email_lookups table has been removed.
// Profiles.email is now the source of truth for all email lookups.
export async function createEmailLookup(email: string, userId: string, isPrimary: boolean): Promise<void> {
  // No-op: email_lookups table has been dropped, profiles.email is source of truth
  console.log(`[createEmailLookup] Skipped - email_lookups table removed. Profiles.email is source of truth.`);
}

export async function emailExists(email: string): Promise<boolean> {
  const supabase = client();
  const normalizedEmail = email.toLowerCase().trim();

  // Check against profiles (email_lookups table has been removed)
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (profileError) throw new Error(profileError.message);

  return !!profile;
}

/** Set or clear person2 sign-in email (null = not invited yet). */
export async function updatePerson2ProfileEmail(
  accountId: string,
  newEmail: string | null,
): Promise<void> {
  const supabase = client();
  const normalized =
    newEmail != null && String(newEmail).trim().length > 0
      ? String(newEmail).toLowerCase().trim()
      : null;

  if (normalized) {
    const { data: p1, error: p1Err } = await supabase
      .from("profiles")
      .select("email")
      .eq("account_id", accountId)
      .eq("role", "person1")
      .maybeSingle();
    if (p1Err) throw new Error(p1Err.message);
    if (p1 && (p1 as Profile).email === normalized) {
      throw new Error("Partner email must be different from your email");
    }

    const { data: conflict, error: cErr } = await supabase
      .from("profiles")
      .select("account_id")
      .eq("email", normalized)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (conflict && (conflict as { account_id: string }).account_id !== accountId) {
      throw new Error("That email is already registered");
    }
  }

  const { error: upErr } = await supabase
    .from("profiles")
    .update({ email: normalized })
    .eq("account_id", accountId)
    .eq("role", "person2");
  if (upErr) throw new Error(upErr.message);
}

// Update both partner phone numbers (operates on profiles)
export async function updateUserPhones(
  userId: string,
  person1Phone: string | null,
  person2Phone: string | null
): Promise<void> {
  const supabase = client();

  const updates: Promise<any>[] = [];

  if (person1Phone !== undefined) {
    updates.push(
      supabase
        .from("profiles")
        .update({ phone: person1Phone })
        .eq("account_id", userId)
        .eq("role", "person1")
    );
  }

  if (person2Phone !== undefined) {
    updates.push(
      supabase
        .from("profiles")
        .update({ phone: person2Phone })
        .eq("account_id", userId)
        .eq("role", "person2")
    );
  }

  const results = await Promise.all(updates);
  for (const result of results) {
    if (result.error) throw new Error(result.error.message);
  }
}

/** Display name for person2 profile (used in copy, partner invite SMS, etc.). */
export async function updatePerson2DisplayName(
  accountId: string,
  displayName: string,
): Promise<void> {
  const supabase = client();
  const trimmed = displayName.trim();
  if (!trimmed) throw new Error("Display name is required");

  const { error } = await supabase
    .from("profiles")
    .update({ name: trimmed })
    .eq("account_id", accountId)
    .eq("role", "person2");

  if (error) throw new Error(error.message);
}

/** Sets the shared couple relationship label on all profiles for this account (person1 + person2). */
export async function updateAccountRelationshipName(
  accountId: string,
  relationshipName: string | null
): Promise<void> {
  const supabase = client();

  const { error } = await supabase
    .from("profiles")
    .update({ relationship_name: relationshipName })
    .eq("account_id", accountId);

  if (error) throw new Error(error.message);
}

export async function getUserByPhone(phone: string): Promise<User | null> {
  const supabase = client();

  const debugDbLookup = (Deno.env.get('DEBUG_DB_LOOKUP') || '').toLowerCase() === 'true';
  if (debugDbLookup) console.log(`[getUserByPhone] Searching for phone: ${phone}`);

  // Normalize phone number - match the same normalization used in auth.tsx
  const normalizedPhone = phone.replace(/[^\d+]/g, "");
  const withPlus = normalizedPhone.startsWith("+")
    ? normalizedPhone
    : `+${normalizedPhone}`;
  const withoutPlus = normalizedPhone.startsWith("+")
    ? normalizedPhone.slice(1)
    : normalizedPhone;

  if (debugDbLookup) {
    console.log(
      `[getUserByPhone] Trying formats: "${withPlus}", "${withoutPlus}", "${phone}"`
    );
  }

  const tryPhoneFormat = async (phoneFormat: string): Promise<User | null> => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("phone", phoneFormat)
      .maybeSingle();

    if (profileError) throw new Error(profileError.message);
    if (!profile) return null;

    const accountId = (profile as Profile).account_id;

    const { data: account, error: accountError } = await supabase
      .from("accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle();

    if (accountError) throw new Error(accountError.message);
    if (!account) return null;

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("*")
      .eq("account_id", accountId);

    if (profilesError) throw new Error(profilesError.message);

    const user = mapAccountAndProfilesToUser(
      account as Account,
      profiles as Profile[]
    );
    if (user) {
      if (debugDbLookup) {
        console.log(
          `[getUserByPhone] Found user via profiles/account: ${user.id}`
        );
      }
    }
    return user;
  };

  const result1 = await tryPhoneFormat(withPlus);
  if (result1) return result1;

  const result2 = await tryPhoneFormat(withoutPlus);
  if (result2) return result2;

  const result3 = await tryPhoneFormat(phone);
  if (result3) return result3;

  if (debugDbLookup) console.log(`[getUserByPhone] No user found for phone: ${phone}`);
  return null;
}

// ============ SESSION OPERATIONS ============

export interface Session {
  id: string;
  user_id: string;
  token: string;
  expires_at: string;
  created_at: string;
}

export async function createSession(sessionData: {
  user_id: string;
  token: string;
  expires_at: string;
}): Promise<Session> {
  const supabase = client();
  const { data, error } = await supabase
    .from('sessions')
    .insert(sessionData)
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getSessionByToken(token: string): Promise<Session | null> {
  const supabase = client();
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('token', token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteSession(token: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('token', token);

  if (error) throw new Error(error.message);
}

export async function cleanupExpiredSessions(): Promise<number> {
  const supabase = client();
  const { data, error } = await supabase
    .from('sessions')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) throw new Error(error.message);
  return data?.length || 0;
}

export async function deleteSessionsForUser(userId: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('sessions')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(error.message);
}

export async function updateProfile(
  userId: string,
  role: 'person1' | 'person2',
  updates: {
    name?: string;
    date_of_birth?: string | null;
    location?: string | null;
    avatar_url?: string | null;
  }
): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('account_id', userId)
    .eq('role', role);
  if (error) throw new Error(error.message);
}

export async function updateAccountPassword(userId: string, newPasswordHash: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('accounts')
    .update({ password_hash: newPasswordHash })
    .eq('id', userId);

  if (error) throw new Error(error.message);
}

// ============ CONVERSATION MEMORY OPERATIONS ============

export interface ConversationMemory {
  id: string;
  conversation_id: string;
  user_id: string | null;
  messages: any[];
  user_context: any;
  session_started: string;
  last_interaction: string;
  created_at: string;
  updated_at: string;
}

export async function getConversationMemory(conversationId: string): Promise<ConversationMemory | null> {
  const supabase = client();
  const { data, error } = await supabase
    .from('conversation_memories')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function saveConversationMemory(memory: {
  conversation_id: string;
  user_id?: string | null;
  messages: any[];
  user_context: any;
  session_started: string;
  last_interaction: string;
}): Promise<ConversationMemory> {
  const supabase = client();
  const { data, error } = await supabase
    .from('conversation_memories')
    .upsert({
      conversation_id: memory.conversation_id,
      user_id: memory.user_id || null,
      messages: memory.messages,
      user_context: memory.user_context,
      session_started: memory.session_started,
      last_interaction: memory.last_interaction,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'conversation_id'
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteConversationMemory(conversationId: string): Promise<void> {
  const supabase = client();
  const { error } = await supabase
    .from('conversation_memories')
    .delete()
    .eq('conversation_id', conversationId);

  if (error) throw new Error(error.message);
}

export async function cleanupOldConversations(retentionDays: number = 90): Promise<number> {
  const supabase = client();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

  const { data, error } = await supabase
    .from('conversation_memories')
    .delete()
    .lt('last_interaction', cutoffDate.toISOString())
    .select('id');

  if (error) throw new Error(error.message);
  return data?.length || 0;
}

// ============ CALENDAR TOKEN OPERATIONS ============

export interface CalendarToken {
  id: string;
  user_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope: string | null;
  partner_role: 'person1' | 'person2';
  created_at: string;
  updated_at: string;
}

export async function saveCalendarTokens(
  userId: string,
  partnerRole: 'person1' | 'person2',
  tokens: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
    scope?: string;
  }
): Promise<CalendarToken> {
  const supabase = client();
  
  // Handle 'default' userId by storing as NULL (for backward compatibility)
  // Also validate UUID format - if not a valid UUID, store as NULL
  const validUserId = (userId && userId !== 'default' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    ? userId
    : null;
  
  // For NULL user_id, we need to check if a record exists first (can't use upsert with NULL)
  if (validUserId === null) {
    // Backward-compatibility path: historically we allowed a single
    // "default" calendar with NULL user_id. We always treat this as
    // partner_role = 'person1'.
    const effectivePartnerRole: 'person1' | 'person2' = 'person1';

    // Check if a token with NULL user_id exists for this partner_role
    const existing = await supabase
      .from('calendar_tokens')
      .select('id')
      .is('user_id', null)
      .eq('partner_role', effectivePartnerRole)
      .maybeSingle();
    
    if (existing.data) {
      // Update existing record
      const { data, error } = await supabase
        .from('calendar_tokens')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          scope: tokens.scope || null,
          partner_role: effectivePartnerRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.data.id)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('calendar_tokens')
        .insert({
          user_id: null,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          scope: tokens.scope || null,
          partner_role: effectivePartnerRole,
        })
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return data;
    }
  } else {
    // Valid UUID - check if exists first, then update or insert for this partner
    const existing = await supabase
      .from('calendar_tokens')
      .select('id')
      .eq('user_id', validUserId)
      .eq('partner_role', partnerRole)
      .maybeSingle();
    
    if (existing.data) {
      // Update existing record
      const { data, error } = await supabase
        .from('calendar_tokens')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          scope: tokens.scope || null,
          partner_role: partnerRole,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.data.id)
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return data;
    } else {
      // Insert new record
      const { data, error } = await supabase
        .from('calendar_tokens')
        .insert({
          user_id: validUserId,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_at,
          scope: tokens.scope || null,
          partner_role: partnerRole,
        })
        .select()
        .single();
      
      if (error) throw new Error(error.message);
      return data;
    }
  }
}

export async function getCalendarTokens(
  userId: string,
  partnerRole: 'person1' | 'person2'
): Promise<CalendarToken | null> {
  const supabase = client();
  
  // Handle 'default' userId by querying for NULL
  const validUserId = (userId && userId !== 'default' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    ? userId
    : null;
  
  const query = supabase
    .from('calendar_tokens')
    .select('*')
    .eq('partner_role', partnerRole);

  if (validUserId === null) {
    query.is('user_id', null);
  } else {
    query.eq('user_id', validUserId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function deleteCalendarTokens(
  userId: string,
  partnerRole?: 'person1' | 'person2'
): Promise<void> {
  const supabase = client();
  
  // Handle 'default' userId by querying for NULL
  const validUserId = (userId && userId !== 'default' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId))
    ? userId
    : null;
  
  const deleteQuery = supabase
    .from('calendar_tokens')
    .delete();

  if (validUserId === null) {
    deleteQuery.is('user_id', null);
  } else {
    deleteQuery.eq('user_id', validUserId);
  }

  if (partnerRole) {
    deleteQuery.eq('partner_role', partnerRole);
  }

  const { error } = await deleteQuery;

  if (error) throw new Error(error.message);
}

export async function saveOAuthSession(sessionId: string, data: any): Promise<void> {
  await kv.set(`oauth_session:${sessionId}`, data);
}

export async function getOAuthSession(sessionId: string): Promise<any> {
  return await kv.get(`oauth_session:${sessionId}`);
}

export async function deleteOAuthSession(sessionId: string): Promise<void> {
  await kv.del(`oauth_session:${sessionId}`);
}

// ============ FINANCIAL LINK SESSIONS ============

export interface FinancialLinkSession {
  id: string;
  user_id: string;
  partner_role: 'person1' | 'person2';
  provider: 'stripe' | 'plaid';
  provider_session_token: string | null;
  requested_permissions: string[];
  state: string;
  linked_account_count: number;
  failure_reason: string | null;
  expires_at: string;
  completed_at: string | null;
  created_at: string;
}

export async function saveFinancialLinkSession(session: {
  user_id: string;
  partner_role: 'person1' | 'person2';
  provider: 'stripe' | 'plaid';
  provider_session_token: string;
  requested_permissions: string[];
}): Promise<FinancialLinkSession> {
  const supabase = client();
  
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 minutes
  
  const { data, error } = await supabase
    .from('financial_link_sessions')
    .insert({
      user_id: session.user_id,
      partner_role: session.partner_role,
      provider: session.provider,
      provider_session_token: session.provider_session_token,
      requested_permissions: session.requested_permissions,
      state: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateLinkSessionState(
  sessionId: string,
  state: string,
  accountCount?: number
): Promise<void> {
  const supabase = client();
  
  const updateData: any = {
    state,
    completed_at: state === 'completed' ? new Date().toISOString() : null,
  };
  
  if (accountCount !== undefined) {
    updateData.linked_account_count = accountCount;
  }
  
  const { error } = await supabase
    .from('financial_link_sessions')
    .update(updateData)
    .eq('id', sessionId);

  if (error) throw new Error(error.message);
}

// ============ LINKED ACCOUNTS ============

export interface LinkedAccount {
  id: string;
  user_id: string;
  partner_role: 'person1' | 'person2';
  provider: string;
  external_account_id: string;
  external_item_id: string | null;
  display_name: string;
  institution_name: string;
  last_four_digits: string | null;
  category: string;
  subcategory: string | null;
  connection_state: string;
  granted_permissions: string[];
  supports_ach_payments: boolean;
  last_synced_at: string | null;
  disconnected_at: string | null;
  created_at: string;
}

export async function saveLinkedAccount(account: {
  user_id: string;
  partner_role: 'person1' | 'person2';
  provider: string;
  external_account_id: string;
  external_item_id?: string;
  display_name: string;
  institution_name: string;
  last_four_digits?: string;
  category: string;
  subcategory?: string;
  connection_state?: string;
  granted_permissions: string[];
  supports_ach_payments?: boolean;
}): Promise<LinkedAccount> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('linked_accounts')
    .upsert({
      user_id: account.user_id,
      partner_role: account.partner_role,
      provider: account.provider,
      external_account_id: account.external_account_id,
      external_item_id: account.external_item_id || null,
      display_name: account.display_name,
      institution_name: account.institution_name,
      last_four_digits: account.last_four_digits || null,
      category: account.category,
      subcategory: account.subcategory || null,
      connection_state: account.connection_state || 'active',
      granted_permissions: account.granted_permissions,
      supports_ach_payments: account.supports_ach_payments || false,
    }, {
      onConflict: 'provider,external_account_id'
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getLinkedAccounts(userId: string): Promise<LinkedAccount[]> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('linked_accounts')
    .select('*')
    .eq('user_id', userId)
    .eq('connection_state', 'active')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getLinkedAccountByExternalId(
  provider: string,
  externalAccountId: string
): Promise<LinkedAccount | null> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('linked_accounts')
    .select('*')
    .eq('provider', provider)
    .eq('external_account_id', externalAccountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function updateLinkedAccountState(
  accountId: string,
  state: string
): Promise<void> {
  const supabase = client();
  
  const updateData: any = {
    connection_state: state,
  };
  
  if (state === 'disconnected') {
    updateData.disconnected_at = new Date().toISOString();
  }
  
  const { error } = await supabase
    .from('linked_accounts')
    .update(updateData)
    .eq('external_account_id', accountId);

  if (error) throw new Error(error.message);
}

// ============ BALANCE SNAPSHOTS ============

export interface BalanceSnapshot {
  id: string;
  linked_account_id: string;
  available_balance_cents: number | null;
  current_balance_cents: number | null;
  credit_limit_cents: number | null;
  currency_code: string;
  as_of_timestamp: string;
  created_at: string;
}

export async function saveBalanceSnapshot(snapshot: {
  linked_account_id: string;
  available_balance_cents?: number;
  current_balance_cents?: number;
  credit_limit_cents?: number;
  currency_code?: string;
}): Promise<BalanceSnapshot> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('balance_snapshots')
    .insert({
      linked_account_id: snapshot.linked_account_id,
      available_balance_cents: snapshot.available_balance_cents || null,
      current_balance_cents: snapshot.current_balance_cents || null,
      credit_limit_cents: snapshot.credit_limit_cents || null,
      currency_code: snapshot.currency_code || 'USD',
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/** Returns the most recent as_of_timestamp across all balance snapshots for this user, or null if none. */
export async function getLatestBalanceTimestamp(userId: string): Promise<string | null> {
  const supabase = client();
  const { data, error } = await supabase
    .from('balance_snapshots')
    .select('as_of_timestamp, linked_accounts!inner(id, user_id)')
    .eq('linked_accounts.user_id', userId)
    .order('as_of_timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data.as_of_timestamp ?? null;
}

export async function getLatestBalances(userId: string): Promise<any[]> {
  const supabase = client();
  
  // Get latest balance for each account
  const { data, error } = await supabase
    .rpc('get_latest_balances_for_user', { p_user_id: userId });

  if (error) {
    // Fallback to manual query if RPC doesn't exist
    const { data: balances, error: queryError } = await supabase
      .from('balance_snapshots')
      .select(`
        *,
        linked_accounts!inner (
          id,
          display_name,
          institution_name,
          category
        )
      `)
      .eq('linked_accounts.user_id', userId)
      .order('as_of_timestamp', { ascending: false });
    
    if (queryError) throw new Error(queryError.message);
    
    // Group by account and take most recent
    const latestByAccount = new Map();
    for (const balance of (balances || [])) {
      if (!latestByAccount.has(balance.linked_account_id)) {
        latestByAccount.set(balance.linked_account_id, balance);
      }
    }
    
    return Array.from(latestByAccount.values());
  }
  
  return data || [];
}

export async function getRecentBalanceSnapshotsForLinkedAccount(
  linkedAccountId: string,
  limit: number = 2
): Promise<BalanceSnapshot[]> {
  const supabase = client();
  const { data, error } = await supabase
    .from('balance_snapshots')
    .select('*')
    .eq('linked_account_id', linkedAccountId)
    .order('as_of_timestamp', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as BalanceSnapshot[]) || [];
}

// ============ TRANSACTIONS ============

export interface Transaction {
  id: string;
  linked_account_id: string;
  provider: string;
  external_transaction_id: string;
  amount_cents: number;
  currency_code: string;
  description: string;
  merchant_name: string | null;
  category_hierarchy: string[] | null;
  is_pending: boolean;
  transaction_date: string;
  created_at: string;
}

export async function saveTransaction(txn: {
  linked_account_id: string;
  provider: string;
  external_transaction_id: string;
  amount_cents: number;
  currency_code?: string;
  description: string;
  merchant_name?: string;
  category_hierarchy?: string[];
  is_pending?: boolean;
  transaction_date: string;
}): Promise<Transaction> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('transactions')
    .upsert({
      linked_account_id: txn.linked_account_id,
      provider: txn.provider,
      external_transaction_id: txn.external_transaction_id,
      amount_cents: txn.amount_cents,
      currency_code: txn.currency_code || 'USD',
      description: txn.description,
      merchant_name: txn.merchant_name || null,
      category_hierarchy: txn.category_hierarchy || null,
      is_pending: txn.is_pending || false,
      transaction_date: txn.transaction_date,
    }, {
      onConflict: 'provider,external_transaction_id'
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getTransactions(
  userId: string,
  limit: number = 50
): Promise<Transaction[]> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('transactions')
    .select(`
      *,
      linked_accounts!inner (
        id,
        user_id,
        display_name,
        institution_name
      )
    `)
    .eq('linked_accounts.user_id', userId)
    .order('transaction_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

// ============ PROVIDER WEBHOOKS ============

export interface ProviderWebhook {
  id: string;
  provider: string;
  external_event_id: string;
  event_type: string;
  payload: any;
  processed: boolean;
  processed_at: string | null;
  linked_account_id: string | null;
  received_at: string;
}

export async function saveProviderWebhook(webhook: {
  provider: string;
  external_event_id: string;
  event_type: string;
  payload: any;
  linked_account_id?: string;
}): Promise<ProviderWebhook> {
  const supabase = client();
  
  const { data, error } = await supabase
    .from('provider_webhooks')
    .insert({
      provider: webhook.provider,
      external_event_id: webhook.external_event_id,
      event_type: webhook.event_type,
      payload: webhook.payload,
      linked_account_id: webhook.linked_account_id || null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ============ STRIPE/PLAID CREDENTIALS (Using KV Store for security) ============

export async function saveStripeCustomerId(userId: string, customerId: string): Promise<void> {
  await kv.set(`stripe_customer:${userId}`, customerId);
}

export async function getStripeCustomerId(userId: string): Promise<string | null> {
  return await kv.get(`stripe_customer:${userId}`);
}

// ============ SNAPTRADE USER CREDENTIALS ============

export async function saveSnapTradeUserSecret(
  userId: string,
  userSecret: string
): Promise<void> {
  await kv.set(`snaptrade_user:${userId}`, { userSecret });
}

export async function getSnapTradeUserSecret(
  userId: string
): Promise<string | null> {
  const data = await kv.get(`snaptrade_user:${userId}`);
  return data?.userSecret ?? null;
}

export async function saveSnapTradeCallbackState(
  state: string,
  data: { userId: string; partnerRole: string; redirectUrl?: string }
): Promise<void> {
  await kv.set(`snaptrade_callback:${state}`, { ...data, expiresAt: Date.now() + 10 * 60 * 1000 });
}

export async function getSnapTradeCallbackState(
  state: string
): Promise<{ userId: string; partnerRole: string; redirectUrl?: string } | null> {
  const data = await kv.get(`snaptrade_callback:${state}`);
  if (!data || (data.expiresAt && data.expiresAt < Date.now())) return null;
  return { userId: data.userId, partnerRole: data.partnerRole, redirectUrl: data.redirectUrl };
}

export async function savePlaidAccessToken(
  userId: string,
  itemId: string,
  accessToken: string
): Promise<void> {
  // IMPORTANT: In production, encrypt this token!
  await kv.set(`plaid_item:${userId}:${itemId}`, {
    access_token: accessToken,
    created_at: Date.now(),
  });
}

export async function getPlaidAccessToken(
  userId: string,
  itemId: string
): Promise<string | null> {
  const data = await kv.get(`plaid_item:${userId}:${itemId}`);
  return data?.access_token || null;
}

// ============ COUPLE SMS ONBOARDING ("Tell us about you") ============

export interface CoupleOnboardingProfile {
  account_id: string;
  relationship_stage: string | null;
  exciting_upcoming: string | null;
  onboarding_version: number;
  sms_onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getCoupleOnboardingProfile(
  accountId: string
): Promise<CoupleOnboardingProfile | null> {
  const supabase = client();
  const { data, error } = await supabase
    .from("couple_onboarding_profile")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as CoupleOnboardingProfile | null;
}

export async function upsertCoupleOnboardingProfile(
  accountId: string,
  patch: {
    relationship_stage?: string | null;
    exciting_upcoming?: string | null;
    sms_onboarding_completed_at?: string | null;
    onboarding_version?: number;
  }
): Promise<void> {
  const supabase = client();
  const row: Record<string, unknown> = {
    account_id: accountId,
    updated_at: new Date().toISOString(),
  };
  if (patch.relationship_stage !== undefined) row.relationship_stage = patch.relationship_stage;
  if (patch.exciting_upcoming !== undefined) row.exciting_upcoming = patch.exciting_upcoming;
  if (patch.sms_onboarding_completed_at !== undefined) {
    row.sms_onboarding_completed_at = patch.sms_onboarding_completed_at;
  }
  if (patch.onboarding_version !== undefined) row.onboarding_version = patch.onboarding_version;

  const { error } = await supabase
    .from("couple_onboarding_profile")
    .upsert(row, { onConflict: "account_id" });

  if (error) throw new Error(error.message);
}

export async function insertFinancialGoalEntry(
  accountId: string,
  summary: string,
  source: "sms_onboarding" | "sms_chat" | "web" | "manual",
  conversationId?: string | null
): Promise<void> {
  const supabase = client();
  const { error } = await supabase.from("couple_financial_goal_entries").insert({
    account_id: accountId,
    summary,
    source,
    conversation_id: conversationId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function insertRecurringPriorityEntry(
  accountId: string,
  summary: string,
  source: "sms_onboarding" | "sms_chat" | "web" | "manual",
  conversationId?: string | null
): Promise<void> {
  const supabase = client();
  const { error } = await supabase.from("couple_recurring_priority_entries").insert({
    account_id: accountId,
    summary,
    source,
    conversation_id: conversationId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function hasFinancialGoalEntryForSource(
  accountId: string,
  source: string
): Promise<boolean> {
  const supabase = client();
  const { data, error } = await supabase
    .from("couple_financial_goal_entries")
    .select("id")
    .eq("account_id", accountId)
    .eq("source", source)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

/** True if the couple has any saved goal row (web onboarding, SMS, etc.). */
export async function hasFinancialGoalForAccount(accountId: string): Promise<boolean> {
  const supabase = client();
  const { data, error } = await supabase
    .from("couple_financial_goal_entries")
    .select("id")
    .eq("account_id", accountId)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

export async function getLatestFinancialGoalSummary(accountId: string): Promise<string> {
  const supabase = client();
  const { data, error } = await supabase
    .from("couple_financial_goal_entries")
    .select("summary")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const s = (data as { summary?: string } | null)?.summary;
  return (s && String(s).trim()) || "";
}

export async function hasRecurringEntryForSource(
  accountId: string,
  source: string
): Promise<boolean> {
  const supabase = client();
  const { data, error } = await supabase
    .from("couple_recurring_priority_entries")
    .select("id")
    .eq("account_id", accountId)
    .eq("source", source)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return !!data;
}

// ============ PASSWORD RESET TOKENS ============

export interface PasswordResetRecord {
  userId: string;
  email: string;
  expiresAt: number;
}

export async function savePasswordResetToken(
  token: string,
  record: PasswordResetRecord
): Promise<void> {
  await kv.set(`password_reset:${token}`, record);
}

export async function getPasswordResetRecord(
  token: string
): Promise<PasswordResetRecord | null> {
  const data = await kv.get(`password_reset:${token}`);
  if (!data) return null;
  return data as PasswordResetRecord;
}

export async function deletePasswordResetToken(token: string): Promise<void> {
  await kv.del(`password_reset:${token}`);
}
