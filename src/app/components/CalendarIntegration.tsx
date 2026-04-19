import { useState, useEffect } from 'react';
import { Calendar, Check, X, ExternalLink, Plus, Clock, MapPin, Phone, Save, CreditCard, DollarSign, TrendingUp } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { useFinancialConnections } from '../hooks/useFinancialConnections';
import { useCalendarConnections } from '../hooks/useCalendarConnections';

interface CalendarProvider {
  id: string;
  name: string;
  icon: string;
  color: string;
  supported: boolean;
  comingSoon?: boolean;
}

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
}

const CALENDAR_PROVIDERS: CalendarProvider[] = [
  { 
    id: 'google', 
    name: 'Google Calendar', 
    icon: '📅', 
    color: 'bg-blue-500',
    supported: true 
  },
  { 
    id: 'apple', 
    name: 'Apple Calendar (iCloud)', 
    icon: '🍎', 
    color: 'bg-gray-800',
    supported: false,
    comingSoon: true 
  },
  { 
    id: 'outlook', 
    name: 'Outlook Calendar', 
    icon: '📧', 
    color: 'bg-blue-600',
    supported: false,
    comingSoon: true 
  },
  { 
    id: 'yahoo', 
    name: 'Yahoo Calendar', 
    icon: '💜', 
    color: 'bg-purple-600',
    supported: false,
    comingSoon: true 
  },
];

interface CalendarIntegrationProps {
  userId?: string;
  person1Name?: string;
  person2Name?: string;
  sessionToken?: string | null;
  userPhone?: string | null; // Legacy, kept for backward compatibility
  person1Phone?: string | null;
  person2Phone?: string | null;
  onClose?: () => void;
  onOpenSMSSetup?: () => void;
}

export function CalendarIntegration({ 
  userId = 'default', 
  person1Name = 'Partner 1',
  person2Name = 'Partner 2',
  sessionToken,
  userPhone, // Legacy
  person1Phone,
  person2Phone,
  onClose,
  onOpenSMSSetup
}: CalendarIntegrationProps) {
  const {
    person1Connected,
    person2Connected,
    person1Events,
    person2Events,
    loading,
    error,
    fetchEvents,
    connectGoogleCalendar,
    disconnectCalendar,
  } = useCalendarConnections(userId);

  // Track which partner's events are being shown
  const [showEvents, setShowEvents] = useState<{ person1: boolean; person2: boolean }>({ person1: false, person2: false });
  const [debugConfig, setDebugConfig] = useState<any>(null);
  
  // Phone number management - support both partners
  // Use person1Phone/person2Phone if provided, otherwise fall back to userPhone for backward compatibility
  const [phoneNumber1, setPhoneNumber1] = useState<string>(person1Phone || userPhone || '');
  const [phoneNumber2, setPhoneNumber2] = useState<string>(person2Phone || '');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = useState(false);

  const {
    linkedAccounts,
    balances,
    financialError,
    financialLoading,
    plaidLoading,
    connectBankAccount,
    connectCreditCard,
    formatCurrency,
  } = useFinancialConnections(userId);


  useEffect(() => {
    fetchDebugConfig();
    
    // Global message listener for debugging - filters out noise
    const globalMessageHandler = (event: MessageEvent) => {
      // Filter out Stripe's internal messages (they're just noise)
      if (event.origin === 'https://js.stripe.com') {
        // Only log Stripe errors or important events
        if (event.data?.type && event.data.type.includes('error')) {
          console.log('🔴 Stripe Error:', event.data);
        }
        return; // Skip logging Stripe's internal messages
      }
      
      // Only log messages from our own origin or important OAuth messages
      if (event.origin === window.location.origin || 
          event.data?.type === 'google-oauth-success' ||
          event.data?.type === 'google-oauth-error') {
        console.log('🌐 Relevant Message:', {
          origin: event.origin,
          type: event.data?.type,
          data: event.data
        });
      }
    };
    
    window.addEventListener('message', globalMessageHandler);
    
    return () => {
      window.removeEventListener('message', globalMessageHandler);
    };
  }, [userId]);

  useEffect(() => {
    if (!person1Connected) {
      setShowEvents((prev) => ({ ...prev, person1: false }));
    }
  }, [person1Connected]);

  useEffect(() => {
    if (!person2Connected) {
      setShowEvents((prev) => ({ ...prev, person2: false }));
    }
  }, [person2Connected]);

  // Plaid Link configuration
  const { open, ready } = usePlaidLink({
    token: plaidLinkToken,
    onSuccess: async (publicToken, metadata) => {
      console.log('Plaid Link success:', { publicToken, metadata });
      setPlaidLoading(true);
      
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/plaid-exchange-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({
              userId: userId,
              partnerRole: 'person1',
              publicToken: publicToken
            })
          }
        );

        const data = await response.json();
        
        if (data.success) {
          // Refresh accounts and balances
          await fetchLinkedAccounts();
          await fetchBalances();
          setPlaidLinkToken(null);
          setPlaidLoading(false);
        } else {
          setFinancialError(data.error || 'Failed to connect account');
          setPlaidLoading(false);
        }
      } catch (err: any) {
        console.error('Error exchanging Plaid token:', err);
        setFinancialError(err.message || 'Failed to connect account');
        setPlaidLoading(false);
      }
    },
    onExit: (err, metadata) => {
      if (err) {
        console.error('Plaid Link error:', err);
        setFinancialError(err.error_message || 'Connection cancelled');
      }
      setPlaidLinkToken(null);
      setPlaidLoading(false);
    },
  });

  // Open Plaid Link when token is ready
  useEffect(() => {
    if (plaidLinkToken && ready) {
      open();
    }
  }, [plaidLinkToken, ready, open]);

  const fetchDebugConfig = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/debug-config`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const data = await response.json();
      setDebugConfig(data);
      console.log('Calendar Debug Config:', data);
    } catch (err) {
      console.error('Error fetching debug config:', err);
    }
  };


  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isTomorrow = date.toDateString() === new Date(now.getTime() + 86400000).toDateString();
    
    const timeStr = date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
    
    if (isToday) return `Today at ${timeStr}`;
    if (isTomorrow) return `Tomorrow at ${timeStr}`;
    
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Financial connections functions moved to useFinancialConnections

  return (
    <div className="bg-white rounded-none sm:rounded-lg shadow-lg max-w-2xl w-full h-full sm:h-auto mx-auto flex flex-col max-h-screen sm:max-h-[90vh] sm:m-4">
      <div className="p-4 sm:p-6 border-b border-gray-200 flex-shrink-0">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2 sm:gap-3">
            <Calendar className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500 flex-shrink-0" />
            <h2 className="text-lg sm:text-xl font-semibold">Calendar Integration</h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 p-1 -mr-1 touch-manipulation"
              aria-label="Close"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          )}
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1 overscroll-contain">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Partner Calendar Connections */}
        <div>
          <h3 className="font-semibold mb-3 sm:mb-4 text-gray-900 text-base sm:text-lg">Partner Calendars</h3>
          <div className="space-y-3 sm:space-y-4">
            {/* Person 1's Calendar */}
            <div className="border rounded-lg p-3 sm:p-4 border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl flex-shrink-0">📅</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 flex flex-wrap items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
                      <span className="truncate">{person1Name}'s Google Calendar</span>
                      {person1Connected && (
                        <span className="flex items-center gap-1 text-xs sm:text-sm text-green-600 flex-shrink-0">
                          <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                            Connected
                          </span>
                      )}
                    </div>
                    </div>
                  </div>

                <div className="flex gap-2 flex-shrink-0">
                  {!person1Connected ? (
                        <button
                      onClick={() => connectGoogleCalendar('person1')}
                          disabled={loading}
                      className="flex items-center gap-1.5 sm:gap-2 bg-blue-500 text-white px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base touch-manipulation min-h-[44px]"
                        >
                          <Plus className="w-4 h-4" />
                      <span>Connect</span>
                        </button>
                      ) : (
                        <>
                          <button
                        onClick={() => setShowEvents({ ...showEvents, person1: !showEvents.person1 })}
                        className="flex items-center gap-1.5 sm:gap-2 bg-gray-100 text-gray-700 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm sm:text-base touch-manipulation min-h-[44px]"
                          >
                            <Calendar className="w-4 h-4" />
                        <span className="hidden sm:inline">{showEvents.person1 ? 'Hide' : 'View'} Events</span>
                        <span className="sm:hidden">{showEvents.person1 ? 'Hide' : 'View'}</span>
                          </button>
                          <button
                        onClick={() => disconnectCalendar('person1')}
                            disabled={loading}
                        className="text-red-600 hover:text-red-700 px-3 py-2.5 sm:py-2 text-sm sm:text-base touch-manipulation min-h-[44px]"
                          >
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
              </div>
            </div>

            {/* Person 2's Calendar */}
            <div className="border rounded-lg p-3 sm:p-4 border-gray-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <span className="text-xl sm:text-2xl flex-shrink-0">📅</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-gray-900 flex flex-wrap items-center gap-1.5 sm:gap-2 text-sm sm:text-base">
                      <span className="truncate">{person2Name}'s Google Calendar</span>
                      {person2Connected && (
                        <span className="flex items-center gap-1 text-xs sm:text-sm text-green-600 flex-shrink-0">
                          <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                          Connected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0">
                  {!person2Connected ? (
                    <button
                      onClick={() => connectGoogleCalendar('person2')}
                      disabled={loading}
                      className="flex items-center gap-1.5 sm:gap-2 bg-blue-500 text-white px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base touch-manipulation min-h-[44px]"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Connect</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setShowEvents({ ...showEvents, person2: !showEvents.person2 })}
                        className="flex items-center gap-1.5 sm:gap-2 bg-gray-100 text-gray-700 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm sm:text-base touch-manipulation min-h-[44px]"
                      >
                        <Calendar className="w-4 h-4" />
                        <span className="hidden sm:inline">{showEvents.person2 ? 'Hide' : 'View'} Events</span>
                        <span className="sm:hidden">{showEvents.person2 ? 'Hide' : 'View'}</span>
                      </button>
                      <button
                        onClick={() => disconnectCalendar('person2')}
                        disabled={loading}
                        className="text-red-600 hover:text-red-700 px-3 py-2.5 sm:py-2 text-sm sm:text-base touch-manipulation min-h-[44px]"
                      >
                        Disconnect
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Calendar Events */}
        {(showEvents.person1 || showEvents.person2) && (
          <div className="border-t pt-4 sm:pt-6 space-y-4 sm:space-y-6">
            {/* Person 1's Events */}
            {showEvents.person1 && person1Connected && (
              <div>
                <h3 className="font-semibold mb-3 sm:mb-4 text-gray-900 text-base sm:text-lg">
                  {person1Name}'s Upcoming Events (Next 7 Days)
            </h3>
            
                {person1Events.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <Calendar className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm sm:text-base">No upcoming events</p>
              </div>
            ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {person1Events.map((event, index) => (
                  <div
                        key={`person1-${index}`}
                        className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                  >
                        <div className="flex items-start gap-2 sm:gap-3">
                          <div className="bg-blue-100 rounded-lg p-1.5 sm:p-2 mt-0.5 sm:mt-1 flex-shrink-0">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
                      </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 text-sm sm:text-base break-words">{event.summary}</h4>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mt-1">
                              <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="break-words">{formatDate(event.start)}</span>
                        </div>
                        {event.location && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mt-1">
                                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                <span className="break-words">{event.location}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <button
                  onClick={() => fetchEvents('person1')}
                  disabled={loading}
                  className="mt-3 sm:mt-4 w-full text-center text-xs sm:text-sm text-blue-600 hover:text-blue-700 py-2.5 sm:py-2 touch-manipulation min-h-[44px]"
                >
                  Refresh {person1Name}'s Events
                </button>
              </div>
            )}

            {/* Person 2's Events */}
            {showEvents.person2 && person2Connected && (
              <div>
                <h3 className="font-semibold mb-3 sm:mb-4 text-gray-900 text-base sm:text-lg">
                  {person2Name}'s Upcoming Events (Next 7 Days)
                </h3>
                
                {person2Events.length === 0 ? (
                  <div className="text-center py-6 sm:py-8 text-gray-500">
                    <Calendar className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 opacity-30" />
                    <p className="text-sm sm:text-base">No upcoming events</p>
                  </div>
                ) : (
                  <div className="space-y-2 sm:space-y-3">
                    {person2Events.map((event, index) => (
                      <div
                        key={`person2-${index}`}
                        className="border border-gray-200 rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-2 sm:gap-3">
                          <div className="bg-purple-100 rounded-lg p-1.5 sm:p-2 mt-0.5 sm:mt-1 flex-shrink-0">
                            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 text-sm sm:text-base break-words">{event.summary}</h4>
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mt-1">
                              <Clock className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                              <span className="break-words">{formatDate(event.start)}</span>
                            </div>
                            {event.location && (
                              <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-600 mt-1">
                                <MapPin className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                                <span className="break-words">{event.location}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                <button
                  onClick={() => fetchEvents('person2')}
              disabled={loading}
                  className="mt-3 sm:mt-4 w-full text-center text-xs sm:text-sm text-blue-600 hover:text-blue-700 py-2.5 sm:py-2 touch-manipulation min-h-[44px]"
            >
                  Refresh {person2Name}'s Events
                </button>
              </div>
            )}
          </div>
        )}

        {/* Phone Number Management */}
        <div className="border-t pt-4 sm:pt-6">
          <h3 className="font-semibold mb-3 sm:mb-4 text-gray-900 flex items-center gap-2 text-base sm:text-lg">
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
            SMS Texting
          </h3>
          <div className="border rounded-lg p-3 sm:p-4 border-gray-200 bg-gray-50">
            <div className="bg-blue-50 border-l-4 border-blue-500 p-3 sm:p-4 rounded mb-3 sm:mb-4">
              <p className="text-xs sm:text-sm font-semibold text-blue-900 mb-1.5 sm:mb-2">
                📱 Text Homebase at:
              </p>
              <p className="text-xl sm:text-2xl font-bold text-blue-600 mb-1.5 sm:mb-2 break-all">
                +12014855992
              </p>
              <p className="text-xs text-blue-700 mb-2 sm:mb-3">
                Add your phone numbers below so Homebase can recognize you when you text
              </p>
              {onOpenSMSSetup && (
                <button
                  onClick={onOpenSMSSetup}
                  className="text-xs sm:text-sm text-blue-600 hover:text-blue-800 underline font-medium touch-manipulation py-1"
                >
                  View SMS Setup & Configuration →
                </button>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              Add phone numbers for both partners to enable SMS texting. Either partner can text <strong className="text-blue-600 break-all">+12014855992</strong> to interact with Homebase and access your shared account.
            </p>
            
            <div className="space-y-3 sm:space-y-4">
              {/* Person 1 Phone Number */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {person1Name}'s Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber1}
                  onChange={(e) => {
                    setPhoneNumber1(e.target.value);
                    setPhoneError(null);
                  }}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Include country code (e.g., +1 for US)
                </p>
              </div>
              
              {/* Person 2 Phone Number */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  {person2Name}'s Phone Number
                </label>
                <input
                  type="tel"
                  value={phoneNumber2}
                  onChange={(e) => {
                    setPhoneNumber2(e.target.value);
                    setPhoneError(null);
                  }}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2.5 sm:py-2 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 touch-manipulation"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Include country code (e.g., +1 for US)
                </p>
              </div>
              
              {phoneError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 sm:px-4 py-2 rounded text-xs sm:text-sm">
                  {phoneError}
                </div>
              )}
              
              {(person1Phone || person2Phone || userPhone) && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-3 sm:px-4 py-2 rounded text-xs sm:text-sm space-y-1">
                  <div className="flex items-center gap-2">
                    <Check className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" />
                    <span className="font-medium">Current phone numbers:</span>
                  </div>
                  {person1Phone && (
                    <div className="ml-5 sm:ml-6 text-xs sm:text-sm break-all">
                      {person1Name}: {person1Phone}
                    </div>
                  )}
                  {person2Phone && (
                    <div className="ml-5 sm:ml-6 text-xs sm:text-sm break-all">
                      {person2Name}: {person2Phone}
                    </div>
                  )}
                  {userPhone && !person1Phone && !person2Phone && (
                    <div className="ml-5 sm:ml-6 text-xs sm:text-sm break-all">
                      Current: {userPhone}
                    </div>
                  )}
                </div>
              )}
              
              <button
                onClick={async () => {
                  if (!sessionToken) {
                    setPhoneError('You must be logged in to save phone numbers');
                    return;
                  }
                  
                  if (!phoneNumber1.trim() && !phoneNumber2.trim()) {
                    setPhoneError('Please enter at least one phone number');
                    return;
                  }
                  
                  // Basic phone validation
                  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
                  
                  if (phoneNumber1.trim()) {
                    const cleanedPhone1 = phoneNumber1.replace(/[\s\-\(\)]/g, '');
                    if (!phoneRegex.test(cleanedPhone1)) {
                      setPhoneError(`${person1Name}'s phone number is invalid. Please use format: +1234567890`);
                      return;
                    }
                  }
                  
                  if (phoneNumber2.trim()) {
                    const cleanedPhone2 = phoneNumber2.replace(/[\s\-\(\)]/g, '');
                    if (!phoneRegex.test(cleanedPhone2)) {
                      setPhoneError(`${person2Name}'s phone number is invalid. Please use format: +1234567890`);
                      return;
                    }
                  }
                  
                  setPhoneLoading(true);
                  setPhoneError(null);
                  
                  try {
                    // Normalize phone numbers
                    const cleanedPhone1 = phoneNumber1.trim() ? phoneNumber1.replace(/[\s\-\(\)]/g, '') : null;
                    const cleanedPhone2 = phoneNumber2.trim() ? phoneNumber2.replace(/[\s\-\(\)]/g, '') : null;
                    
                    // Ensure phone numbers start with +
                    const finalPhone1 = cleanedPhone1 && !cleanedPhone1.startsWith('+') 
                      ? `+${cleanedPhone1}` 
                      : cleanedPhone1;
                    const finalPhone2 = cleanedPhone2 && !cleanedPhone2.startsWith('+') 
                      ? `+${cleanedPhone2}` 
                      : cleanedPhone2;
                    
                    const response = await fetch(
                      `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/add-phone`,
                      {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': `Bearer ${sessionToken}`
                        },
                        body: JSON.stringify({ 
                          person1Phone: finalPhone1,
                          person2Phone: finalPhone2
                        })
                      }
                    );
                    
                    const data = await response.json();
                    
                    if (data.success) {
                      setPhoneError(null);
                      // Show success message
                      alert('Phone numbers saved successfully! Both partners can now text your toll-free number to interact with Homebase.');
                      // Reload page to refresh user data
                      window.location.reload();
                    } else {
                      setPhoneError(data.error || 'Failed to save phone numbers');
                    }
                  } catch (error) {
                    console.error('Error saving phone numbers:', error);
                    setPhoneError('Failed to save phone numbers. Please try again.');
                  } finally {
                    setPhoneLoading(false);
                  }
                }}
                disabled={phoneLoading || !sessionToken}
                className="flex items-center justify-center gap-2 bg-blue-500 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base touch-manipulation min-h-[44px] w-full"
              >
                <Save className="w-4 h-4" />
                <span>{phoneLoading ? 'Saving...' : (person1Phone || person2Phone || userPhone) ? 'Update Phone Numbers' : 'Save Phone Numbers'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Financial Connections */}
        <div className="border-t pt-4 sm:pt-6">
          <h3 className="font-semibold mb-3 sm:mb-4 text-gray-900 flex items-center gap-2 text-base sm:text-lg">
            <CreditCard className="w-4 h-4 sm:w-5 sm:h-5" />
            Bank Accounts
          </h3>
          
          {financialError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-3 sm:mb-4 text-xs sm:text-sm">
              {financialError}
            </div>
          )}

          {/* Connected Accounts */}
          {linkedAccounts.length > 0 && (
            <div className="space-y-3 sm:space-y-4 mb-4">
              {linkedAccounts.map((account) => {
                const balance = balances.find((b: any) => 
                  b.linked_accounts?.id === account.id || 
                  b.linked_account_id === account.id
                );
                
                return (
                  <div key={account.id} className="border rounded-lg p-3 sm:p-4 border-gray-200 bg-white">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                          <h4 className="font-medium text-gray-900 text-sm sm:text-base truncate">
                            {account.display_name}
                          </h4>
                        </div>
                        <p className="text-xs sm:text-sm text-gray-600 mb-2">
                          {account.institution_name}
                          {account.last_four_digits && ` • •••• ${account.last_four_digits}`}
                        </p>
                        {balance && (
                          <div className="flex items-center gap-2 text-xs sm:text-sm">
                            <DollarSign className="w-3 h-3 sm:w-4 sm:h-4 text-green-600" />
                            <span className="text-gray-700">
                              Balance: <span className="font-semibold text-gray-900">
                                {formatCurrency(balance.current_balance_cents)}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs sm:text-sm text-green-600 flex-shrink-0">
                        <Check className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span>Connected</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Connect New Account Buttons */}
          <div className="border rounded-lg p-3 sm:p-4 border-gray-200 bg-gray-50">
            <p className="text-xs sm:text-sm text-gray-600 mb-3 sm:mb-4">
              Connect your bank accounts or credit cards to track balances and transactions. Homebase can help you manage your finances together.
            </p>
            <div className="space-y-2">
              <button
                onClick={() => connectBankAccount('person1')}
                disabled={financialLoading || !userId || userId === 'default'}
                className="flex items-center justify-center gap-2 bg-green-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base touch-manipulation min-h-[44px] w-full"
              >
                <Plus className="w-4 h-4" />
                <span>{financialLoading ? 'Connecting...' : 'Connect Bank Account (Stripe)'}</span>
              </button>
              <button
                onClick={connectCreditCard}
                disabled={plaidLoading || !userId || userId === 'default'}
                className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-3 sm:py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm sm:text-base touch-manipulation min-h-[44px] w-full"
              >
                <CreditCard className="w-4 h-4" />
                <span>{plaidLoading ? 'Connecting...' : 'Connect Credit Card (Plaid)'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 sm:p-4 text-xs sm:text-sm text-blue-800">
          <div className="flex gap-2">
            <Calendar className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">How it works:</p>
              <p className="text-blue-700 text-xs sm:text-sm">
                Connect your calendar to let Homebase view your schedule and help coordinate 
                plans between partners. Your calendar data is securely stored and only used 
                to enhance your weekly check-ins.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}