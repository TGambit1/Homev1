import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Edit2, Eye, EyeOff, Lock, Check, X, Camera } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { projectId } from '../../../utils/supabase/info';

interface AccountPageProps {
  onBack?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  accentColor?: string;
  loggedInAs?: 'person1' | 'person2';
  user?: {
    fullName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    location?: string;
    avatarUrl?: string;
  };
  sessionToken?: string | null;
  onUserUpdate?: (updates: {
    fullName?: string;
    dateOfBirth?: string;
    location?: string;
    avatarUrl?: string;
  }) => void;
  /** When true, show editor for person2 sign-in email (primary account holder). */
  showPartnerEmailEditor?: boolean;
  partnerEmail?: string;
  onPartnerEmailSaved?: (user: any) => void;
}

type EditableField = 'fullName' | 'dateOfBirth' | 'location';

export default function AccountPage({
  onBack,
  theme = 'light',
  accentColor = '#7eb6eb',
  loggedInAs = 'person1',
  user,
  sessionToken,
  onUserUpdate,
  showPartnerEmailEditor,
  partnerEmail = '',
  onPartnerEmailSaved,
}: AccountPageProps) {
  const isDark = theme === 'dark';

  // ── inline field editing ──────────────────────────────────────────────────
  const [editingField, setEditingField] = useState<EditableField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const openEdit = (field: EditableField, currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue === `Add your ${fieldPlaceholderMap[field]}` ? '' : currentValue);
    setFieldError(null);
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
    setFieldError(null);
  };

  const saveField = async (field: EditableField) => {
    if (!sessionToken) { setFieldError('Not authenticated'); return; }
    setIsSaving(true);
    setFieldError(null);
    try {
      const body: Record<string, string> = { role: loggedInAs };
      if (field === 'fullName') body.name = editValue.trim();
      if (field === 'dateOfBirth') body.dateOfBirth = editValue.trim();
      if (field === 'location') body.location = editValue.trim();

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/update-profile`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify(body),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');

      const updateMap: Record<EditableField, string> = {
        fullName: editValue.trim(),
        dateOfBirth: editValue.trim(),
        location: editValue.trim(),
      };
      onUserUpdate?.({ [field === 'fullName' ? 'fullName' : field === 'dateOfBirth' ? 'dateOfBirth' : 'location']: updateMap[field] });
      setEditingField(null);
    } catch (e: unknown) {
      setFieldError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setIsSaving(false);
    }
  };

  // ── avatar upload ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user?.avatarUrl);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  useEffect(() => {
    setAvatarPreview(user?.avatarUrl);
  }, [user?.avatarUrl]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !sessionToken) return;

    // Local preview
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    setAvatarError(null);
    try {
      // Convert to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/upload-avatar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify({ role: loggedInAs, imageBase64: base64, mimeType: file.type }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onUserUpdate?.({ avatarUrl: data.avatarUrl });
      setAvatarPreview(data.avatarUrl);
    } catch (e: unknown) {
      setAvatarError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
      // Reset input so re-selecting the same file fires onChange
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── change password ───────────────────────────────────────────────────────
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  const handleChangePassword = async () => {
    if (!sessionToken) { setPwError('Not authenticated'); return; }
    if (newPassword.length < 6) { setPwError('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setPwError('Passwords do not match'); return; }
    setPwSaving(true);
    setPwError(null);
    setPwSuccess(false);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/change-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify({ currentPassword, newPassword }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setPwSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => { setShowChangePassword(false); setPwSuccess(false); }, 1500);
    } catch (e: unknown) {
      setPwError(e instanceof Error ? e.message : 'Could not change password');
    } finally {
      setPwSaving(false);
    }
  };

  // ── partner email ─────────────────────────────────────────────────────────
  const [partnerEmailEdit, setPartnerEmailEdit] = useState(partnerEmail);
  const [partnerEmailSaving, setPartnerEmailSaving] = useState(false);
  const [partnerEmailNotice, setPartnerEmailNotice] = useState<string | null>(null);

  useEffect(() => { setPartnerEmailEdit(partnerEmail); }, [partnerEmail]);

  const savePartnerEmail = async () => {
    if (!sessionToken) { setPartnerEmailNotice('You must be logged in to save.'); return; }
    setPartnerEmailSaving(true);
    setPartnerEmailNotice(null);
    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/update-partner-email`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
          body: JSON.stringify({ email: partnerEmailEdit.trim() }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onPartnerEmailSaved?.(data.user);
      setPartnerEmailNotice('Saved.');
    } catch (e: unknown) {
      setPartnerEmailNotice(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setPartnerEmailSaving(false);
    }
  };

  // ── field config ──────────────────────────────────────────────────────────
  const fieldPlaceholderMap: Record<EditableField, string> = {
    fullName: 'name',
    dateOfBirth: 'birthday',
    location: 'location',
  };

  const profileItems: { icon: React.ElementType; label: string; value: string; field?: EditableField; readOnly?: boolean }[] = [
    { icon: User,     label: 'Full Name',    value: user?.fullName    ?? 'Add your name',     field: 'fullName' },
    { icon: Mail,     label: 'Email',        value: user?.email       ?? 'Add your email',    readOnly: true },
    { icon: Phone,    label: 'Phone',        value: user?.phone       ?? 'Add your phone',    readOnly: true },
    { icon: Calendar, label: 'Date of Birth', value: user?.dateOfBirth ?? 'Add your birthday', field: 'dateOfBirth' },
    { icon: MapPin,   label: 'Location',     value: user?.location    ?? 'Add your location', field: 'location' },
  ];

  // shared input style
  const inputClass = `w-full px-3 py-2 rounded-xl border-2 border-transparent outline-none text-sm transition-colors ${
    isDark ? 'bg-slate-700/60 text-slate-100 placeholder:text-slate-400' : 'bg-white/70 text-blue-900/90 placeholder:text-blue-800/30'
  }`;

  return (
    <div className={`size-full overflow-y-auto overflow-x-hidden ${
      isDark ? 'bg-gradient-to-b from-slate-900 to-slate-800' : 'bg-gradient-to-b from-rose-50 to-orange-50'
    }`}>
      <div className="min-h-screen px-6 py-8 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <motion.button
            initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.6 }}
            onClick={onBack}
            className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-slate-700/30' : 'hover:bg-white/30'}`}
            style={{ color: accentColor }}
          >
            <ArrowLeft size={24} />
          </motion.button>
          <motion.h1
            initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.6, delay: 0.1 }}
            className={`text-2xl font-light ${isDark ? 'text-slate-100' : 'text-blue-900/80'}`}
          >
            Account
          </motion.h1>
          <div className="w-10" />
        </div>

        <div className="max-w-md mx-auto">
          {/* Avatar */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
            className="flex flex-col items-center mb-8"
          >
            <div className="relative mb-3">
              <div
                className="size-24 rounded-full flex items-center justify-center overflow-hidden"
                style={{ backgroundColor: accentColor }}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Profile" className="size-full object-cover" />
                ) : (
                  <User size={48} className="text-white" />
                )}
              </div>
              {avatarUploading && (
                <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/40">
                  <div className="size-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className={`text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm transition-colors flex items-center gap-2 disabled:opacity-50 ${
                isDark ? 'bg-slate-700/40 hover:bg-slate-700/60' : 'bg-white/40 hover:bg-white/60'
              }`}
              style={{ color: accentColor }}
            >
              <Camera size={14} />
              {avatarUploading ? 'Uploading…' : 'Edit Photo'}
            </button>
            {avatarError && <p className="text-xs text-red-500 mt-1">{avatarError}</p>}
          </motion.div>

          {/* Profile fields */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.3 }}
            className="mb-6"
          >
            <h2 className={`text-sm font-medium mb-3 px-2 ${isDark ? 'text-slate-300' : 'text-blue-900/60'}`}>
              Personal Information
            </h2>
            <div className={`backdrop-blur-sm rounded-2xl overflow-hidden ${isDark ? 'bg-slate-700/40' : 'bg-white/40'}`}>
              {profileItems.map((item, index) => (
                <div key={item.label}>
                  <button
                    disabled={item.readOnly}
                    onClick={() => item.field && openEdit(item.field, item.value)}
                    className={`w-full p-4 flex items-center gap-4 transition-all ${
                      item.readOnly ? 'cursor-default opacity-70' : 'active:scale-98'
                    } ${isDark ? 'hover:bg-slate-700/60' : !item.readOnly ? 'hover:bg-white/60' : ''} ${
                      index !== profileItems.length - 1
                        ? isDark ? 'border-b border-slate-600/50' : 'border-b border-white/50'
                        : ''
                    }`}
                  >
                    <div className="p-2 rounded-lg" style={{ backgroundColor: `${accentColor}20` }}>
                      <item.icon size={18} style={{ color: accentColor }} />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-xs mb-0.5 ${isDark ? 'text-slate-400' : 'text-blue-800/50'}`}>{item.label}</p>
                      <p className={`text-sm font-medium ${isDark ? 'text-slate-100' : 'text-blue-900/90'}`}>{item.value}</p>
                    </div>
                    {!item.readOnly && (
                      <Edit2 size={16} className={isDark ? 'text-slate-400' : 'text-blue-900/30'} />
                    )}
                  </button>

                  {/* Inline editor */}
                  <AnimatePresence>
                    {item.field && editingField === item.field && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className={`px-4 pb-4 pt-2 ${isDark ? 'bg-slate-700/60' : 'bg-white/60'}`}>
                          <input
                            autoFocus
                            type={item.field === 'dateOfBirth' ? 'date' : 'text'}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            placeholder={`Enter ${item.label.toLowerCase()}`}
                            className={inputClass}
                            onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
                            onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveField(item.field!); if (e.key === 'Escape') cancelEdit(); }}
                          />
                          {fieldError && editingField === item.field && (
                            <p className="text-xs text-red-500 mt-1">{fieldError}</p>
                          )}
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={cancelEdit}
                              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                                isDark ? 'bg-slate-600/60 text-slate-200 hover:bg-slate-600/80' : 'bg-white/60 text-blue-900/60 hover:bg-white/80'
                              }`}
                            >
                              <X size={14} className="inline mr-1" />Cancel
                            </button>
                            <button
                              onClick={() => saveField(item.field!)}
                              disabled={isSaving}
                              className="flex-1 py-2 rounded-xl text-sm font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
                              style={{ backgroundColor: accentColor }}
                            >
                              {isSaving ? '…' : <><Check size={14} className="inline mr-1" />Save</>}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Partner email editor (person1 only) */}
          {showPartnerEmailEditor && (
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.45 }}
              className="mb-6"
            >
              <h2 className={`text-sm font-medium mb-3 px-2 ${isDark ? 'text-slate-300' : 'text-blue-900/60'}`}>
                Partner sign-in
              </h2>
              <div className={`backdrop-blur-sm rounded-2xl overflow-hidden p-4 ${isDark ? 'bg-slate-700/40' : 'bg-white/40'}`}>
                <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-blue-800/60'}`}>
                  Add your partner's email so they can sign in with the same password. Leave blank until they're ready to join.
                </p>
                <label className={`text-xs mb-1 block ${isDark ? 'text-slate-400' : 'text-blue-800/50'}`}>Partner's email</label>
                <input
                  type="email"
                  value={partnerEmailEdit}
                  onChange={(e) => { setPartnerEmailEdit(e.target.value); setPartnerEmailNotice(null); }}
                  placeholder="partner@example.com"
                  className={`w-full rounded-xl border px-3 py-2 text-sm outline-none ${
                    isDark ? 'bg-slate-700/60 border-slate-600 text-slate-100' : 'bg-white/70 border-white/60 text-blue-900/90'
                  }`}
                />
                {partnerEmailNotice && (
                  <p className={`text-xs mt-2 ${partnerEmailNotice === 'Saved.' ? 'text-green-600' : 'text-red-600'}`}>
                    {partnerEmailNotice}
                  </p>
                )}
                <button
                  onClick={savePartnerEmail}
                  disabled={partnerEmailSaving}
                  className="mt-3 w-full rounded-xl py-3 text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: accentColor }}
                >
                  {partnerEmailSaving ? 'Saving…' : 'Save partner email'}
                </button>
              </div>
            </motion.div>
          )}

          {/* Account actions */}
          <motion.div
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5, delay: 0.5 }}
            className="space-y-3 mt-8"
          >
            <button
              onClick={() => { setShowChangePassword(!showChangePassword); setPwError(null); setPwSuccess(false); }}
              className={`w-full p-4 rounded-2xl backdrop-blur-sm font-medium transition-colors ${
                isDark ? 'bg-slate-700/40 text-slate-100 hover:bg-slate-700/60' : 'bg-white/40 text-blue-900/80 hover:bg-white/60'
              }`}
            >
              Change Password
            </button>

            <AnimatePresence>
              {showChangePassword && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <div className={`backdrop-blur-sm rounded-2xl p-5 space-y-4 ${isDark ? 'bg-slate-600/50' : 'bg-white/50'}`}>
                    {/* Current Password */}
                    {[
                      { label: 'Current Password', value: currentPassword, setter: setCurrentPassword, show: showCurrentPw, toggle: setShowCurrentPw },
                      { label: 'New Password',      value: newPassword,     setter: setNewPassword,     show: showNewPw,     toggle: setShowNewPw },
                      { label: 'Confirm New Password', value: confirmPassword, setter: setConfirmPassword, show: showConfirmPw, toggle: setShowConfirmPw },
                    ].map(({ label, value, setter, show, toggle }) => (
                      <div key={label}>
                        <label className={`text-xs mb-2 block px-1 ${isDark ? 'text-slate-300' : 'text-blue-900/60'}`}>{label}</label>
                        <div className="relative">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2">
                            <Lock size={18} style={{ color: accentColor }} />
                          </div>
                          <input
                            type={show ? 'text' : 'password'}
                            value={value}
                            onChange={(e) => setter(e.target.value)}
                            placeholder={label}
                            className={`w-full pl-11 pr-11 py-3 rounded-xl border-2 border-transparent outline-none text-sm ${
                              isDark ? 'bg-slate-700/60 text-slate-100 placeholder:text-slate-400' : 'bg-white/60 text-blue-900/90 placeholder:text-blue-800/30'
                            }`}
                            onFocus={(e) => (e.currentTarget.style.borderColor = accentColor)}
                            onBlur={(e) => (e.currentTarget.style.borderColor = 'transparent')}
                          />
                          <button
                            type="button"
                            onClick={() => toggle(!show)}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-slate-400 hover:text-slate-200' : 'text-blue-900/40 hover:text-blue-900/60'}`}
                          >
                            {show ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                    ))}

                    {pwError && <p className="text-xs text-red-500">{pwError}</p>}
                    {pwSuccess && <p className="text-xs text-green-600">Password updated!</p>}

                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={() => { setShowChangePassword(false); setPwError(null); }}
                        className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                          isDark ? 'bg-slate-700/60 text-slate-200 hover:bg-slate-700/80' : 'bg-white/60 text-blue-900/60 hover:bg-white/80'
                        }`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleChangePassword}
                        disabled={pwSaving}
                        className="flex-1 py-3 rounded-xl text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
                        style={{ backgroundColor: accentColor }}
                      >
                        {pwSaving ? 'Saving…' : 'Update Password'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <button className={`w-full p-4 rounded-2xl backdrop-blur-sm text-red-600 font-medium transition-colors ${
              isDark ? 'bg-slate-700/40 hover:bg-slate-700/60' : 'bg-white/40 hover:bg-white/60'
            }`}>
              Delete Account
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
