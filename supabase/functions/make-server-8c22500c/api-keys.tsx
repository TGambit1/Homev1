import { Hono } from "npm:hono";
import * as kv from "./kv_store.tsx";

const app = new Hono();

// Generate a random API key
function generateApiKey(): string {
  const prefix = "hb"; // Homebase prefix
  const randomPart = Array.from({ length: 32 }, () => 
    Math.random().toString(36).charAt(2)
  ).join('');
  return `${prefix}_${randomPart}`;
}

// Create a new API key
app.post("/make-server-8c22500c/api-keys/generate", async (c) => {
  try {
    const body = await c.req.json();
    const { name, description, permissions = ['read', 'write'] } = body;

    if (!name) {
      return c.json({ success: false, error: 'Name is required' }, 400);
    }

    const apiKey = generateApiKey();
    const keyData = {
      key: apiKey,
      name,
      description: description || '',
      permissions,
      createdAt: new Date().toISOString(),
      lastUsed: null,
      active: true,
      usageCount: 0
    };

    // Store the API key
    await kv.set(`apikey:${apiKey}`, keyData);

    // Store in index for listing all keys
    const allKeys = await kv.get('apikey:index') || [];
    allKeys.push(apiKey);
    await kv.set('apikey:index', allKeys);

    console.log(`Generated API key: ${name} (${apiKey})`);

    return c.json({ 
      success: true, 
      apiKey: apiKey,
      name: name,
      createdAt: keyData.createdAt
    });
  } catch (error) {
    console.error('Error generating API key:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Validate an API key
app.post("/make-server-8c22500c/api-keys/validate", async (c) => {
  try {
    const body = await c.req.json();
    const { apiKey } = body;

    if (!apiKey) {
      return c.json({ success: false, error: 'API key is required' }, 400);
    }

    const keyData = await kv.get(`apikey:${apiKey}`);

    if (!keyData) {
      return c.json({ success: false, valid: false, error: 'Invalid API key' }, 401);
    }

    if (!keyData.active) {
      return c.json({ success: false, valid: false, error: 'API key is inactive' }, 401);
    }

    // Update usage stats
    keyData.lastUsed = new Date().toISOString();
    keyData.usageCount = (keyData.usageCount || 0) + 1;
    await kv.set(`apikey:${apiKey}`, keyData);

    return c.json({ 
      success: true, 
      valid: true,
      name: keyData.name,
      permissions: keyData.permissions
    });
  } catch (error) {
    console.error('Error validating API key:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// List all API keys
app.get("/make-server-8c22500c/api-keys/list", async (c) => {
  try {
    const allKeyIds = await kv.get('apikey:index') || [];
    const keys = [];

    for (const keyId of allKeyIds) {
      const keyData = await kv.get(`apikey:${keyId}`);
      if (keyData) {
        // Don't expose the full key, only last 8 characters
        keys.push({
          id: keyId.slice(-8),
          name: keyData.name,
          description: keyData.description,
          permissions: keyData.permissions,
          createdAt: keyData.createdAt,
          lastUsed: keyData.lastUsed,
          active: keyData.active,
          usageCount: keyData.usageCount
        });
      }
    }

    return c.json({ success: true, keys });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Revoke an API key
app.post("/make-server-8c22500c/api-keys/revoke", async (c) => {
  try {
    const body = await c.req.json();
    const { apiKey } = body;

    if (!apiKey) {
      return c.json({ success: false, error: 'API key is required' }, 400);
    }

    const keyData = await kv.get(`apikey:${apiKey}`);

    if (!keyData) {
      return c.json({ success: false, error: 'API key not found' }, 404);
    }

    keyData.active = false;
    keyData.revokedAt = new Date().toISOString();
    await kv.set(`apikey:${apiKey}`, keyData);

    console.log(`Revoked API key: ${keyData.name} (${apiKey})`);

    return c.json({ 
      success: true, 
      message: `API key '${keyData.name}' has been revoked`
    });
  } catch (error) {
    console.error('Error revoking API key:', error);
    return c.json({ success: false, error: String(error) }, 500);
  }
});

// Middleware to validate API key in Authorization header
export async function requireApiKey(c: any, next: any) {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid Authorization header' }, 401);
  }

  const apiKey = authHeader.replace('Bearer ', '');
  const keyData = await kv.get(`apikey:${apiKey}`);

  if (!keyData || !keyData.active) {
    return c.json({ success: false, error: 'Invalid or inactive API key' }, 401);
  }

  // Update usage stats
  keyData.lastUsed = new Date().toISOString();
  keyData.usageCount = (keyData.usageCount || 0) + 1;
  await kv.set(`apikey:${apiKey}`, keyData);

  // Attach key data to context
  c.set('apiKeyData', keyData);

  await next();
}

export { app as apiKeyRoutes };
