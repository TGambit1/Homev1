import { motion, AnimatePresence } from 'motion/react';
import { ArrowLeft, Calendar, Landmark, TrendingUp, Cloud, Shield, ChevronDown, Plus, MessageSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useFinancialConnections } from '../hooks/useFinancialConnections';
import { useCalendarConnections } from '../hooks/useCalendarConnections';
import { projectId } from '../../../utils/supabase/info';

interface ConnectionsPageProps {
  onBack?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  accentColor?: string;
  userId?: string | null;
  primaryEmail?: string | null;
  secondaryEmail?: string | null;
  person1Name?: string;
  person2Name?: string;
  person1Phone?: string | null;
  person2Phone?: string | null;
  sessionToken?: string | null;
  onOpenIntegrations?: () => void;
}

interface ConnectedAccount {
  name: string;
  email?: string;
  status: 'connected' | 'disconnected';
}

interface ConnectionItem {
  icon: any;
  label: string;
  description: string;
  accounts: ConnectedAccount[];
}

export default function ConnectionsPage({ 
  onBack, 
  theme = 'light', 
  accentColor = '#7eb6eb',
  userId,
  primaryEmail,
  secondaryEmail,
  person1Name,
  person2Name,
  person1Phone,
  person2Phone,
  sessionToken,
  onOpenIntegrations
}: ConnectionsPageProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const hasPartner2Email = !!(secondaryEmail && String(secondaryEmail).trim());
  const partner2CalendarLabel = hasPartner2Email
    ? `${person2Name || 'Partner 2'}'s Google Calendar`
    : "Partner's Google Calendar";
  const partner2PhoneShortLabel = hasPartner2Email ? person2Name || 'Partner 2' : 'Partner';

  const {
    linkedAccounts,
    balances,
    financialError,
    financialLoading,
    plaidLoading,
    snaptradeLoading,
    connectBankAccount,
    connectCreditCard,
    connectBrokerageAccount,
    disconnectBankAccount,
    formatCurrency,
  } = useFinancialConnections(userId);

  const isDark = theme === 'dark';

  const [phoneNumber1, setPhoneNumber1] = useState<string>(person1Phone || '');
  const [phoneNumber2, setPhoneNumber2] = useState<string>(person2Phone || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  useEffect(() => {
    setPhoneNumber1(person1Phone || '');
    setPhoneNumber2(person2Phone || '');
  }, [person1Phone, person2Phone]);

  const {
    person1Connected,
    person2Connected,
    connectGoogleCalendar,
    disconnectCalendar,
  } = useCalendarConnections(userId);

  const calendarAccounts: ConnectedAccount[] = [];

  // Person 1 calendar row
  calendarAccounts.push({
    name: `${person1Name || 'Partner 1'}'s Google Calendar`,
    email: primaryEmail || undefined,
    status: person1Connected ? 'connected' : 'disconnected',
  });

  // Person 2 calendar row
  calendarAccounts.push({
    name: partner2CalendarLabel,
    email: secondaryEmail || undefined,
    status: person2Connected ? 'connected' : 'disconnected',
  });

  // Placeholder rows for other providers (not yet supported)
  calendarAccounts.push(
    { name: 'Outlook', status: 'disconnected' },
    { name: 'iCloud', status: 'disconnected' },
  );

  // Cloud storage connections (heuristic: infer from email domains)
  const emails = [primaryEmail, secondaryEmail].filter(
    (e): e is string => !!e
  );
  const hasGoogleStorage = emails.some((e) =>
    e.toLowerCase().includes('@gmail.com') ||
    e.toLowerCase().includes('@googlemail.com')
  );
  const hasIcloudStorage = emails.some((e) => {
    const lower = e.toLowerCase();
    return (
      lower.endsWith('@icloud.com') ||
      lower.endsWith('@me.com') ||
      lower.endsWith('@mac.com')
    );
  });

  const cloudStorageAccounts: ConnectedAccount[] = [
    {
      name: 'Google Drive',
      status: hasGoogleStorage ? 'connected' : 'disconnected',
    },
    {
      name: 'Dropbox',
      status: 'disconnected',
    },
    {
      name: 'iCloud Drive',
      status: hasIcloudStorage ? 'connected' : 'disconnected',
    },
  ];

  // Security keys / 2FA connections (backed by phone numbers where possible)
  const hasSmsVerification = !!(person1Phone || person2Phone);
  const securityAccounts: ConnectedAccount[] = [
    {
      name: 'Authenticator App',
      status: 'connected',
    },
    {
      name: 'SMS Verification',
      status: hasSmsVerification ? 'connected' : 'disconnected',
    },
    {
      name: 'Hardware Key',
      status: 'disconnected',
    },
  ];

  const bankAccounts: ConnectedAccount[] = [];
  const brokerageAccounts: ConnectedAccount[] = [];
  const bankLinkedAccounts: any[] = [];
  const brokerageLinkedAccounts: any[] = [];

  linkedAccounts.forEach((acc: any) => {
    const institution = acc.institution_name || acc.display_name || 'Account';
    const last4 = acc.last_four_digits || acc.lastFour || '';
    const name = last4 ? `${institution} •••• ${last4}` : institution;
    const category = (acc.category || '').toLowerCase();
    const provider = (acc.provider || '').toLowerCase();

    const isInvestmentCategory = category === 'investment' || category.includes('investment');
    const isSnaptrade = provider === 'snaptrade';

    if (isInvestmentCategory || isSnaptrade) {
      brokerageAccounts.push({
        name,
        status: 'connected',
      });
      brokerageLinkedAccounts.push(acc);
    } else {
      bankAccounts.push({
        name,
        status: 'connected',
      });
      bankLinkedAccounts.push(acc);
    }
  });

  const handleSavePhoneNumbers = async () => {
    if (!sessionToken) {
      setPhoneError('You must be logged in to save phone numbers');
      return;
    }

    if (!phoneNumber1.trim() && !phoneNumber2.trim()) {
      setPhoneError('Please enter at least one phone number');
      return;
    }

    const phoneRegex = /^\+?[1-9]\d{1,14}$/;

    if (phoneNumber1.trim()) {
      const cleaned1 = phoneNumber1.replace(/[\s\-\(\)]/g, '');
      if (!phoneRegex.test(cleaned1)) {
        setPhoneError(
          `${person1Name || 'Partner 1'}'s phone number is invalid. Please use format: +1234567890`
        );
        return;
      }
    }

    if (phoneNumber2.trim()) {
      const cleaned2 = phoneNumber2.replace(/[\s\-\(\)]/g, '');
      if (!phoneRegex.test(cleaned2)) {
        setPhoneError(
          `${person2Name || 'Partner 2'}'s phone number is invalid. Please use format: +1234567890`
        );
        return;
      }
    }

    setPhoneLoading(true);
    setPhoneError(null);

    try {
      const cleaned1 = phoneNumber1.trim()
        ? phoneNumber1.replace(/[\s\-\(\)]/g, '')
        : null;
      const cleaned2 = phoneNumber2.trim()
        ? phoneNumber2.replace(/[\s\-\(\)]/g, '')
        : null;

      const finalPhone1 =
        cleaned1 && !cleaned1.startsWith('+') ? `+${cleaned1}` : cleaned1;
      const finalPhone2 =
        cleaned2 && !cleaned2.startsWith('+') ? `+${cleaned2}` : cleaned2;

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/add-phone`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionToken}`,
          },
          body: JSON.stringify({
            person1Phone: finalPhone1,
            person2Phone: finalPhone2,
          }),
        }
      );

      const data = await response.json();

      if (!data.success) {
        setPhoneError(data.error || 'Failed to save phone numbers');
        return;
      }

      alert('Phone numbers saved successfully!');
    } catch (err: any) {
      console.error('Error saving phone numbers:', err);
      setPhoneError('Failed to save phone numbers. Please try again.');
    } finally {
      setPhoneLoading(false);
    }
  };

  const connectionItems: ConnectionItem[] = [
    {
      icon: MessageSquare,
      label: 'Phone & SMS',
      description: 'Texting and verification',
      accounts: [
        {
          name: 'Phone numbers',
          status: hasSmsVerification ? 'connected' : 'disconnected',
        },
      ],
    },
    { 
      icon: Calendar, 
      label: 'Calendar & Email', 
      description: 'Google, Outlook, iCloud', 
      accounts: calendarAccounts
    },
    { 
      icon: Landmark, 
      label: 'Bank Accounts', 
      description: 'Link your banking', 
      accounts: bankAccounts.length
        ? bankAccounts
        : [
            { name: 'Bank Account •••• 0000', status: 'disconnected' },
          ]
    },
    { 
      icon: TrendingUp, 
      label: 'Brokerage Accounts', 
      description: 'Investment portfolios', 
      accounts: brokerageAccounts.length
        ? brokerageAccounts
        : [
            { name: 'Investment Account •••• 0000', status: 'disconnected' },
          ]
    },
    { 
      icon: Cloud, 
      label: 'Cloud Storage', 
      description: 'Drive, Dropbox, iCloud', 
      accounts: cloudStorageAccounts
    },
    { 
      icon: Shield, 
      label: 'Security Keys', 
      description: 'Two-factor authentication', 
      accounts: securityAccounts
    },
  ];

  const toggleExpand = (label: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedItems(newExpanded);
  };

  const hasConnections = (item: ConnectionItem) => 
    item.accounts.some(acc => acc.status === 'connected');

  return (
    <div className={`size-full overflow-y-auto overflow-x-hidden ${
      isDark 
        ? 'bg-gradient-to-b from-slate-900 to-slate-800' 
        : 'bg-gradient-to-b from-rose-50 to-orange-50'
    }`}>
      <div className="min-h-screen px-6 py-8 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <motion.button
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.6 }}
            onClick={onBack}
            className={`p-2 rounded-full transition-colors ${
              isDark ? 'hover:bg-slate-700/30' : 'hover:bg-white/30'
            }`}
            style={{ color: accentColor }}
          >
            <ArrowLeft size={24} />
          </motion.button>
          
          <motion.h1
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={`text-2xl font-light ${
              isDark ? 'text-slate-100' : 'text-blue-900/80'
            }`}
          >
            Connections
          </motion.h1>
          
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        {/* Connections List */}
        <div className="max-w-md mx-auto space-y-3">
          {connectionItems.map((item, index) => {
            const isExpanded = expandedItems.has(item.label);
            const connected = hasConnections(item);
            
            return (
              <motion.div
                key={item.label}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
                className={`backdrop-blur-sm rounded-2xl overflow-hidden ${
                  isDark ? 'bg-slate-700/40' : 'bg-white/40'
                }`}
              >
                <button
                  onClick={() => toggleExpand(item.label)}
                  className={`w-full p-5 flex items-center gap-4 transition-all active:scale-98 ${
                    isDark ? 'hover:bg-slate-700/60' : 'hover:bg-white/60'
                  }`}
                >
                  <div
                    className="p-3 rounded-xl"
                    style={{ backgroundColor: `${accentColor}20` }}
                  >
                    <item.icon size={22} style={{ color: accentColor }} />
                  </div>
                  
                  <div className="flex-1 text-left">
                    <h3 className={`text-base font-medium ${
                      isDark ? 'text-slate-100' : 'text-blue-900/90'
                    }`}>
                      {item.label}
                    </h3>
                    <p className={`text-sm ${
                      isDark ? 'text-slate-400' : 'text-blue-800/50'
                    }`}>
                      {item.description}
                    </p>
                  </div>
                  
                  {connected && (
                    <div className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      {item.accounts.filter(a => a.status === 'connected').length} Connected
                    </div>
                  )}
                  
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <ChevronDown size={20} className={isDark ? 'text-slate-400' : 'text-blue-900/40'} />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-4 space-y-2">
                        {item.accounts.map((account) => {
                          const isPerson1 =
                            account.name === `${person1Name || 'Partner 1'}'s Google Calendar`;
                          const isPerson2 = account.name === partner2CalendarLabel;
                          const isConnected = account.status === 'connected';

                          if (item.label === 'Phone & SMS') {
                            return (
                              <div
                                key={account.name}
                                className={`flex items-center justify-between p-3 rounded-xl ${
                                  isDark ? 'bg-slate-600/50' : 'bg-white/50'
                                }`}
                              >
                                <div className="flex-1">
                                  <p
                                    className={`text-sm font-medium ${
                                      isDark ? 'text-slate-100' : 'text-blue-900/80'
                                    }`}
                                  >
                                    {account.name}
                                  </p>
                                  <p
                                    className={`text-xs mt-0.5 ${
                                      isDark ? 'text-slate-400' : 'text-blue-800/50'
                                    }`}
                                  >
                                    {isConnected ? 'Connected' : 'Not connected'}
                                  </p>
                                </div>
                              </div>
                            );
                          }

                          if (item.label === 'Bank Accounts' || item.label === 'Brokerage Accounts') {
                            return null;
                          }

                          return (
                            <div
                              key={account.name}
                              className={`flex items-center justify-between p-3 rounded-xl ${
                                isDark ? 'bg-slate-600/50' : 'bg-white/50'
                              }`}
                            >
                              <div className="flex-1">
                                <p
                                  className={`text-sm font-medium ${
                                    isDark ? 'text-slate-100' : 'text-blue-900/80'
                                  }`}
                                >
                                  {account.name}
                                </p>
                                {account.email && (
                                  <p
                                    className={`text-xs mt-0.5 ${
                                      isDark
                                        ? 'text-slate-400'
                                        : 'text-blue-800/50'
                                    }`}
                                  >
                                    {account.email}
                                  </p>
                                )}
                              </div>

                              {isConnected ? (
                                <button
                                  className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700"
                                  onClick={() => {
                                    if (isPerson1) disconnectCalendar('person1');
                                    else if (isPerson2) disconnectCalendar('person2');
                                  }}
                                >
                                  Disconnect
                                </button>
                              ) : isPerson1 || isPerson2 ? (
                                <button
                                  className="px-3 py-1 rounded-full text-xs font-medium text-white"
                                  style={{ backgroundColor: accentColor }}
                                  onClick={() => {
                                    if (isPerson1) connectGoogleCalendar('person1');
                                    else if (isPerson2) connectGoogleCalendar('person2');
                                  }}
                                >
                                  Connect
                                </button>
                              ) : (
                                <button
                                  className="px-3 py-1 rounded-full text-xs font-medium text-white opacity-60"
                                  style={{ backgroundColor: accentColor }}
                                  disabled
                                >
                                  Connect
                                </button>
                              )}
                            </div>
                          );
                        })}

                        {item.label === 'Phone & SMS' && (
                          <div className="mt-3 space-y-3">
                            {(person1Phone || person2Phone) && (
                              <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-3 py-2 text-xs space-y-1">
                                <div className="font-medium">Current phone numbers:</div>
                                {person1Phone && (
                                  <div>{person1Name || 'Partner 1'}: {person1Phone}</div>
                                )}
                                {person2Phone && (
                                  <div>{person2Name || 'Partner 2'}: {person2Phone}</div>
                                )}
                              </div>
                            )}

                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  {person1Name || 'Partner 1'}'s Phone Number
                                </label>
                                <input
                                  type="tel"
                                  value={phoneNumber1}
                                  onChange={(e) => {
                                    setPhoneNumber1(e.target.value);
                                    setPhoneError(null);
                                  }}
                                  placeholder="+1234567890"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                  {hasPartner2Email
                                    ? `${person2Name || 'Partner 2'}'s Phone Number`
                                    : "Partner's phone number"}
                                </label>
                                <input
                                  type="tel"
                                  value={phoneNumber2}
                                  onChange={(e) => {
                                    setPhoneNumber2(e.target.value);
                                    setPhoneError(null);
                                  }}
                                  placeholder="+1234567890"
                                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                              </div>
                            </div>

                            {phoneError && (
                              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-xs">
                                {phoneError}
                              </div>
                            )}

                            <button
                              onClick={handleSavePhoneNumbers}
                              disabled={phoneLoading || !sessionToken}
                              className="w-full mt-1 flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              {phoneLoading
                                ? 'Saving...'
                                : (person1Phone || person2Phone)
                                  ? 'Update Phone Numbers'
                                  : 'Save Phone Numbers'}
                            </button>
                          </div>
                        )}

                        {/* Inline financial connections for Bank Accounts */}
                        {item.label === 'Bank Accounts' && (
                          <div className="mt-3 space-y-3">
                            {financialError && (
                              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs">
                                {financialError}
                              </div>
                            )}

                            {bankLinkedAccounts.length > 0 && (
                              <div className="space-y-2">
                                {bankLinkedAccounts.map((account: any) => {
                                  const balance = balances.find(
                                    (b: any) =>
                                      b.linked_accounts?.id === account.id ||
                                      b.linked_account_id === account.id
                                  );
                                  return (
                                    <div
                                      key={account.id}
                                      className={`flex items-start justify-between p-3 rounded-xl ${
                                        isDark
                                          ? 'bg-slate-700/60'
                                          : 'bg-white/70'
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className={`text-sm font-medium ${
                                            isDark
                                              ? 'text-slate-100'
                                              : 'text-blue-900/90'
                                          }`}
                                        >
                                          {account.display_name}
                                        </p>
                                        <p
                                          className={`text-xs ${
                                            isDark
                                              ? 'text-slate-400'
                                              : 'text-blue-800/60'
                                          }`}
                                        >
                                          {account.institution_name}
                                          {account.last_four_digits &&
                                            ` • •••• ${account.last_four_digits}`}
                                        </p>
                                        {balance && (
                                          <p className="text-xs mt-1 text-green-600">
                                            Balance:{' '}
                                            <span className="font-semibold">
                                              {formatCurrency(
                                                balance.current_balance_cents
                                              )}
                                            </span>
                                          </p>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-2 ml-4">
                                        <span className="text-xs font-medium text-green-600">
                                          Connected
                                        </span>
                                        <button
                                          type="button"
                                          className="px-3 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100"
                                          onClick={() => {
                                            const externalId = account.external_account_id || account.id;
                                            disconnectBankAccount(externalId);
                                          }}
                                        >
                                          Disconnect
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div
                              className={`mt-2 rounded-2xl p-4 ${
                                isDark
                                  ? 'bg-slate-700/40'
                                  : 'bg-white/70'
                              }`}
                            >
                              <p
                                className={`text-xs mb-3 ${
                                  isDark
                                    ? 'text-slate-300'
                                    : 'text-blue-800/70'
                                }`}
                              >
                                Connect your bank accounts or credit cards to
                                track balances and transactions. Homebase can
                                help you manage your finances together.
                              </p>

                              <div className="space-y-2">
                                <button
                                  onClick={() =>
                                    connectBankAccount('person1')
                                  }
                                  disabled={
                                    financialLoading ||
                                    !userId ||
                                    userId === 'default'
                                  }
                                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>
                                    {financialLoading
                                      ? 'Connecting...'
                                      : 'Connect Bank Account (Stripe)'}
                                  </span>
                                </button>

                                <button
                                  onClick={connectCreditCard}
                                  disabled={
                                    plaidLoading ||
                                    !userId ||
                                    userId === 'default'
                                  }
                                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>
                                    {plaidLoading
                                      ? 'Connecting...'
                                      : 'Connect Credit Card (Plaid)'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Inline financial connections for Brokerage Accounts */}
                        {item.label === 'Brokerage Accounts' && (
                          <div className="mt-3 space-y-3">
                            {financialError && (
                              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-2xl text-xs">
                                {financialError}
                              </div>
                            )}

                            {brokerageLinkedAccounts.length > 0 && (
                              <div className="space-y-2">
                                {brokerageLinkedAccounts.map((account: any) => {
                                  return (
                                    <div
                                      key={account.id}
                                      className={`flex items-start justify-between p-3 rounded-xl ${
                                        isDark
                                          ? 'bg-slate-700/60'
                                          : 'bg-white/70'
                                      }`}
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p
                                          className={`text-sm font-medium ${
                                            isDark
                                              ? 'text-slate-100'
                                              : 'text-blue-900/90'
                                          }`}
                                        >
                                          {account.display_name}
                                        </p>
                                        <p
                                          className={`text-xs ${
                                            isDark
                                              ? 'text-slate-400'
                                              : 'text-blue-800/60'
                                          }`}
                                        >
                                          {account.institution_name}
                                          {account.last_four_digits &&
                                            ` • •••• ${account.last_four_digits}`}
                                          {account.provider === 'snaptrade' && (
                                            <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                                              via SnapTrade
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-2 ml-4">
                                        <span className="text-xs font-medium text-green-600">
                                          Connected
                                        </span>
                                        <button
                                          type="button"
                                          className="px-3 py-1 rounded-full text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100"
                                          onClick={() => {
                                            const externalId = account.external_account_id || account.id;
                                            disconnectBankAccount(externalId);
                                          }}
                                        >
                                          Disconnect
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            <div
                              className={`mt-2 rounded-2xl p-4 ${
                                isDark
                                  ? 'bg-slate-700/40'
                                  : 'bg-white/70'
                              }`}
                            >
                              <p
                                className={`text-xs mb-3 ${
                                  isDark
                                    ? 'text-slate-300'
                                    : 'text-blue-800/70'
                                }`}
                              >
                                Connect your investment and brokerage accounts
                                to see your portfolios alongside your
                                day-to-day finances.
                              </p>

                              <div className="space-y-2">
                                <button
                                  onClick={() =>
                                    connectBrokerageAccount('person1')
                                  }
                                  disabled={
                                    snaptradeLoading ||
                                    financialLoading ||
                                    !userId ||
                                    userId === 'default'
                                  }
                                  className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                  <TrendingUp className="w-4 h-4" />
                                  <span>
                                    {snaptradeLoading
                                      ? 'Connecting...'
                                      : 'Connect Brokerage (SnapTrade)'}
                                  </span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Connect Another Button */}
                        <button
                          className={`w-full p-3 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 transition-colors mt-3 ${
                            isDark ? 'hover:bg-slate-700/30' : 'hover:bg-white/30'
                          }`}
                          style={{ borderColor: `${accentColor}40`, color: accentColor }}
                        >
                          <Plus size={18} />
                          <span className="text-sm font-medium">Connect Another</span>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Info Text */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1 }}
          className={`text-center mt-16 text-sm px-8 ${
            isDark ? 'text-slate-500' : 'text-blue-800/40'
          }`}
        >
          Your data is encrypted and secure
        </motion.div>
      </div>
    </div>
  );
}