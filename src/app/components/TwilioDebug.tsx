import React, { useState, useEffect } from 'react';
import { projectId, publicAnonKey } from '/utils/supabase/info';

interface TwilioDebugProps {
  onClose?: () => void;
}

export function TwilioDebug({ onClose, onOpenCalendarSettings }: TwilioDebugProps) {
  const [config, setConfig] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkConfig();
  }, []);

  const checkConfig = async () => {
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/test`,
        {
          headers: {
            'Authorization': `Bearer ${publicAnonKey}`
          }
        }
      );
      const data = await response.json();
      setConfig(data);
    } catch (error) {
      console.error('Error checking config:', error);
      setConfig({ error: String(error) });
    }
  };

  const testWebhook = async () => {
    setLoading(true);
    setTestResult(null);

    try {
      // Simulate what Twilio sends
      const formData = new URLSearchParams({
        From: '+15555551234',
        To: config.fromNumber || '+10000000000',
        Body: 'Test message',
        MessageSid: 'TEST123456789',
      });

      console.log('Testing webhook with:', formData.toString());

      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // Note: Not including Authorization header to simulate Twilio
          },
          body: formData.toString(),
        }
      );

      const text = await response.text();
      
      setTestResult({
        status: response.status,
        statusText: response.statusText,
        response: text,
        success: response.ok
      });
    } catch (error) {
      setTestResult({
        error: String(error)
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="text-center mb-6">
        <h2 className="text-3xl font-bold mb-3">📱 Text Homebase</h2>
        <p className="text-gray-600 text-lg">
          Start chatting with Homebase via text message!
        </p>
      </div>

      {/* Quick Start - MOVED TO TOP AND MADE MORE PROMINENT */}
      <div className="mb-6 p-5 bg-gradient-to-r from-green-500 to-green-600 rounded-xl shadow-lg border-2 border-green-400">
        <h3 className="text-xl font-bold text-white mb-3">⚠️ First: Add Your Phone Number</h3>
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 mb-4">
          <p className="text-white text-sm font-medium mb-3">
            Before you can text Homebase, you need to add your phone number so it can recognize you.
          </p>
          {onOpenCalendarSettings ? (
            <button
              onClick={onOpenCalendarSettings}
              className="bg-white text-green-600 px-6 py-3 rounded-lg font-bold hover:bg-green-50 transition-colors shadow-lg text-base w-full"
            >
              📱 Open Calendar Settings to Add Phone Number
            </button>
          ) : (
            <p className="text-white text-sm">
              Click the <strong>⚙️ Settings</strong> button (blue icon) in the top-right corner, then scroll down to the <strong>"SMS Texting"</strong> section
            </p>
          )}
        </div>
        <p className="text-green-100 text-xs text-center">
          Once your phone number is added, come back here to see the number to text!
        </p>
      </div>

      {/* Phone Number - MOVED AFTER SETUP INSTRUCTIONS */}
      <div className="mb-8">
        <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-xl text-center shadow-lg">
          <p className="text-white text-sm font-medium mb-2">Then text Homebase at:</p>
          <p className="text-4xl font-bold text-white mb-3">+18446707482</p>
          <p className="text-blue-100 text-sm">
            Make sure you've added your phone number in Settings first!
          </p>
        </div>
      </div>

      {/* Example Texts */}
      <div className="mb-6">
        <h3 className="text-xl font-semibold mb-4 text-gray-900">Try These Examples:</h3>
        <div className="space-y-3">
          <div className="bg-gray-50 border-l-4 border-blue-500 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2 font-medium">📅 Calendar</p>
            <p className="text-gray-800 font-mono text-sm">"What's my schedule this week?"</p>
            <p className="text-gray-800 font-mono text-sm">"Add dentist appointment tomorrow at 2pm"</p>
            <p className="text-gray-800 font-mono text-sm">"Show me Owen's calendar"</p>
          </div>
          
          <div className="bg-gray-50 border-l-4 border-green-500 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2 font-medium">💬 General Chat</p>
            <p className="text-gray-800 font-mono text-sm">"Hey, what's up?"</p>
            <p className="text-gray-800 font-mono text-sm">"What did I learn this week?"</p>
            <p className="text-gray-800 font-mono text-sm">"Help me plan my week"</p>
          </div>
          
          <div className="bg-gray-50 border-l-4 border-purple-500 p-4 rounded-lg">
            <p className="text-sm text-gray-600 mb-2 font-medium">✏️ Event Management</p>
            <p className="text-gray-800 font-mono text-sm">"Remove the gym from my schedule"</p>
            <p className="text-gray-800 font-mono text-sm">"Change my meeting to 3pm"</p>
            <p className="text-gray-800 font-mono text-sm">"What's on Lila's calendar?"</p>
          </div>
        </div>
      </div>

        {/* Advanced Settings - Collapsible */}
        <details className="mb-6">
          <summary className="cursor-pointer text-sm font-semibold text-gray-600 hover:text-gray-900 mb-3">
            ⚙️ Advanced Settings (for developers)
          </summary>
          
          <div className="mt-4 space-y-4">
            {/* Configuration Status */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-gray-700">Configuration Status</h4>
              <div className="bg-gray-100 p-4 rounded-lg">
                {config ? (
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(config, null, 2)}
                  </pre>
                ) : (
                  <p className="text-gray-500 text-sm">Loading...</p>
                )}
              </div>
              
              {config && !config.configured && (
                <div className="mt-4 p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700">
                  <p className="font-semibold text-sm">⚠️ Twilio Not Configured</p>
                  <p className="text-xs mt-1">
                    You need to add these environment variables in Supabase:
                  </p>
                  <ul className="text-xs mt-2 ml-4 list-disc">
                    {!config.accountSidSet && <li>TWILIO_ACCOUNT_SID</li>}
                    {!config.authTokenSet && <li>TWILIO_AUTH_TOKEN</li>}
                    {!config.fromNumberSet && <li>TWILIO_FROM_NUMBER</li>}
                  </ul>
                </div>
              )}
            </div>

            {/* Webhook Information */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-gray-700">Webhook URL</h4>
              <div className="bg-gray-100 p-4 rounded-lg">
                <code className="text-xs break-all">
                  https://{projectId}.supabase.co/functions/v1/make-server-8c22500c/sms/twilio/incoming
                </code>
              </div>
            </div>

            {/* Test Webhook */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-gray-700">Test Webhook</h4>
              <button
                onClick={testWebhook}
                disabled={loading || !config?.configured}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {loading ? 'Testing...' : 'Send Test Request'}
              </button>
              
              {testResult && (
                <div className="mt-4 bg-gray-100 p-4 rounded-lg">
                  <p className="font-semibold mb-2 text-sm">Test Result:</p>
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                  
                  {testResult.status === 401 && (
                    <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-400 text-red-700">
                      <p className="font-semibold text-sm">❌ 401 Unauthorized</p>
                      <p className="text-xs mt-1">
                        The webhook is being blocked by Supabase authentication.
                      </p>
                    </div>
                  )}
                  
                  {testResult.status === 200 && (
                    <div className="mt-4 p-4 bg-green-50 border-l-4 border-green-400 text-green-700">
                      <p className="font-semibold text-sm">✅ Success!</p>
                      <p className="text-xs mt-1">
                        The webhook is working correctly.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Debug Logs */}
            <div>
              <h4 className="text-sm font-semibold mb-2 text-gray-700">Debug Logs</h4>
              <a
                href={`https://supabase.com/dashboard/project/${projectId}/logs/edge-functions`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline text-sm"
              >
                Open Supabase Edge Function Logs →
              </a>
            </div>
          </div>
        </details>

        <button
          onClick={onClose || (() => window.location.reload())}
          className="w-full bg-gray-200 text-gray-800 px-6 py-2 rounded-lg hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
}