import { useEffect } from 'react';

export function OAuthCallback() {
  useEffect(() => {
    // Parse the URL for the authorization code
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (code) {
      // Send the code back to the parent window
      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'oauth-callback',
            code: code,
          },
          window.location.origin
        );
      }
    } else if (error) {
      if (window.opener) {
        window.opener.postMessage(
          {
            type: 'oauth-error',
            error: error,
          },
          window.location.origin
        );
      }
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Completing authorization...</p>
        <p className="text-sm text-gray-500 mt-2">You can close this window.</p>
      </div>
    </div>
  );
}
