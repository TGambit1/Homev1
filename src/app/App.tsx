import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatBubble } from './components/ChatBubble';
import { TypingIndicator } from './components/TypingIndicator';
import { CalendarIntegration } from './components/CalendarIntegration';
import { TwilioDebug } from './components/TwilioDebug';
import { Login } from './components/Login';
import { ResetPassword } from './components/ResetPassword';
import { PartnerSignup } from './components/PartnerSignup';
import { Send, Settings, LogOut, MessageSquare } from 'lucide-react';
import { projectId, publicAnonKey } from '../../utils/supabase/info';
import OptionC from './components/OptionC';
import SettingsPage from './components/SettingsPage';
import AccountPage from './components/AccountPage';
import ConnectionsPage from './components/ConnectionsPage';
import AppearancePage from './components/AppearancePage';
import { OnboardingWizard } from './components/OnboardingWizard';

interface Message {
  id: string;
  sender: 'you' | 'partner' | 'ai';
  text: string;
  timestamp: Date;
  imageUrl?: string;
  imageUrls?: string[];
}

/** Set to true to show calendar images in chat. When false, calendar is words-only. */
const USE_CALENDAR_IMAGE = false;

const THEME_STORAGE_KEY = "homebase-ui-theme";

function readStoredTheme(): "light" | "dark" | "auto" {
  if (typeof window === "undefined") return "dark";
  try {
    // Always dark — clear any old light preference
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
  } catch {
    /* ignore */
  }
  return "dark";
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [sessionId] = useState(() => `web-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTwilioDebug, setShowTwilioDebug] = useState(false);
  const [currentPage, setCurrentPage] =useState<'home' | 'onboarding' | 'partnerSignup' | 'settings' | 'account' | 'connections' | 'appearance' | 'chat'>('home');
  const [theme, setTheme] = useState<"light" | "dark" | "auto">(readStoredTheme);
  const [accentColor, setAccentColor] = useState<string>('#7eb6eb');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messageIdCounter = useRef(0);
  
  // Authentication state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const normalizeVerifiedUser = (raw: any) => {
    const li =
      (typeof window !== 'undefined' ? localStorage.getItem('loggedInEmail') : null) ||
      raw.primaryEmail ||
      '';
    const loggedInAs =
      raw.secondaryEmail && li === raw.secondaryEmail ? 'person2' : 'person1';
    return { ...raw, loggedInEmail: li, loggedInAs };
  };

  const refreshUserFromVerify = useCallback(async () => {
    const token =
      sessionToken ||
      (typeof window !== 'undefined' ? localStorage.getItem('sessionToken') : null);
    if (!token) return;
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/verify`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await response.json();
      if (data.authenticated && data.user) {
        setUser(normalizeVerifiedUser(data.user));
      }
    } catch (err) {
      console.error('refreshUserFromVerify:', err);
    }
  }, [sessionToken]);

  // Password reset: show ResetPassword when URL has ?token= (e.g. from email link)
  const [resetToken, setResetToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('token');
  });

  const [partnerInviteToken, setPartnerInviteToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('partnerInviteToken');
  });

  // Check for existing session on mount
  useEffect(() => {
    const checkAuth = async () => {
      const token = localStorage.getItem('sessionToken');
      const storedUserId = localStorage.getItem('userId');
      
      if (token && storedUserId) {
        // Verify session is still valid
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/verify`,
            {
              headers: {
                'Authorization': `Bearer ${token}`
              }
            }
          );
          
          const data = await response.json();
          
          if (data.authenticated) {
            const mergedUser = normalizeVerifiedUser(data.user);
            setSessionToken(token);
            setUserId(data.user.userId);
            setUser(mergedUser);
            console.log('Authenticated user data (session restore):', mergedUser);
            setIsAuthenticated(true);
              setCurrentPage('onboarding');
            
            // Don't show SMS setup on session restore - only on actual login
            // (Session restore happens on page refresh, login happens via handleLogin)
          } else {
            // Session expired or invalid
            localStorage.removeItem('sessionToken');
            localStorage.removeItem('userId');
            localStorage.removeItem('userEmail');
            localStorage.removeItem('primaryEmail');
            localStorage.removeItem('secondaryEmail');
            localStorage.removeItem('loggedInEmail');
            localStorage.removeItem('person1Name');
            localStorage.removeItem('person2Name');
          }
        } catch (error) {
          console.error('Auth verification error:', error);
          localStorage.removeItem('sessionToken');
          localStorage.removeItem('userId');
        }
      }
      
      setIsCheckingAuth(false);
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !sessionToken) return;
    if (currentPage !== 'settings' && currentPage !== 'account' && currentPage !== 'connections') {
      return;
    }
    refreshUserFromVerify();
  }, [currentPage, isAuthenticated, sessionToken, refreshUserFromVerify]);

  // Web chat is intentionally not auto-enabled in normal onboarding flow.

  // Update time every minute
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;

    if (theme === "light") {
      root.classList.remove("dark");
      root.setAttribute("data-theme", "light");
      return;
    }

    if (theme === "dark") {
      root.classList.add("dark");
      root.setAttribute("data-theme", "dark");
      return;
    }

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = mq.matches;
      root.classList.toggle("dark", dark);
      root.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  // Send initial AI greeting only when the dev chat page is explicitly open.
  useEffect(() => {
    if (!hasInitialized && isAuthenticated && userId && currentPage === 'chat') {
      setHasInitialized(true);
      setIsTyping(true);
      
      setTimeout(async () => {
        try {
          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify({
                message: '[SYSTEM: First interaction. Greet warmly and introduce yourself as Homebase, a personal assistant for couples. Ask if they want to do a weekly check-in or have questions. Keep it brief, friendly, and natural - 2 sentences max.]',
                sessionId: sessionId
              })
            }
          );

          const data = await response.json();
          if (data.success) {
            const aiMessage: Message = {
              id: generateMessageId(),
              sender: 'ai',
              text: data.response,
              timestamp: new Date()
            };
            setMessages([aiMessage]);
          } else {
            throw new Error(data.error || 'Failed to get response');
          }
        } catch (error) {
          console.error('Error fetching initial greeting:', error);
          const fallbackMessage: Message = {
            id: generateMessageId(),
            sender: 'ai',
            text: "Hey! I'm Homebase, your personal assistant. Ready for a weekly check-in?",
            timestamp: new Date()
          };
          setMessages([fallbackMessage]);
        } finally {
          setIsTyping(false);
        }
      }, 1000);
    }
  }, [hasInitialized, sessionId, isAuthenticated, userId, currentPage]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const generateMessageId = () => {
    messageIdCounter.current += 1;
    return `msg-${Date.now()}-${messageIdCounter.current}`;
  };

  // Handle login
  const handleLogin = (token: string, userUserId: string, userData: any) => {
    if (userData.loggedInEmail) {
      localStorage.setItem('loggedInEmail', userData.loggedInEmail);
    }
    const merged = normalizeVerifiedUser(userData);
    setSessionToken(token);
    setUserId(userUserId);
    setUser(merged);
    console.log('Authenticated user data (login):', merged);
    setIsAuthenticated(true);

    // New: route new users into the fast onboarding flow.
    setCurrentPage('onboarding');
  };

  // Handle logout
  const handleLogout = async () => {
    if (sessionToken) {
      try {
        await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/logout`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${sessionToken}`
            }
          }
        );
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
    
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('primaryEmail');
    localStorage.removeItem('secondaryEmail');
    localStorage.removeItem('loggedInEmail');
    localStorage.removeItem('person1Name');
    localStorage.removeItem('person2Name');
    
    setSessionToken(null);
    setUserId(null);
    setUser(null);
    setIsAuthenticated(false);
    setMessages([]);
    setHasInitialized(false);
  };

  // Helper function to parse natural language date/time to ISO format
  const parseDateTime = (dateStr: string | null, timeStr: string | null): string | null => {
    if (!dateStr) return null;
    
    try {
      const now = new Date();
      let targetDate = new Date(now);
      
      // Parse date
      const dateLower = dateStr.toLowerCase().trim();
      
      if (dateLower.includes('today')) {
        targetDate = new Date(now);
      } else if (dateLower.includes('tomorrow')) {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (dateLower.includes('next week')) {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 7);
      } else if (dateLower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/)) {
        // Handle "next Tuesday", "next Monday", etc.
        const dayMatch = dateLower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
        if (dayMatch) {
          const targetDayName = dayMatch[1];
          const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const targetDayIndex = dayNames.indexOf(targetDayName);
          const currentDayIndex = now.getDay();
          
          let daysToAdd = targetDayIndex - currentDayIndex;
          if (daysToAdd <= 0) {
            daysToAdd += 7; // Next week
          }
          
          targetDate = new Date(now);
          targetDate.setDate(targetDate.getDate() + daysToAdd);
        }
      } else {
        // Try to parse dates like "February 10th", "Feb 10th", "Feb. 10th", "tuesday February 10th", etc.
        // Extract month and day from the string
        const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
                           'july', 'august', 'september', 'october', 'november', 'december'];
        const monthAbbrevs = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
                              'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
        
        let month = -1;
        let day = -1;
        let year = now.getFullYear();
        
        // Remove day-of-week names that might interfere
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        let cleanedDate = dateLower;
        for (const dayName of dayNames) {
          cleanedDate = cleanedDate.replace(new RegExp(`\\b${dayName}\\b`, 'g'), '').trim();
        }
        
        console.log(`🔍 Date parsing - original: "${dateStr}", cleaned: "${cleanedDate}"`);
        
        // Find month name or abbreviation (handle with/without periods)
        for (let i = 0; i < monthNames.length; i++) {
          const monthName = monthNames[i];
          const monthAbbrev = monthAbbrevs[i];
          // Check for full month name
          if (cleanedDate.includes(monthName)) {
            month = i;
            console.log(`✅ Found month: ${monthName} (index: ${i})`);
            break;
          }
          // Check for abbreviation with or without period
          const abbrevPattern = new RegExp(`\\b${monthAbbrev}\\.?\\b`, 'i');
          if (abbrevPattern.test(cleanedDate)) {
            month = i;
            console.log(`✅ Found month abbreviation: ${monthAbbrev} (index: ${i})`);
            break;
          }
        }
        
        // Extract day number (handle "10th", "1st", "2nd", "3rd", etc.)
        // Look for the first number that appears after the month
        const dayMatch = cleanedDate.match(/(\d{1,2})(?:st|nd|rd|th)?/);
        if (dayMatch) {
          day = parseInt(dayMatch[1]);
          console.log(`✅ Found day: ${day}`);
        }
        
        // Extract year if present
        const yearMatch = dateLower.match(/(\d{4})/);
        if (yearMatch) {
          year = parseInt(yearMatch[1]);
          console.log(`✅ Found year: ${year}`);
        } else {
          console.log(`📅 No year found, using current year: ${year}`);
        }
        
        // If we found both month and day, create the date
        if (month !== -1 && day !== -1) {
          // Create date at noon local time to avoid timezone issues
          targetDate = new Date(year, month, day, 12, 0, 0);
          
          // Validate the date was created correctly
          if (targetDate.getMonth() !== month || targetDate.getDate() !== day) {
            console.error(`❌ Date creation failed! Expected: month ${month + 1}, day ${day}, but got: month ${targetDate.getMonth() + 1}, day ${targetDate.getDate()}`);
            return null;
          }
          
          // If the date is in the past (for current year), assume next year
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const targetDateOnly = new Date(year, month, day);
          if (targetDateOnly < today && year === now.getFullYear()) {
            targetDate = new Date(year + 1, month, day, 12, 0, 0);
            year = year + 1;
            console.log(`📅 Date was in the past, using next year: ${year}`);
          }
          
          console.log(`📅 Parsed date: "${dateStr}" → ${targetDate.toDateString()} (month: ${month + 1}, day: ${day}, year: ${year})`);
          console.log(`📅 Date components: getMonth()=${targetDate.getMonth()}, getDate()=${targetDate.getDate()}, getFullYear()=${targetDate.getFullYear()}`);
        } else {
          // Fallback: try JavaScript's Date parser
          const parsed = new Date(dateStr);
          if (!isNaN(parsed.getTime())) {
            targetDate = parsed;
            console.log(`📅 Parsed date (fallback): "${dateStr}" → ${targetDate.toDateString()}`);
          } else {
            console.error('❌ Could not parse date:', dateStr);
            return null;
          }
        }
      }
      
      // Parse time
      if (timeStr) {
        const timeLower = timeStr.toLowerCase().replace(/\s/g, '');
        let hours = 12; // Default to noon
        let minutes = 0;
        
        // Parse formats like "2pm", "3:30pm", "14:00"
        const pmMatch = timeLower.match(/(\d{1,2}):?(\d{2})?pm/);
        const amMatch = timeLower.match(/(\d{1,2}):?(\d{2})?am/);
        const militaryMatch = timeLower.match(/(\d{1,2}):(\d{2})/);
        
        if (pmMatch) {
          hours = parseInt(pmMatch[1]);
          minutes = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
          if (hours !== 12) hours += 12;
        } else if (amMatch) {
          hours = parseInt(amMatch[1]);
          minutes = amMatch[2] ? parseInt(amMatch[2]) : 0;
          if (hours === 12) hours = 0;
        } else if (militaryMatch) {
          hours = parseInt(militaryMatch[1]);
          minutes = parseInt(militaryMatch[2]);
        } else {
          // Try to extract just the number
          const numMatch = timeLower.match(/(\d{1,2})/);
          if (numMatch) {
            hours = parseInt(numMatch[1]);
            if (hours < 12 && !timeLower.includes('am')) {
              hours += 12; // Assume PM if no AM specified
            }
          }
        }
        
        targetDate.setHours(hours, minutes, 0, 0);
        console.log(`⏰ Parsed time: "${timeStr}" → ${hours}:${minutes.toString().padStart(2, '0')}`);
      }
      
      console.log(`📅 Final parsed datetime: ${targetDate.toISOString()} (${targetDate.toLocaleString()})`);
      
      // Return ISO string with timezone
      return targetDate.toISOString();
    } catch (error) {
      console.error('Error parsing date/time:', error);
      return null;
    }
  };

  // Helper function to convert technical errors to natural language
  const convertErrorToNaturalLanguage = (error: any, context?: string): string => {
    const errorMessage = error?.message || error?.error || String(error) || 'Unknown error';
    const errorString = errorMessage.toLowerCase();
    
    // Network/connection errors
    if (errorString.includes('failed to fetch') || errorString.includes('network') || errorString.includes('connection')) {
      return 'I\'m having trouble connecting to the service right now. Please check your internet connection and try again.';
    }
    
    // CORS errors
    if (errorString.includes('cors') || errorString.includes('cross-origin')) {
      return 'There was a connection issue. This might be a temporary problem - please try again in a moment.';
    }
    
    // Authentication errors
    if (errorString.includes('unauthorized') || errorString.includes('401') || errorString.includes('authentication')) {
      return 'I need you to sign in again. Please refresh the page and log back in.';
    }
    
    // Permission errors
    if (errorString.includes('forbidden') || errorString.includes('403') || errorString.includes('permission')) {
      return 'I don\'t have permission to do that. Please check your account settings or try again.';
    }
    
    // Not found errors
    if (errorString.includes('not found') || errorString.includes('404')) {
      if (context?.includes('calendar')) {
        return 'I couldn\'t find that calendar event. It might have already been deleted or the name doesn\'t match exactly.';
      }
      return 'I couldn\'t find what you\'re looking for. Please check the details and try again.';
    }
    
    // Calendar-specific errors
    if (context?.includes('calendar')) {
      if (errorString.includes('token') || errorString.includes('oauth')) {
        return 'Your calendar connection needs to be refreshed. Please reconnect your Google Calendar in settings.';
      }
      if (errorString.includes('invalid') || errorString.includes('malformed')) {
        return 'There was an issue with the calendar details. Please check the date and time format and try again.';
      }
      if (errorString.includes('no tokens')) {
        return 'Your Google Calendar isn\'t connected yet. Please connect it in settings first.';
      }
    }
    
    // API/rate limit errors
    if (errorString.includes('rate limit') || errorString.includes('429') || errorString.includes('too many')) {
      return 'I\'m getting too many requests right now. Please wait a moment and try again.';
    }
    
    // Server errors
    if (errorString.includes('500') || errorString.includes('internal server')) {
      return 'Something went wrong on my end. Please try again in a moment.';
    }
    
    // Timeout errors
    if (errorString.includes('timeout') || errorString.includes('timed out')) {
      return 'The request took too long. Please try again.';
    }
    
    // Generic fallback - make it friendly
    if (errorString.includes('error') || errorString.includes('failed')) {
      return 'I ran into an issue completing that request. Please try again, or let me know if the problem continues.';
    }
    
    // Default friendly message
    return 'Something unexpected happened. Please try again, and if the problem continues, let me know what you were trying to do.';
  };

  // Helper function to inject error message into conversation for AI to respond naturally
  const injectErrorMessage = async (error: any, context?: string) => {
    const naturalError = convertErrorToNaturalLanguage(error, context);
    
    try {
      await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            sessionId: sessionId,
            dataType: 'error',
            data: { 
              error: true,
              message: naturalError,
              technicalDetails: error?.message || String(error)
            }
          })
        }
      );
    } catch (injectError) {
      console.error('Failed to inject error message:', injectError);
    }
  };

  // Intelligent data injection based on conversation context
  const injectRelevantDataByIntent = async (intent: { category: string; confidence: number; entities?: any }) => {
    // Only inject if confidence is high enough and user is authenticated
    if (intent.confidence < 0.7 || !userId) {
      if (!userId) {
        console.log('User not authenticated, skipping data injection');
      } else {
        console.log(`Intent confidence too low (${intent.confidence}), skipping data injection`);
      }
      return;
    }
  
    try {
      // Handle event creation
      if (intent.category === 'calendar' && intent.entities?.action === 'create') {
        const { title, date, time, location } = intent.entities;
        
        if (title) {
          console.log('📅 Creating calendar event:', { title, date, time, location });
          
          const startTime = parseDateTime(date, time);
          if (!startTime) {
            console.error('Could not parse date/time for event creation');
            return;
          }
          
          // Default to 1 hour duration if no end time
          const endTime = new Date(new Date(startTime).getTime() + 60 * 60 * 1000).toISOString();
          
          try {
            const createResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events/create`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${publicAnonKey}`
                },
                body: JSON.stringify({
                  userId: userId,
                  title: title,
                  startTime: startTime,
                  endTime: endTime,
                  description: '',
                  location: location || ''
                })
              }
            );
            
            const createData = await createResponse.json();
            
            if (createData.success) {
              console.log('✅ Event created successfully:', createData.event);
              
              // Inject success message into conversation
              await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                  },
                  body: JSON.stringify({
                    sessionId: sessionId,
                    dataType: 'calendar',
                    data: { 
                      eventCreated: true,
                      event: createData.event,
                      message: `Event "${title}" has been created in your Google Calendar.`
                    }
                  })
                }
              );
            } else {
              console.error('Failed to create event:', createData.error);
              await injectErrorMessage(createData.error, 'calendar create');
            }
          } catch (error) {
            console.error('Error creating calendar event:', error);
            await injectErrorMessage(error, 'calendar create');
          }
        }
        return; // Don't fetch events if we're creating one
      }
      
      // Handle event deletion
      if (intent.category === 'calendar' && (intent.entities?.action === 'delete' || intent.entities?.action === 'remove')) {
        const { title } = intent.entities;
        
        if (title) {
          console.log('🗑️ Deleting calendar event:', { title });
          
          try {
            // First, search for the event by title
            const searchResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events/search?title=${encodeURIComponent(title)}&userId=${userId}`,
              {
                headers: {
                  'Authorization': `Bearer ${publicAnonKey}`
                }
              }
            );
            
            const searchData = await searchResponse.json();
            
            if (searchData.events && searchData.events.length > 0) {
              // Use the first matching event (most recent or closest match)
              const eventToDelete = searchData.events[0];
              console.log('📅 Found event to delete:', eventToDelete);
              
              // Delete the event
              const deleteResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events/${eventToDelete.id}?userId=${userId}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Authorization': `Bearer ${publicAnonKey}`
                  }
                }
              );
              
              const deleteData = await deleteResponse.json();
              
              if (deleteData.success) {
                console.log('✅ Event deleted successfully:', eventToDelete.title);
                
                // Inject success message into conversation
                await fetch(
                  `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${publicAnonKey}`
                    },
                    body: JSON.stringify({
                      sessionId: sessionId,
                      dataType: 'calendar',
                      data: { 
                        eventDeleted: true,
                        event: eventToDelete,
                        message: `Event "${title}" has been deleted from your Google Calendar.`
                      }
                    })
                  }
                );
              } else {
                console.error('Failed to delete event:', deleteData.error);
              }
            } else {
              console.log('No matching event found to delete');
              // Still inject a message so the AI can respond
              await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                  },
                  body: JSON.stringify({
                    sessionId: sessionId,
                    dataType: 'calendar',
                    data: { 
                      eventDeleted: false,
                      message: `Could not find an event matching "${title}" in your calendar.`
                    }
                  })
                }
              );
            }
          } catch (error) {
            console.error('Error deleting calendar event:', error);
          }
        }
        return; // Don't fetch events if we're deleting one
      }
      
      // Handle event updates/adjustments
      if (intent.category === 'calendar' && (intent.entities?.action === 'update' || intent.entities?.action === 'adjust')) {
        const { title, date, time, oldTime, oldDate } = intent.entities;
        
        if (title) {
          console.log('🔄 Updating calendar event:', { title, date, time, oldTime, oldDate });
          
          try {
            // First, search for the event by title
            const searchResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events/search?title=${encodeURIComponent(title)}&userId=${userId}`,
              {
                headers: {
                  'Authorization': `Bearer ${publicAnonKey}`
                }
              }
            );
            
            const searchData = await searchResponse.json();
            
            if (searchData.events && searchData.events.length > 0) {
              // Use the first matching event
              const eventToUpdate = searchData.events[0];
              console.log('📅 Found event to update:', eventToUpdate);
              
              // Parse the new date/time
              const existingStartDate = new Date(eventToUpdate.start);
              const existingEndDate = new Date(eventToUpdate.end);
              const duration = existingEndDate.getTime() - existingStartDate.getTime();
              
              let newStartTime = eventToUpdate.start; // Default to current start time
              let newEndTime = eventToUpdate.end; // Default to current end time
              
              // If both date and time are provided, parse them together
              if (date && time) {
                const parsedDateTime = parseDateTime(date, time);
                if (parsedDateTime) {
                  newStartTime = parsedDateTime;
                  newEndTime = new Date(new Date(parsedDateTime).getTime() + duration).toISOString();
                }
              } else if (time) {
                // Only time is being updated - preserve the existing date
                const timeStr = time;
                const timeLower = timeStr.toLowerCase().replace(/\s/g, '');
                let hours = 12;
                let minutes = 0;
                
                // Parse time (e.g., "11am", "2pm", "3:30pm")
                const pmMatch = timeLower.match(/(\d{1,2}):?(\d{2})?pm/);
                const amMatch = timeLower.match(/(\d{1,2}):?(\d{2})?am/);
                
                if (pmMatch) {
                  hours = parseInt(pmMatch[1]);
                  minutes = pmMatch[2] ? parseInt(pmMatch[2]) : 0;
                  if (hours !== 12) hours += 12;
                } else if (amMatch) {
                  hours = parseInt(amMatch[1]);
                  minutes = amMatch[2] ? parseInt(amMatch[2]) : 0;
                  if (hours === 12) hours = 0;
                }
                
                // Create new date with updated time but same date
                const updatedDate = new Date(existingStartDate);
                updatedDate.setHours(hours, minutes, 0, 0);
                newStartTime = updatedDate.toISOString();
                
                // Update end time to maintain duration
                const newEndDate = new Date(updatedDate.getTime() + duration);
                newEndTime = newEndDate.toISOString();
              } else if (date) {
                // Only date is being updated - preserve the existing time
                const parsedDate = parseDateTime(date, null);
                if (parsedDate) {
                  // Extract time from existing event
                  const existingHours = existingStartDate.getHours();
                  const existingMinutes = existingStartDate.getMinutes();
                  
                  // Apply existing time to new date
                  const newDate = new Date(parsedDate);
                  newDate.setHours(existingHours, existingMinutes, 0, 0);
                  newStartTime = newDate.toISOString();
                  
                  // Update end time to maintain duration
                  const newEndDate = new Date(newDate.getTime() + duration);
                  newEndTime = newEndDate.toISOString();
                }
              }
              
              // Update the event
              const updateResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events/${eventToUpdate.id}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                  },
                  body: JSON.stringify({
                    userId: userId,
                    startTime: newStartTime,
                    endTime: newEndTime
                  })
                }
              );
              
              const updateData = await updateResponse.json();
              
              if (updateData.success) {
                console.log('✅ Event updated successfully:', updateData.event);
                
                // Inject success message into conversation
                await fetch(
                  `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${publicAnonKey}`
                    },
                    body: JSON.stringify({
                      sessionId: sessionId,
                      dataType: 'calendar',
                      data: { 
                        eventUpdated: true,
                        event: updateData.event,
                        message: `Event "${title}" has been updated in your Google Calendar.`
                      }
                    })
                  }
                );
              } else {
                console.error('Failed to update event:', updateData.error);
                await injectErrorMessage(updateData.error, 'calendar update');
              }
            } else {
              console.log('No matching event found to update');
              // Still inject a message so the AI can respond
              await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                  },
                  body: JSON.stringify({
                    sessionId: sessionId,
                    dataType: 'calendar',
                    data: { 
                      eventUpdated: false,
                      message: `Could not find an event matching "${title}" in your calendar.`
                    }
                  })
                }
              );
            }
          } catch (error) {
            console.error('Error updating calendar event:', error);
            await injectErrorMessage(error, 'calendar update');
          }
        }
        return; // Don't fetch events if we're updating one
      }
      
      // Market data injection
      if (intent.category === 'market') {
        try {
          const marketResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/comprehensive-market-update`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`
              }
            }
          );
          
          if (!marketResponse.ok) {
            throw new Error(`Market data fetch failed: ${marketResponse.status}`);
          }
          
          const marketData = await marketResponse.json();
          
          if (marketData.success) {
            await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${publicAnonKey}`
                },
                body: JSON.stringify({
                  sessionId: sessionId,
                  dataType: 'market-data',
                  data: marketData.data
                })
              }
            );
          } else {
            await injectErrorMessage(marketData.error || 'Failed to fetch market data', 'market data');
          }
        } catch (error) {
          console.error('Error fetching market data:', error);
          await injectErrorMessage(error, 'market data');
        }
      }
  
      // Calendar/schedule data injection (only if not creating an event)
      if (intent.category === 'calendar' && intent.entities?.action !== 'create') {
        try {
          console.log('📅 Checking calendar connection status...');
          // Check if calendar is connected (use logged-in user's ID)
          const statusResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/status?userId=${userId}`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`
              }
            }
          );
          const statusData = await statusResponse.json();
          console.log('📅 Calendar status check result:', statusData);
          
          // Try to fetch events regardless of status (in case status check is stale)
          // If it fails, we'll handle the error
          console.log('📅 Attempting to fetch calendar events...');
          const eventsResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events?userId=${userId}`,
            {
              headers: {
                'Authorization': `Bearer ${publicAnonKey}`
              }
            }
          );
          const eventsData = await eventsResponse.json();
          console.log('📅 Calendar events response:', eventsData);
          
          // Check if we got events or an error
          if (eventsData.events !== undefined && !eventsData.error) {
            // Successfully fetched events (even if empty)
            console.log('📅 Successfully fetched calendar events');
            
            if (eventsData.events && eventsData.events.length > 0) {
              console.log(`📅 Found ${eventsData.events.length} calendar events`);
              // Format events by day of week for AI readability
              const eventsByDay: { [key: string]: string[] } = {};
              
              eventsData.events.forEach((event: any) => {
                const eventDate = new Date(event.start);
                const dayName = eventDate.toLocaleDateString('en-US', { weekday: 'short' });
                const time = eventDate.toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                });
                
                if (!eventsByDay[dayName]) {
                  eventsByDay[dayName] = [];
                }
                eventsByDay[dayName].push(`${event.summary} at ${time}`);
              });
              
              // Format as "Day: Event1, Event2" for each day
              const formattedEvents = Object.entries(eventsByDay).map(([day, events]) => {
                return `${day}: ${events.join(', ')}`;
              });
              
              // Convert to format for AI
              const calendarData = {
                events: formattedEvents,
                rawEvents: eventsData.events.map((e: any) => ({
                  title: e.summary,
                  start: e.start,
                  end: e.end,
                  location: e.location
                })),
                summary: `Calendar events for this week: ${formattedEvents.join('; ')}`
              };
              
              await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                  },
                  body: JSON.stringify({
                    sessionId: sessionId,
                    dataType: 'calendar',
                    data: calendarData
                  })
                }
              );
            } else {
              console.log('📅 No events found in calendar (empty or no events)');
              // No events found - inject empty calendar
              await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${publicAnonKey}`
                  },
                  body: JSON.stringify({
                    sessionId: sessionId,
                    dataType: 'calendar',
                    data: { events: [], message: 'No events found in calendar for this week' }
                  })
                }
              );
            }
          } else if (eventsData.error) {
            // Error fetching events - likely not connected
            console.log('📅 Error fetching calendar events:', eventsData.error);
            // Calendar not connected or error - let AI know
            await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${publicAnonKey}`
                },
                body: JSON.stringify({
                  sessionId: sessionId,
                  dataType: 'calendar',
                  data: { message: 'Google Calendar is not connected. Please connect it in settings to view calendar events.' }
                })
              }
            );
          }
        } catch (error) {
          console.error('Error fetching calendar data:', error);
          // Continue without calendar data - don't block the conversation
        }
      }
  
      // Financial data injection (for both 'financial' and 'spending' categories)
      if (intent.category === 'financial' || intent.category === 'spending') {
        console.log(`[Financial Data] Injecting financial data for category: ${intent.category}`);
        try {
          // Fetch real financial data from connected bank accounts
          const financialData: any = {
            linkedAccounts: [],
            balances: [],
            recentTransactions: [],
            summary: {
              totalBalance: 0,
              accountCount: 0,
              transactionCount: 0
            }
          };

          if (userId && userId !== 'default') {
            console.log(`[Financial Data] Fetching data for userId: ${userId}`);
            // Fetch linked accounts
            try {
              const accountsResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/accounts?userId=${userId}`,
                {
                  headers: {
                    'Authorization': `Bearer ${publicAnonKey}`
                  }
                }
              );
              const accountsData = await accountsResponse.json();
              console.log(`[Financial Data] Accounts response:`, accountsData);
              if (accountsData.success && accountsData.accounts) {
                financialData.linkedAccounts = accountsData.accounts.map((acc: any) => ({
                  id: acc.id,
                  name: acc.display_name,
                  institution: acc.institution_name,
                  type: acc.category,
                  subcategory: acc.subcategory,
                  lastFour: acc.last_four_digits,
                  partnerRole: acc.partner_role,
                  connectionState: acc.connection_state
                }));
                financialData.summary.accountCount = accountsData.accounts.length;
                console.log(`[Financial Data] Found ${accountsData.accounts.length} linked accounts`);
              } else {
                console.log(`[Financial Data] No accounts found or request failed`);
              }
            } catch (error) {
              console.error('Error fetching accounts:', error);
            }

            // Fetch balances (backend may refresh from Stripe if older than 15 min)
            try {
              const balancesResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/balances?userId=${userId}&refreshIfOlderThanMinutes=15`,
                {
                  headers: {
                    'Authorization': `Bearer ${publicAnonKey}`
                  }
                }
              );
              const balancesData = await balancesResponse.json();
              console.log(`[Financial Data] Balances response:`, balancesData);
              if (balancesData.success && balancesData.balances) {
                financialData.balances = balancesData.balances.map((bal: any) => {
                  const account = bal.linked_accounts || bal;
                  const currentBalance = bal.current_balance_cents ? (bal.current_balance_cents / 100) : 0;
                  const availableBalance = bal.available_balance_cents ? (bal.available_balance_cents / 100) : null;
                  
                  // For savings accounts or when current is 0, use available as the primary balance
                  const accountType = account.subcategory || account.category || 'unknown';
                  const isSavings = accountType.toLowerCase().includes('savings');
                  const primaryBalance = (currentBalance > 0 && !isSavings) ? currentBalance : (availableBalance || currentBalance);
                  
                  if (primaryBalance > 0) {
                    financialData.summary.totalBalance += primaryBalance;
                  }
                  
                  return {
                    accountName: account.display_name || account.name,
                    institution: account.institution_name || account.institution,
                    accountType: accountType,
                    isSavings: isSavings,
                    currentBalance: currentBalance,
                    availableBalance: availableBalance,
                    balance: primaryBalance, // Add this as the primary balance to use
                    currency: bal.currency_code || 'USD',
                    asOf: bal.as_of_timestamp || bal.created_at
                  };
                });
                console.log(`[Financial Data] Found ${balancesData.balances.length} balance records`);
              } else {
                console.log(`[Financial Data] No balances found or request failed`);
              }
            } catch (error) {
              console.error('Error fetching balances:', error);
            }

            // Fetch recent transactions
            try {
              const transactionsResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/transactions?userId=${userId}&limit=20`,
                {
                  headers: {
                    'Authorization': `Bearer ${publicAnonKey}`
                  }
                }
              );
              const transactionsData = await transactionsResponse.json();
              console.log(`[Financial Data] Transactions response:`, transactionsData);
              if (transactionsData.success && transactionsData.transactions) {
                financialData.recentTransactions = transactionsData.transactions.map((txn: any) => {
                  const account = txn.linked_accounts || {};
                  return {
                    id: txn.id,
                    accountName: account.display_name || account.name,
                    institution: account.institution_name || account.institution,
                    amount: txn.amount_cents ? (txn.amount_cents / 100) : 0,
                    description: txn.description,
                    merchant: txn.merchant_name,
                    date: txn.transaction_date,
                    isPending: txn.is_pending,
                    category: txn.category_hierarchy || []
                  };
                });
                financialData.summary.transactionCount = transactionsData.transactions.length;
                console.log(`[Financial Data] Found ${transactionsData.transactions.length} transactions`);
              } else {
                console.log(`[Financial Data] No transactions found or request failed`);
              }
            } catch (error) {
              console.error('Error fetching transactions:', error);
            }
          }

          // Format summary for AI
          financialData.summary.totalBalance = Math.round(financialData.summary.totalBalance * 100) / 100;

          console.log(`[Financial Data] Summary:`, financialData.summary);
          console.log(`[Financial Data] Injecting data with ${financialData.linkedAccounts.length} accounts, ${financialData.balances.length} balances, ${financialData.recentTransactions.length} transactions`);

          // Inject real financial data into conversation
          const injectResponse = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/inject-data`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${publicAnonKey}`
              },
              body: JSON.stringify({
                sessionId: sessionId,
                dataType: 'financial-accounts',
                data: financialData
              })
            }
          );
          const injectResult = await injectResponse.json();
          console.log(`[Financial Data] Injection result:`, injectResult);
        } catch (error) {
          console.error('Error fetching financial data:', error);
          // Continue without financial data - don't block the conversation
        }
      }
    } catch (error) {
      console.error('Error injecting data by intent:', error);
      await injectErrorMessage(error, 'data injection');
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
  
    const userMessage: Message = {
      id: generateMessageId(),
      sender: 'you',
      text: inputText,
      timestamp: new Date()
    };
  
    setMessages(prev => [...prev, userMessage]);
    const messageText = inputText; // Save before clearing
    setInputText('');
    setIsTyping(true);
  
    try {
      // Step 1: Categorize intent
      console.log('Categorizing intent for:', messageText);
      let intent = { category: 'general', confidence: 0.5, entities: {} };
      
      try {
        const categorizeResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat/categorize`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({
              message: messageText
            })
          }
        );
    
        if (!categorizeResponse.ok) {
          throw new Error(`Categorization failed: ${categorizeResponse.status}`);
        }
    
        const categorizeData = await categorizeResponse.json();
        
        if (categorizeData.success && categorizeData.intent) {
          intent = categorizeData.intent;
          console.log('Intent categorized:', intent);
        } else {
          console.warn('Categorization failed, using fallback:', categorizeData);
        }
      } catch (error) {
        console.error('Error categorizing intent:', error);
        await injectErrorMessage(error, 'intent categorization');
      }
  
      // Step 2: Route based on category and inject relevant data
      await injectRelevantDataByIntent(intent);
  
      // Step 3: Get AI response (with injected data)
      let response;
      let data;
      
      try {
        response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/chat`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${publicAnonKey}`
            },
            body: JSON.stringify({
              message: messageText,
              sessionId: sessionId,
              intent: intent, // Pass intent to backend for logging/analytics
              userId: userId ?? undefined,
              calendarRange: '1w'
            })
          }
        );
    
        if (!response.ok) {
          throw new Error(`Chat request failed: ${response.status}`);
        }
    
        data = await response.json();
        
        console.log('=== GROK API RESPONSE DEBUG ===');
        console.log('Status:', response.status);
        console.log('Success:', data.success);
        console.log('Response:', data);
        console.log('Intent used:', intent);
        console.log('==============================');
    
        if (data.success) {
          const aiMessage: Message = {
            id: generateMessageId(),
            sender: 'ai',
            text: data.response,
            timestamp: new Date(),
            ...(USE_CALENDAR_IMAGE && data.calendarImageUrl ? { imageUrl: data.calendarImageUrl } : {}),
            ...(USE_CALENDAR_IMAGE && data.calendarImageUrls?.length ? { imageUrls: data.calendarImageUrls } : {})
          };
          setMessages(prev => [...prev, aiMessage]);
        } else {
          console.error('API Error:', data.error);
          await injectErrorMessage(data.error, 'chat response');
          // Still show a message to the user
          const errorMessage: Message = {
            id: generateMessageId(),
            sender: 'ai',
            text: convertErrorToNaturalLanguage(data.error, 'chat response'),
            timestamp: new Date()
          };
          setMessages(prev => [...prev, errorMessage]);
        }
      } catch (error) {
        console.error('Error getting AI response:', error);
        await injectErrorMessage(error, 'chat request');
        throw error; // Re-throw to be caught by outer catch
      }
    } catch (error) {
      console.error('=== FETCH ERROR ===');
      console.error('Error details:', error);
      console.error('===================');
      
      // Inject error message for AI to respond naturally
      await injectErrorMessage(error, 'chat request');
      
      // Still show a message to the user immediately
      const errorMessage: Message = {
        id: generateMessageId(),
        sender: 'ai',
        text: convertErrorToNaturalLanguage(error, 'chat request'),
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const testGrokModels = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/test-grok`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const data = await response.json();
      setDebugInfo(data);
      setShowDebug(true);
      console.log('Grok Model Test Results:', data);
    } catch (error) {
      console.error('Error testing Grok models:', error);
      setDebugInfo({ error: String(error) });
      setShowDebug(true);
    }
  };

  // Token in URL (e.g. from email reset link) always shows Reset Password page
  const tokenFromUrl =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token')
      : null;
  const effectiveResetToken = tokenFromUrl || resetToken;

  if (isCheckingAuth && !effectiveResetToken) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Email reset link: show Reset Password and then update Supabase for that account
  if (effectiveResetToken) {
    return (
      <ResetPassword
        token={effectiveResetToken}
        onDone={() => {
          setResetToken(null);
          window.history.replaceState({}, '', window.location.pathname || '/');
        }}
      />
    );
  }

  // Partner invite link should route into partner signup, even if logged out.
  const inviteTokenFromUrl =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('partnerInviteToken')
      : null;
  const effectivePartnerInviteToken = inviteTokenFromUrl || partnerInviteToken;

  if (effectivePartnerInviteToken && !isAuthenticated) {
    return (
      <PartnerSignup
        token={effectivePartnerInviteToken}
        onAccepted={(token, uid, usr) => {
          setPartnerInviteToken(null);
          window.history.replaceState({}, '', window.location.pathname || '/');
          handleLogin(token, uid, usr);
        }}
      />
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }
  
  if (currentPage === 'chat') {
    return (
      <div className="flex flex-col h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-gray-900 dark:text-gray-100">Homebase Dev Chat</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentPage('settings')}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <Settings className="w-5 h-5" />
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* Messages */}
        <main className="flex-1 overflow-y-auto px-4 py-3">
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </main>

        {/* Input */}
        <footer className="border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-400 dark:focus:ring-blue-400"
            />
            <button
              onClick={handleSend}
              className="flex items-center justify-center rounded-full bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
              disabled={!inputText.trim()}
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </footer>
      </div>
    );
  }

  if (currentPage === 'partnerSignup' && effectivePartnerInviteToken) {
    return (
      <PartnerSignup
        token={effectivePartnerInviteToken}
        onAccepted={(token, uid, usr) => {
          setPartnerInviteToken(null);
          window.history.replaceState({}, '', window.location.pathname || '/');
          handleLogin(token, uid, usr);
        }}
      />
    );
  }

  if (currentPage === 'onboarding') {
    if (!sessionToken || !userId) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50">
          <div className="text-center text-gray-600 text-sm">Loading onboarding…</div>
        </div>
      );
    }

    return (
      <OnboardingWizard
        sessionToken={sessionToken}
        userId={userId}
        user={user}
        accentColor={accentColor}
        onContinueHomebase={() => setCurrentPage('home')}
        onRefreshUser={refreshUserFromVerify}
        onUiThemeSaved={setTheme}
        onDone={async () => {
          await refreshUserFromVerify();
          setCurrentPage('settings');
        }}
      />
    );
  }
  
  if (currentPage === 'appearance') {
    return (
      <AppearancePage
        onBack={() => setCurrentPage('settings')}
        theme={theme}
        onThemeChange={setTheme}
        accentColor={accentColor}
        onAccentColorChange={setAccentColor}
      />
    );
  }
  
  if (currentPage === 'account') {
    const loggedInAs = (user as any)?.loggedInAs as 'person1' | 'person2' | undefined;
    const loggedInEmail = (user as any)?.loggedInEmail as string | undefined;

    // Prefer explicit loggedInAs from login response. On session restore (verify),
    // fall back to matching stored loggedInEmail against primary/secondary email.
    let activePartner: 'person1' | 'person2' = 'person1';
    if (loggedInAs === 'person1' || loggedInAs === 'person2') {
      activePartner = loggedInAs;
    } else if (loggedInEmail) {
      if (loggedInEmail === user?.secondaryEmail) {
        activePartner = 'person2';
      } else if (loggedInEmail === user?.primaryEmail) {
        activePartner = 'person1';
      }
    }

    const activeFullName =
      activePartner === 'person2'
        ? user?.person2Name ?? user?.person1Name
        : user?.person1Name ?? user?.person2Name;
    const activeEmail =
      activePartner === 'person2'
        ? user?.secondaryEmail ?? user?.primaryEmail
        : user?.primaryEmail ?? user?.secondaryEmail;
    const activePhone =
      activePartner === 'person2'
        ? user?.person2Phone ?? user?.person1Phone
        : user?.person1Phone ?? user?.person2Phone;
    const activeDateOfBirth =
      activePartner === 'person2' ? user?.person2DateOfBirth : user?.person1DateOfBirth;
    const activeLocation =
      activePartner === 'person2' ? user?.person2Location : user?.person1Location;
    const activeAvatarUrl =
      activePartner === 'person2' ? user?.person2AvatarUrl : user?.person1AvatarUrl;

    return (
      <AccountPage
        onBack={() => setCurrentPage('settings')}
        theme={theme}
        accentColor={accentColor}
        loggedInAs={activePartner}
        user={{
          fullName: activeFullName,
          email: activeEmail,
          phone: activePhone,
          dateOfBirth: activeDateOfBirth,
          location: activeLocation,
          avatarUrl: activeAvatarUrl,
        }}
        sessionToken={sessionToken}
        onUserUpdate={(updates) => {
          setUser((prev: any) => {
            const next = { ...prev };
            if (activePartner === 'person1') {
              if (updates.fullName !== undefined) next.person1Name = updates.fullName;
              if (updates.dateOfBirth !== undefined) next.person1DateOfBirth = updates.dateOfBirth;
              if (updates.location !== undefined) next.person1Location = updates.location;
              if (updates.avatarUrl !== undefined) next.person1AvatarUrl = updates.avatarUrl;
            } else {
              if (updates.fullName !== undefined) next.person2Name = updates.fullName;
              if (updates.dateOfBirth !== undefined) next.person2DateOfBirth = updates.dateOfBirth;
              if (updates.location !== undefined) next.person2Location = updates.location;
              if (updates.avatarUrl !== undefined) next.person2AvatarUrl = updates.avatarUrl;
            }
            return next;
          });
        }}
        showPartnerEmailEditor={activePartner === 'person1'}
        partnerEmail={user?.secondaryEmail ?? ''}
        onPartnerEmailSaved={(u) => {
          setUser((prev: any) => ({
            ...prev,
            secondaryEmail: u.secondaryEmail ?? '',
            person1Name: u.person1Name ?? prev?.person1Name,
            person2Name: u.person2Name ?? prev?.person2Name,
            relationshipName: u.relationshipName ?? prev?.relationshipName,
          }));
          if (u.secondaryEmail) {
            localStorage.setItem('secondaryEmail', u.secondaryEmail);
          } else {
            localStorage.removeItem('secondaryEmail');
          }
        }}
      />
    );
  }
  
  if (currentPage === 'connections') {
    return (
      <>
        <ConnectionsPage
          onBack={() => setCurrentPage('settings')}
          theme={theme}
          accentColor={accentColor}
          userId={userId}
          primaryEmail={user?.primaryEmail ?? null}
          secondaryEmail={user?.secondaryEmail ?? null}
          person1Name={user?.person1Name}
          person2Name={user?.person2Name}
          person1Phone={user?.person1Phone ?? null}
          person2Phone={user?.person2Phone ?? null}
          sessionToken={sessionToken}
          onOpenIntegrations={() => setShowCalendar(true)}
        />

        {showCalendar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <CalendarIntegration
              userId={userId ?? 'default'}
              person1Name={user?.person1Name}
              person2Name={user?.person2Name}
              sessionToken={sessionToken}
              person1Phone={user?.person1Phone}
              person2Phone={user?.person2Phone}
              onClose={() => setShowCalendar(false)}
            />
          </div>
        )}
      </>
    );
  }
  
  if (currentPage === 'settings') {
    return (
      <SettingsPage
        onBack={() => setCurrentPage('home')}
        onConnectionsClick={() => setCurrentPage('connections')}
        onAccountClick={() => setCurrentPage('account')}
        onAppearanceClick={() => setCurrentPage('appearance')}
        theme={theme}
        accentColor={accentColor}
        onLogout={handleLogout}
      />
    );
  }
  
  return (
    <OptionC
      onSettingsClick={() => setCurrentPage('settings')}
      theme={theme}
      accentColor={accentColor}
    />
  );
}