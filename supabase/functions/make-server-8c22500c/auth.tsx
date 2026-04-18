import { Hono } from "npm:hono";
import * as db from "./db.tsx";
import { clearSessionPartnerRole, setSessionPartnerRole } from "./session-role.tsx";

const app = new Hono();

// Register couple account: person 1 only at signup; person2 profile is a placeholder until invite/Account.
app.post('/make-server-8c22500c/auth/register', async (c) => {
  try {
    const body = await c.req.json();
    const emailRaw = body.email1 ?? body.email;
    const { password, person1Name } = body;

    if (!emailRaw || !password) {
      return c.json({ error: 'Email and password are required' }, 400);
    }

    const normalizedEmail1 = String(emailRaw).toLowerCase().trim();

    const email1Exists = await db.emailExists(normalizedEmail1);

    if (email1Exists) {
      return c.json({
        error: 'This email is already registered',
        email1Exists: true,
        email2Exists: false,
      }, 400);
    }

    // Create account ID (using UUID for database)
    const userId = crypto.randomUUID();

    // Hash password using Web Crypto API
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    const user = await db.createUser({
      id: userId,
      primary_email: normalizedEmail1,
      password_hash: passwordHash,
      person1_name: person1Name || 'Partner 1',
    });

    // Note: email_lookups table has been removed. Profiles.email is the source of truth.

    // Create session
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.createSession({
      user_id: userId,
      token: sessionToken,
      expires_at: expiresAt,
    });

    console.log(
      `Account registered: ${userId}, person1: ${normalizedEmail1}, person2 email unset`,
    );

    return c.json({
      success: true,
      sessionToken,
      user: {
        userId,
        primaryEmail: user.primary_email,
        secondaryEmail: user.secondary_email || '',
        loggedInEmail: normalizedEmail1,
        loggedInAs: 'person1',
        person1Name: user.person1_name,
        person2Name: user.person2_name,
        person1Phone: user.person1_phone,
        person2Phone: user.person2_phone,
        relationshipName: user.relationship_name,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return c.json({ error: 'Registration failed', details: error.message }, 500);
  }
});

// Login with either email (joint account)
app.post('/make-server-8c22500c/auth/login', async (c) => {
  try {
    const { email, password } = await c.req.json();
    
    if (!email || !password) {
      return c.json({ error: 'Email and password required' }, 400);
    }
    
    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();
    
    // Find profile by email to determine role + account
    const profile = await db.getProfileByEmail(normalizedEmail);
    if (!profile) return c.json({ error: 'Invalid email or password' }, 401);
    const userData = await db.getUserById(profile.account_id);
    if (!userData) return c.json({ error: 'Invalid email or password' }, 401);
    
    // Verify password using Web Crypto API (same as registration)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    const loggedInAs: 'person1' | 'person2' | 'unknown' =
      profile.role === 'person1' || profile.role === 'person2'
        ? (profile.role as 'person1' | 'person2')
        : 'unknown';

    // Partner-specific password validation:
    // - person1: accounts.password_hash (existing behavior)
    // - person2: profiles.password_hash (new behavior)
    const expectedHash =
      loggedInAs === 'person2'
        ? (profile as { password_hash?: string | null }).password_hash || ''
        : userData.password_hash;

    if (!expectedHash || passwordHash !== expectedHash) {
      return c.json({ error: 'Invalid email or password' }, 401);
    }
    
    // Create session
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.createSession({
      user_id: userData.id,
      token: sessionToken,
      expires_at: expiresAt,
    });
    await setSessionPartnerRole(sessionToken, loggedInAs === "person2" ? "person2" : "person1");

    console.log(`User logged in: ${userData.id}, email: ${normalizedEmail}, as: ${loggedInAs}`);
    
    return c.json({
      success: true,
    return c.json({ 
      success: true, 
      sessionToken,
      user: {
        userId: userData.id,
        primaryEmail: userData.primary_email,
        secondaryEmail: userData.secondary_email || '',
        loggedInEmail: normalizedEmail,
        loggedInAs,
        person1Name: userData.person1_name,
        person2Name: userData.person2_name,
        person1Phone: userData.person1_phone,
        person2Phone: userData.person2_phone,
        relationshipName: userData.relationship_name,
        person1AvatarUrl: userData.person1_avatar_url,
        person1DateOfBirth: userData.person1_date_of_birth,
        person1Location: userData.person1_location,
        person2AvatarUrl: userData.person2_avatar_url,
        person2DateOfBirth: userData.person2_date_of_birth,
        person2Location: userData.person2_location,
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json({ error: 'Login failed', details: error.message }, 500);
  }
});

// Partner 2 accept-invite signup: set email + their own password hash on the person2 profile.
app.post('/make-server-8c22500c/auth/accept-partner-invite', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({})) as any;
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const emailRaw = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!token || !emailRaw || !password) {
      return c.json({ error: 'Token, email, and password are required' }, 400);
    }
    if (password.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const normalizedEmail = String(emailRaw).toLowerCase().trim();
    const existing = await db.emailExists(normalizedEmail);
    if (existing) return c.json({ error: 'This email is already registered' }, 400);

    const consumed = await db.consumePartnerInviteToken(token);
    if (!consumed) return c.json({ error: 'Invite link is invalid or expired' }, 400);

    const accountId = consumed.accountId;
    const userData = await db.getUserById(accountId);
    if (!userData) return c.json({ error: 'Account not found' }, 404);

    // Hash password using Web Crypto API (same scheme as existing auth)
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Store email + password hash on person2 profile
    await db.updatePerson2ProfileEmail(accountId, normalizedEmail);
    await db.setPerson2PasswordHash(accountId, passwordHash);

    // Create session for person2
    const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await db.createSession({
      user_id: accountId,
      token: sessionToken,
      expires_at: expiresAt,
    });

    const fresh = await db.getUserById(accountId);
    if (!fresh) return c.json({ error: 'Account not found' }, 404);

    return c.json({
      success: true,
      sessionToken,
      user: {
        userId: fresh.id,
        primaryEmail: fresh.primary_email,
        secondaryEmail: fresh.secondary_email || '',
        loggedInEmail: normalizedEmail,
        loggedInAs: 'person2',
        person1Name: fresh.person1_name,
        person2Name: fresh.person2_name,
        person1Phone: fresh.person1_phone,
        person2Phone: fresh.person2_phone,
        relationshipName: fresh.relationship_name,
      },
    });
  } catch (error: any) {
    console.error('accept-partner-invite error:', error);
    return c.json({ error: error?.message || 'Failed to accept invite' }, 400);
  }
});

// Verify session
app.get('/make-server-8c22500c/auth/verify', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    
    if (!sessionToken) {
      return c.json({ authenticated: false }, 401);
    }
    
    const session = await db.getSessionByToken(sessionToken);
    
    if (!session || new Date(session.expires_at) < new Date()) {
      // Clean up expired session
      if (session) {
        await clearSessionPartnerRole(sessionToken);
        await db.deleteSession(sessionToken);
      }
      return c.json({ authenticated: false }, 401);
    }
    
    const userData = await db.getUserById(session.user_id);
    
    if (!userData) {
      return c.json({ authenticated: false }, 401);
    }
    
    return c.json({
      authenticated: true,
      user: {
        userId: userData.id,
        primaryEmail: userData.primary_email,
        secondaryEmail: userData.secondary_email || '',
        person1Name: userData.person1_name,
        person2Name: userData.person2_name,
        person1Phone: userData.person1_phone,
        person2Phone: userData.person2_phone,
        relationshipName: userData.relationship_name,
        person1AvatarUrl: userData.person1_avatar_url,
        person1DateOfBirth: userData.person1_date_of_birth,
        person1Location: userData.person1_location,
        person2AvatarUrl: userData.person2_avatar_url,
        person2DateOfBirth: userData.person2_date_of_birth,
        person2Location: userData.person2_location,
    return c.json({ 
      authenticated: true,
      user: {
        userId: userData.id,
      primaryEmail: userData.primary_email,
      secondaryEmail: userData.secondary_email || '',
        person1Name: userData.person1_name,
        person2Name: userData.person2_name,
        person1Phone: userData.person1_phone,
        person2Phone: userData.person2_phone,
        relationshipName: userData.relationship_name,
      }
    });
  } catch (error) {
    console.error('Verify session error:', error);
    return c.json({ authenticated: false }, 401);
  }
});

// Logout
app.post('/make-server-8c22500c/auth/logout', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    
    if (sessionToken) {
      await clearSessionPartnerRole(sessionToken);
      await db.deleteSession(sessionToken);
    }

    return c.json({ success: true, message: 'Logged out' });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ error: 'Logout failed' }, 500);
  }
});

// Add phone number(s) on profiles (person1 and/or person2). Omit a field to leave that profile unchanged.
app.post('/make-server-8c22500c/auth/add-phone', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    const { person1Phone, person2Phone } = await c.req.json();
    
    if (!sessionToken) {
      return c.json({ error: 'Not authenticated' }, 401);
    }
    
    const session = await db.getSessionByToken(sessionToken);
    if (!session || new Date(session.expires_at) < new Date()) {
      return c.json({ error: 'Session expired' }, 401);
    }
    
    const userId = session.user_id;
    const userData = await db.getUserById(userId);
    
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }
    
    if (!person1Phone && !person2Phone) {
      return c.json({ error: 'At least one phone number is required' }, 400);
    }
    
    // Validate phone number format if provided
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (person1Phone && !phoneRegex.test(person1Phone.replace(/[\s\-\(\)]/g, ''))) {
      return c.json({ error: 'Person 1 phone number is invalid' }, 400);
    }
    if (person2Phone && !phoneRegex.test(person2Phone.replace(/[\s\-\(\)]/g, ''))) {
      return c.json({ error: 'Person 2 phone number is invalid' }, 400);
    }
    
    // Normalize phone numbers (remove formatting)
    const normalizedPerson1Phone = person1Phone ? person1Phone.replace(/[\s\-\(\)]/g, '') : null;
    const normalizedPerson2Phone = person2Phone ? person2Phone.replace(/[\s\-\(\)]/g, '') : null;
    
    // Ensure phone numbers start with +
    const finalPerson1Phone = normalizedPerson1Phone && !normalizedPerson1Phone.startsWith('+') 
      ? `+${normalizedPerson1Phone}` 
      : normalizedPerson1Phone;
    const finalPerson2Phone = normalizedPerson2Phone && !normalizedPerson2Phone.startsWith('+') 
      ? `+${normalizedPerson2Phone}` 
      : normalizedPerson2Phone;
    
    // Update user with both phone numbers
    await db.updateUserPhones(userId, finalPerson1Phone, finalPerson2Phone);
    
    return c.json({ 
      success: true, 
      message: 'Phone numbers updated',
      person1Phone: finalPerson1Phone,
      person2Phone: finalPerson2Phone
    });
  } catch (error) {
    console.error('Add phone error:', error);
    return c.json({ error: 'Failed to add phone numbers', details: error.message }, 500);
  }
});

// Set or update partner (person2) sign-in email; empty string clears to null
app.post('/make-server-8c22500c/auth/update-partner-email', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    const { email: rawEmail } = await c.req.json();

    if (!sessionToken) {
      return c.json({ error: 'Not authenticated' }, 401);
    }

    const session = await db.getSessionByToken(sessionToken);
    if (!session || new Date(session.expires_at) < new Date()) {
      return c.json({ error: 'Session expired' }, 401);
    }

    const userId = session.user_id;
    const userData = await db.getUserById(userId);
    if (!userData) {
      return c.json({ error: 'User not found' }, 404);
    }

    const nextEmail =
      rawEmail == null || String(rawEmail).trim() === ''
        ? null
        : String(rawEmail).toLowerCase().trim();

    await db.updatePerson2ProfileEmail(userId, nextEmail);
    const fresh = await db.getUserById(userId);
    if (!fresh) {
      return c.json({ error: 'User not found' }, 404);
    }

    return c.json({
      success: true,
      user: {
        userId: fresh.id,
        primaryEmail: fresh.primary_email,
        secondaryEmail: fresh.secondary_email || '',
        person1Name: fresh.person1_name,
        person2Name: fresh.person2_name,
        person1Phone: fresh.person1_phone,
        person2Phone: fresh.person2_phone,
        relationshipName: fresh.relationship_name,
      },
    });
  } catch (error: any) {
    console.error('update-partner-email error:', error);
    return c.json(
      { error: error?.message || 'Failed to update partner email' },
      400,
    );
  }
});

// Cleanup expired sessions (can be called periodically)
app.post('/make-server-8c22500c/auth/cleanup-sessions', async (c) => {
  try {
    const deletedCount = await db.cleanupExpiredSessions();
    return c.json({ 
      success: true, 
      message: 'Session cleanup completed',
      deletedCount
    });
  } catch (error) {
    console.error('Cleanup sessions error:', error);
    return c.json({ error: 'Failed to cleanup sessions', details: error.message }, 500);
  }
});

// Request password reset. Optionally returns resetLink in response for testing when returnLink: true.
// In production, send the link via email/SMS instead of returning it.
app.post('/make-server-8c22500c/auth/forgot-password', async (c) => {
  try {
    const body = await c.req.json();
    const { email, returnLink } = body;

    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    const normalizedEmail = (email as string).toLowerCase().trim();
    const user = await db.getUserByEmail(normalizedEmail);

    // Always respond success to avoid email enumeration, even if user not found
    if (!user) {
      return c.json({ success: true });
    }

    const token = crypto.randomUUID();
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour

    await db.savePasswordResetToken(token, {
      userId: user.id,
      email: normalizedEmail,
      expiresAt,
    });

    const resetUrl = `https://homebaseuxv12.vercel.app?token=${encodeURIComponent(token)}`;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const emailFrom = Deno.env.get('EMAIL_FROM');

    if (resendApiKey && emailFrom) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: emailFrom,
            to: normalizedEmail,
            subject: 'Reset your Homebase password',
            html: `
              <p>Hi,</p>
              <p>Click the link below to set a new password for Homebase. This link expires in 1 hour.</p>
              <p><a href="${resetUrl}">Reset password</a></p>
              <p>If you didn't request this, you can ignore this email.</p>
            `,
          }),
        });
        if (!res.ok) {
          const err = await res.text();
          console.error('[forgot-password] Resend API error:', res.status, err);
        }
      } catch (err) {
        console.error('[forgot-password] Resend send failed:', err);
      }
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return c.json({ error: 'Failed to start password reset', details: error.message }, 500);
  }
});

// Complete password reset
app.post('/make-server-8c22500c/auth/reset-password', async (c) => {
  try {
    const { token, newPassword } = await c.req.json();

    if (!token || !newPassword) {
      return c.json({ error: 'Token and new password are required' }, 400);
    }

    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return c.json({ error: 'Password must be at least 6 characters' }, 400);
    }

    const record = await db.getPasswordResetRecord(token);
    if (!record || record.expiresAt < Date.now()) {
      return c.json({ error: 'Reset link is invalid or has expired' }, 400);
    }

    // Hash new password (same as registration)
    const encoder = new TextEncoder();
    const data = encoder.encode(newPassword);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const passwordHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await db.updateAccountPassword(record.userId, passwordHash);
    await db.deleteSessionsForUser(record.userId);
    await db.deletePasswordResetToken(token);

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Reset password error:', error);
    return c.json({ error: 'Failed to reset password', details: error.message }, 500);
  }
});

// Change password (requires current password verification)
app.post('/make-server-8c22500c/auth/change-password', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    const { currentPassword, newPassword } = await c.req.json();

    if (!sessionToken) return c.json({ error: 'Not authenticated' }, 401);
    if (!currentPassword || !newPassword) return c.json({ error: 'currentPassword and newPassword are required' }, 400);
    if (typeof newPassword !== 'string' || newPassword.length < 6) return c.json({ error: 'New password must be at least 6 characters' }, 400);

    const session = await db.getSessionByToken(sessionToken);
    if (!session || new Date(session.expires_at) < new Date()) return c.json({ error: 'Session expired' }, 401);

    const userData = await db.getUserById(session.user_id);
    if (!userData) return c.json({ error: 'User not found' }, 404);

    const encoder = new TextEncoder();
    const currentHash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(currentPassword))
    )).map(b => b.toString(16).padStart(2, '0')).join('');

    if (currentHash !== userData.password_hash) return c.json({ error: 'Current password is incorrect' }, 400);

    const newHash = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', encoder.encode(newPassword))
    )).map(b => b.toString(16).padStart(2, '0')).join('');

    await db.updateAccountPassword(session.user_id, newHash);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('change-password error:', error);
    return c.json({ error: 'Failed to change password', details: error.message }, 500);
  }
});

// Update profile fields (name, date_of_birth, location) for the active partner
app.post('/make-server-8c22500c/auth/update-profile', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    const { role, name, dateOfBirth, location } = await c.req.json();

    if (!sessionToken) return c.json({ error: 'Not authenticated' }, 401);
    if (role !== 'person1' && role !== 'person2') return c.json({ error: 'Invalid role' }, 400);

    const session = await db.getSessionByToken(sessionToken);
    if (!session || new Date(session.expires_at) < new Date()) return c.json({ error: 'Session expired' }, 401);

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (dateOfBirth !== undefined) updates.date_of_birth = dateOfBirth;
    if (location !== undefined) updates.location = location;

    await db.updateProfile(session.user_id, role, updates);

    const fresh = await db.getUserById(session.user_id);
    if (!fresh) return c.json({ error: 'User not found' }, 404);

    return c.json({
      success: true,
      user: {
        userId: fresh.id,
        primaryEmail: fresh.primary_email,
        secondaryEmail: fresh.secondary_email || '',
        person1Name: fresh.person1_name,
        person2Name: fresh.person2_name,
        person1Phone: fresh.person1_phone,
        person2Phone: fresh.person2_phone,
        relationshipName: fresh.relationship_name,
        person1AvatarUrl: fresh.person1_avatar_url,
        person1DateOfBirth: fresh.person1_date_of_birth,
        person1Location: fresh.person1_location,
        person2AvatarUrl: fresh.person2_avatar_url,
        person2DateOfBirth: fresh.person2_date_of_birth,
        person2Location: fresh.person2_location,
      },
    });
  } catch (error: any) {
    console.error('update-profile error:', error);
    return c.json({ error: 'Failed to update profile', details: error.message }, 500);
  }
});

// Upload avatar image (base64) to Supabase Storage and save the URL on the profile
app.post('/make-server-8c22500c/auth/upload-avatar', async (c) => {
  try {
    const sessionToken = c.req.header('Authorization')?.replace('Bearer ', '');
    const { role, imageBase64, mimeType } = await c.req.json();

    if (!sessionToken) return c.json({ error: 'Not authenticated' }, 401);
    if (role !== 'person1' && role !== 'person2') return c.json({ error: 'Invalid role' }, 400);
    if (!imageBase64) return c.json({ error: 'imageBase64 is required' }, 400);

    const session = await db.getSessionByToken(sessionToken);
    if (!session || new Date(session.expires_at) < new Date()) return c.json({ error: 'Session expired' }, 401);

    // Decode base64 to bytes
    const base64Data = imageBase64.replace(/^data:[^;]+;base64,/, '');
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const { createClient } = await import('jsr:@supabase/supabase-js@2.49.8');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const ext = (mimeType === 'image/png') ? 'png' : 'jpg';
    const fileName = `${session.user_id}_${role}_${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, bytes, { contentType: mimeType || 'image/jpeg', upsert: true });

    if (uploadError) return c.json({ error: uploadError.message }, 500);

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(fileName);
    await db.updateProfile(session.user_id, role, { avatar_url: publicUrl });

    return c.json({ success: true, avatarUrl: publicUrl });
  } catch (error: any) {
    console.error('upload-avatar error:', error);
    return c.json({ error: 'Failed to upload avatar', details: error.message }, 500);
  }
});

export const authRoutes = app;
