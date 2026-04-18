import { useState, useEffect } from 'react';
import { Calendar, Clock, MapPin, RefreshCw } from 'lucide-react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';

interface CalendarEvent {
  summary: string;
  start: string;
  end: string;
  location?: string;
}

interface CalendarWidgetProps {
  userId?: string;
  maxEvents?: number;
  compact?: boolean;
}

export function CalendarWidget({ userId = 'default', maxEvents = 5, compact = false }: CalendarWidgetProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    checkStatusAndFetchEvents();
  }, [userId]);

  const checkStatusAndFetchEvents = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check if calendar is connected
      const statusResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/status?userId=${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const statusData = await statusResponse.json();
      setIsConnected(statusData.connected);

      if (statusData.connected) {
        // Fetch events
        const eventsResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/calendar/events?userId=${userId}`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`
            }
          }
        );
        const eventsData = await eventsResponse.json();

        if (eventsData.events) {
          setEvents(eventsData.events.slice(0, maxEvents));
        }
      }
    } catch (err) {
      console.error('Error fetching calendar data:', err);
      setError('Failed to load calendar');
    } finally {
      setIsLoading(false);
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

    if (isToday) return `Today ${timeStr}`;
    if (isTomorrow) return `Tomorrow ${timeStr}`;

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  if (!isConnected) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center gap-2 text-gray-600">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading calendar...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-lg border border-red-200 p-4">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 text-center">
        <Calendar className="w-8 h-8 mx-auto mb-2 text-gray-400" />
        <p className="text-sm text-gray-600">No upcoming events</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <Calendar className="w-4 h-4" />
          Upcoming Events
        </div>
        {events.slice(0, 3).map((event, index) => (
          <div key={index} className="text-sm">
            <div className="font-medium text-gray-900">{event.summary}</div>
            <div className="text-gray-600 text-xs flex items-center gap-1 mt-0.5">
              <Clock className="w-3 h-3" />
              {formatDate(event.start)}
            </div>
          </div>
        ))}
        {events.length > 3 && (
          <div className="text-xs text-gray-500 pt-1">
            +{events.length - 3} more events
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-blue-500" />
          <h3 className="font-semibold text-gray-900">Upcoming Events</h3>
        </div>
        <button
          onClick={checkStatusAndFetchEvents}
          className="text-gray-500 hover:text-gray-700"
          disabled={isLoading}
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-3">
        {events.map((event, index) => (
          <div
            key={index}
            className="border-l-4 border-blue-500 pl-3 py-2"
          >
            <div className="font-medium text-gray-900">{event.summary}</div>
            <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
              <Clock className="w-4 h-4" />
              {formatDate(event.start)}
            </div>
            {event.location && (
              <div className="flex items-center gap-1 text-sm text-gray-600 mt-1">
                <MapPin className="w-4 h-4" />
                {event.location}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
