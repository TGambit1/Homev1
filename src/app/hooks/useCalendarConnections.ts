import { useEffect, useState } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
}

export function useCalendarConnections(userId?: string | null) {
  const [person1Connected, setPerson1Connected] = useState(false);
  const [person2Connected, setPerson2Connected] = useState(false);
  const [person1Events, setPerson1Events] = useState<CalendarEvent[]>([]);
  const [person2Events, setPerson2Events] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = async (partnerRole: 'person1' | 'person2') => {
    if (!userId || userId === 'default') return;

    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events?userId=${userId}&partnerRole=${partnerRole}`,
        { headers: { Authorization: `Bearer ${publicAnonKey}` } },
      );
      const data = await res.json();

      if (data.events) {
        if (partnerRole === 'person1') setPerson1Events(data.events);
        else setPerson2Events(data.events);
      }
    } catch (err) {
      console.error(`Error fetching ${partnerRole} events:`, err);
      setError('Failed to fetch calendar events');
    }
  };

  const checkConnectionStatus = async () => {
    if (!userId || userId === 'default') return;

    setLoading(true);
    try {
      const [res1, res2] = await Promise.all([
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/status?userId=${userId}&partnerRole=person1`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } },
        ),
        fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/status?userId=${userId}&partnerRole=person2`,
          { headers: { Authorization: `Bearer ${publicAnonKey}` } },
        ),
      ]);

      const data1 = await res1.json();
      const data2 = await res2.json();

      setPerson1Connected(!!data1.connected);
      setPerson2Connected(!!data2.connected);

      if (data1.connected) fetchEvents('person1');
      if (data2.connected) fetchEvents('person2');
    } catch (err) {
      console.error('Error checking calendar status:', err);
      setError('Failed to check calendar status');
    } finally {
      setLoading(false);
    }
  };

  const connectGoogleCalendar = async (partnerRole: 'person1' | 'person2') => {
    if (!userId || userId === 'default') {
      setError('User ID is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/google-calendar?userId=${userId}&partnerRole=${partnerRole}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        },
      );
      const data = await response.json();

      if (data.authUrl && data.sessionId) {
        const sessionId = data.sessionId;
        console.log(`🔧 Starting OAuth flow for ${partnerRole} with session ID:`, sessionId);

        const width = 600;
        const height = 700;
        const left = window.screen.width / 2 - width / 2;
        const top = window.screen.height / 2 - height / 2;

        const popup = window.open(
          data.authUrl,
          'Google Calendar OAuth',
          `width=${width},height=${height},left=${left},top=${top}`,
        );

        if (!popup) {
          setError('Popup was blocked. Please allow popups for this site.');
          setLoading(false);
          return;
        }

        console.log('🔍 Popup opened, polling for OAuth code...');

        const pollInterval = setInterval(async () => {
          try {
            const pollResponse = await fetch(
              `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/google-callback-poll?sessionId=${sessionId}`,
              {
                headers: {
                  Authorization: `Bearer ${publicAnonKey}`,
                },
              },
            );

            const pollData = await pollResponse.json();
            console.log('Poll result:', pollData);

            if (pollData.status === 'success' && pollData.code) {
              console.log('✅ OAuth code received, exchanging for tokens...');
              clearInterval(pollInterval);

              const callbackResponse = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/auth/google-callback`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${publicAnonKey}`,
                  },
                  body: JSON.stringify({
                    code: pollData.code,
                    userId: userId,
                    partnerRole: partnerRole,
                  }),
                },
              );

              const result = await callbackResponse.json();
              console.log('Token exchange result:', result);

              if (result.success) {
                console.log('⏳ Waiting for token storage to propagate...');
                await new Promise((resolve) => setTimeout(resolve, 2000));

                const verifyResponse = await fetch(
                  `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/status?userId=${userId}&partnerRole=${partnerRole}`,
                  {
                    headers: {
                      Authorization: `Bearer ${publicAnonKey}`,
                    },
                  },
                );
                const verifyData = await verifyResponse.json();
                console.log('🔍 Connection verification:', verifyData);

                if (verifyData.connected) {
                  if (partnerRole === 'person1') {
                    setPerson1Connected(true);
                    fetchEvents('person1');
                  } else {
                    setPerson2Connected(true);
                    fetchEvents('person2');
                  }
                  popup.close();
                  setLoading(false);
                } else {
                  console.log('⏳ Retrying connection verification...');
                  await new Promise((resolve) => setTimeout(resolve, 2000));

                  const retryResponse = await fetch(
                    `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/status?userId=${userId}&partnerRole=${partnerRole}`,
                    {
                      headers: {
                        Authorization: `Bearer ${publicAnonKey}`,
                      },
                    },
                  );
                  const retryData = await retryResponse.json();
                  console.log('🔍 Retry verification:', retryData);

                  if (retryData.connected) {
                    if (partnerRole === 'person1') {
                      setPerson1Connected(true);
                      fetchEvents('person1');
                    } else {
                      setPerson2Connected(true);
                      fetchEvents('person2');
                    }
                    popup.close();
                    setLoading(false);
                  } else {
                    setError('Calendar connected but verification failed. Please try refreshing.');
                    setLoading(false);
                  }
                }
              } else {
                setError(result.error || 'Failed to connect calendar');
                setLoading(false);
              }
            } else if (pollData.status === 'error') {
              console.error('❌ OAuth error:', pollData.error);
              clearInterval(pollInterval);
              setError(pollData.error || 'Authorization failed');
              setLoading(false);
            }
          } catch (err) {
            console.error('Error polling for OAuth code:', err);
          }
        }, 1000);

        setTimeout(() => {
          clearInterval(pollInterval);
          setError('OAuth timeout. Please try again.');
          setLoading(false);
        }, 300000);
      }
    } catch (err) {
      console.error('Error connecting calendar:', err);
      setError('Failed to initiate calendar connection');
      setLoading(false);
    }
  };

  const disconnectCalendar = async (partnerRole: 'person1' | 'person2') => {
    if (!userId || userId === 'default') return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/disconnect?userId=${userId}&partnerRole=${partnerRole}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${publicAnonKey}` },
        },
      );
      const data = await res.json();

      if (data.success) {
        if (partnerRole === 'person1') {
          setPerson1Connected(false);
          setPerson1Events([]);
        } else {
          setPerson2Connected(false);
          setPerson2Events([]);
        }
      } else {
        setError(data.error || 'Failed to disconnect calendar');
      }
    } catch (err: any) {
      console.error('Error disconnecting calendar:', err);
      setError(err.message || 'Failed to disconnect calendar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkConnectionStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  return {
    person1Connected,
    person2Connected,
    person1Events,
    person2Events,
    loading,
    error,
    fetchEvents,
    connectGoogleCalendar,
    disconnectCalendar,
  };
}

