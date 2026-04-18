import { useEffect, useState } from 'react';
import { projectId, publicAnonKey } from '../../../utils/supabase/info';
import { loadStripe } from '@stripe/stripe-js';
import { usePlaidLink } from 'react-plaid-link';

interface FinancialAccount {
  id: string;
  display_name: string;
  institution_name: string;
  last_four_digits?: string | null;
  [key: string]: any;
}

interface BalanceRecord {
  linked_accounts?: { id: string };
  linked_account_id?: string;
  current_balance_cents?: number | null;
  [key: string]: any;
}

export function useFinancialConnections(userId?: string | null) {
  const [linkedAccounts, setLinkedAccounts] = useState<FinancialAccount[]>([]);
  const [balances, setBalances] = useState<BalanceRecord[]>([]);
  const [financialLoading, setFinancialLoading] = useState(false);
  const [financialError, setFinancialError] = useState<string | null>(null);
  const [plaidLinkToken, setPlaidLinkToken] = useState<string | null>(null);
  const [plaidLoading, setPlaidLoading] = useState(false);
  const [snaptradeLoading, setSnaptradeLoading] = useState(false);

  const fetchLinkedAccounts = async () => {
    if (!userId || userId === 'default') return;
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/accounts?userId=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );
      const data = await response.json();
      if (data.success && data.accounts) {
        setLinkedAccounts(data.accounts);
      }
    } catch (err) {
      console.error('Error fetching linked accounts:', err);
    }
  };

  const fetchBalances = async () => {
    if (!userId || userId === 'default') return;
    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/balances?userId=${userId}`,
        {
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
          },
        }
      );
      const data = await response.json();
      if (data.success && data.balances) {
        setBalances(data.balances);
      }
    } catch (err) {
      console.error('Error fetching balances:', err);
    }
  };

  const disconnectBankAccount = async (externalAccountId: string) => {
    if (!userId || userId === 'default') {
      setFinancialError('User ID is required');
      return;
    }

    setFinancialLoading(true);
    setFinancialError(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/disconnect-account`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            accountId: externalAccountId,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      await fetchLinkedAccounts();
      await fetchBalances();
    } catch (err: any) {
      console.error('[FC] Error disconnecting bank account:', err);
      setFinancialError(err.message || 'Failed to disconnect bank account');
    } finally {
      setFinancialLoading(false);
    }
  };

  const connectBankAccount = async (partnerRole: 'person1' | 'person2' = 'person1') => {
    console.log('[FC] connectBankAccount called', { userId, partnerRole });
    if (!userId || userId === 'default') {
      setFinancialError('User ID is required');
      return;
    }

    setFinancialLoading(true);
    setFinancialError(null);

    try {
      console.log('[FC] Creating Stripe Financial Connections session...');
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/stripe-create-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userId,
            partnerRole,
          }),
        }
      );

      console.log('[FC] stripe-create-session response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[FC] stripe-create-session error response:', errorData);
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log('[FC] stripe-create-session payload:', data);

      const stripe = await loadStripe(data.publishableKey);
      if (!stripe) {
        throw new Error('Stripe failed to load');
      }

      const result: any = await stripe.collectFinancialConnectionsAccounts({
        clientSecret: data.clientSecret,
      });

      console.log('[FC] collectFinancialConnectionsAccounts result:', result);

      if (result.error) {
        const code = (result.error as any).code || '';
        // Provide clearer, user-facing error messages for common cases
        if (code === 'user_canceled') {
          setFinancialError('You closed the bank login window before finishing. Please try again and complete the verification with your bank.');
        } else if (code === 'consumer_not_verified' || code === 'verification_failed') {
          setFinancialError('Your bank was unable to verify your identity. Check your banking app for any pending prompts, then try again.');
        } else {
          setFinancialError(result.error.message || 'We could not complete the bank connection. Please try again.');
        }
        return;
      }

      const session = result.financialConnectionsSession;
      const accounts = session?.accounts ?? [];

      if (!accounts.length) {
        console.warn('[FC] No accounts returned from Financial Connections session');
        return;
      }

      const accountIds = accounts.map((acc: any) => acc.id);
      console.log('[FC] Saving Financial Connections accounts to Supabase:', {
        userId,
        partnerRole,
        accountIds,
      });

      const saveResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/stripe-save-accounts`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userId,
            partnerRole,
            accountIds,
          }),
        }
      );

      const saveData = await saveResponse.json();
      console.log('[FC] stripe-save-accounts response:', saveData);

      if (saveData.success) {
        await fetchLinkedAccounts();
        await fetchBalances();
      } else {
        setFinancialError(saveData.error || 'Failed to save accounts');
      }
    } catch (err: any) {
      console.error('[FC] Error connecting bank account:', err);
      setFinancialError(err.message || 'Failed to connect bank account');
    } finally {
      setFinancialLoading(false);
    }
  };

  const { open, ready } = usePlaidLink({
    token: plaidLinkToken || '',
    onSuccess: async (publicToken) => {
      setPlaidLoading(true);
      try {
        const response = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/plaid-exchange-token`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${publicAnonKey}`,
            },
            body: JSON.stringify({
              userId,
              partnerRole: 'person1',
              publicToken,
            }),
          }
        );

        const data = await response.json();
        if (data.success) {
          await fetchLinkedAccounts();
          await fetchBalances();
          setPlaidLinkToken(null);
        } else {
          setFinancialError(data.error || 'Failed to connect account');
        }
      } catch (err: any) {
        console.error('Error exchanging Plaid token:', err);
        setFinancialError(err.message || 'Failed to connect account');
      } finally {
        setPlaidLoading(false);
      }
    },
    onExit: (err) => {
      if (err) {
        console.error('Plaid Link error:', err);
        setFinancialError(err.error_message || 'Connection cancelled');
      }
      setPlaidLinkToken(null);
      setPlaidLoading(false);
    },
  });

  useEffect(() => {
    if (plaidLinkToken && ready) {
      open();
    }
  }, [plaidLinkToken, ready, open]);

  const connectBrokerageAccount = async (partnerRole: 'person1' | 'person2' = 'person1') => {
    if (!userId || userId === 'default') {
      setFinancialError('User ID is required');
      return;
    }
    setSnaptradeLoading(true);
    setFinancialError(null);
    try {
      const redirectUrl = typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : undefined;
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/snaptrade-create-login-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userId,
            partnerRole,
            redirectUrl,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      if (data.success && data.redirectURI) {
        window.location.href = data.redirectURI;
      } else {
        throw new Error('No redirect URL received');
      }
    } catch (err: any) {
      console.error('[FC] Error connecting brokerage account:', err);
      setFinancialError(err.message || 'Failed to connect brokerage account');
      setSnaptradeLoading(false);
    }
  };

  const connectCreditCard = async () => {
    if (!userId || userId === 'default') {
      setFinancialError('User ID is required');
      return;
    }

    setPlaidLoading(true);
    setFinancialError(null);

    try {
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-8c22500c/financial/plaid-create-token`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({
            userId,
            partnerRole: 'person1',
          }),
        }
      );

      const data = await response.json();

      if (data.success && data.link_token) {
        setPlaidLinkToken(data.link_token);
      } else {
        throw new Error(data.error || 'Failed to get Plaid Link token');
      }
    } catch (err: any) {
      console.error('Error connecting credit card:', err);
      setFinancialError(err.message || 'Failed to connect credit card');
      setPlaidLoading(false);
    }
  };

  const formatCurrency = (cents: number | null | undefined) => {
    if (cents == null) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  useEffect(() => {
    fetchLinkedAccounts();
    fetchBalances();
  }, [userId]);

  // Refetch when returning from SnapTrade callback
  useEffect(() => {
    if (typeof window === 'undefined' || !userId || userId === 'default') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('snaptrade') === 'success') {
      fetchLinkedAccounts();
      fetchBalances();
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('snaptrade');
      url.searchParams.delete('count');
      window.history.replaceState({}, '', url.toString());
    }
  }, [userId]);

  return {
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
  };
}

