import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import express from "express";
import orderWebhookHandler from "./order-webhook.js";
import { updateOrderStatus, getOrderStatus, getAllOrderStatuses, saveSession, getSession, getAllSessions } from "./database.js";
import { addToRetryQueue } from "./retryQueue.js";
import dotenv from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import serveStatic from "serve-static";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

app.use(express.json());
app.use(orderWebhookHandler);

// FIRST define all API routes BEFORE static middleware
// OAuth start - redirect to Shopify authorization
app.get('/auth', async (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }
  
  
  // Check if we already have REAL session (not dummy)
  const existingSession = await getSession(shop);
  if (existingSession && !existingSession.access_token.includes('dummy')) {
    const host = Buffer.from(`${shop}/admin`).toString('base64');
    return res.redirect(`/?shop=${shop}&host=${host}&embedded=1`);
  }
  
  
  const authRoute = `/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_orders,write_orders,read_metafields,write_metafields&redirect_uri=${process.env.HOST}/auth/callback&state=nonce`;
  const shopifyURL = `https://${shop}${authRoute}`;
  
  res.redirect(shopifyURL);
});

// OAuth callback - receives authorization code and generates access token
app.get('/auth/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  
  
  if (!shop || !code) {
    return res.status(400).send('Missing shop or code parameter');
  }
  
  try {
    // Exchange code for access token
    const accessTokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.SHOPIFY_API_KEY,
        client_secret: process.env.SHOPIFY_API_SECRET,
        code: code,
      }),
    });
    
    const { access_token } = await accessTokenResponse.json();
    
    // Save access token to database
    await saveSession(shop, access_token, 'read_orders,write_orders,read_metafields,write_metafields');
    
    
    // Redirect to frontend application with required parameters
    const host = Buffer.from(`${shop}/admin`).toString('base64');
    res.redirect(`/?shop=${shop}&host=${host}&embedded=1`);
  } catch (error) {
    console.error('OAuth greška:', error);
    res.status(500).send('OAuth failed');
  }
});

// Debug endpoint
app.get('/debug', async (req, res) => {
  res.json({ 
    message: "Backend radi!", 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV,
    sessions: (await getAllSessions()).map(s => s.shop),
    sessionDetails: await getAllSessions()
  });
});

// Automatically create session on server startup
(async () => {
  try {
    const shop = 'beetest123.myshopify.com';
    const existingSession = await getSession(shop);
    if (!existingSession) {
      const accessToken = 'shpat_dummy_token_for_mock_orders_testing_12345';
      await saveSession(shop, accessToken, 'read_orders,write_orders,read_metafields,write_metafields');
    } else {
    }
  } catch (error) {
  }
})();

// Shopify configuration
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ["read_orders", "write_orders", "read_metafields", "write_metafields"],
  hostName: process.env.HOST ? process.env.HOST.replace(/https?:\/\//, "") : "localhost",
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

// Mock shop for development
const MOCK_SHOP = "test-shop.myshopify.com";

// Mock API endpoints
const MOCK_API_SUCCESS_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success";
const MOCK_API_FAIL_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_fail";

// Function for sending order to external API
async function sendOrderToAPI(orderData, useFailEndpoint = false) {
  try {
    const url = useFailEndpoint ? MOCK_API_FAIL_URL : MOCK_API_SUCCESS_URL;
    
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
    
    const success = response.ok;
    
    if (success) {
      await updateOrderStatus(orderData.id, 'sent');
    } else {
      await updateOrderStatus(orderData.id, 'failed');
      // Add to retry queue for automatic retry
      addToRetryQueue(orderData);
    }
    
    return success;
  } catch (error) {
    await updateOrderStatus(orderData.id, 'failed');
    // Add to retry queue for automatic retry
    addToRetryQueue(orderData);
    return false;
  }
}

// Route for getting list of orders
app.get("/api/orders", async (req, res) => {
  try {
    const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
    
    // Check if we have session for this shop in database
    const sessionData = await getSession(shop);
    const session = sessionData ? {
      shop: sessionData.shop,
      accessToken: sessionData.access_token,
      scope: sessionData.scope
    } : null;
    
    // Get all orders from database (webhook orders)
    const syncStatuses = await getAllOrderStatuses();
    
    if (!shop || shop === MOCK_SHOP || !session || session.accessToken.includes('dummy')) {
      
      // Create orders from database (webhook orders)
      const databaseOrders = syncStatuses.map(status => ({
        id: parseInt(status.order_id),
        name: `#ORDER-${status.order_id.toString().slice(-4)}`, // Last 4 digits
        email: "webhook@order.com", // Placeholder email
        created_at: status.created_at,
        total_price: "0.00", // Placeholder price
        metafield: "Webhook order",
        sync_status: status.status
      }));

      // Mock orders for testing
      const mockOrders = [
        {
          id: 12345,
          name: "1001",
          email: "test@example.com",
          created_at: "2025-01-28T10:00:00Z",
          total_price: "29.99",
          metafield: "Priority delivery",
          sync_status: "pending"
        },
        {
          id: 12346,
          name: "1002", 
          email: "test2@example.com",
          created_at: "2025-01-28T11:00:00Z",
          total_price: "49.99",
          metafield: "Gift wrapping",
          sync_status: "sent"
        }
      ];

      // Combine database orders and mock orders
      const allOrders = [...databaseOrders, ...mockOrders];

      return res.status(200).json({ orders: allOrders });
    }

    // Make real Shopify API call with saved access token
    
    const client = new shopify.clients.Rest({ session });
    
    // Get orders from Shopify API
    const ordersResponse = await client.get({
      path: "orders",
      query: { 
        status: "any",
        limit: 50,
        fields: "id,name,email,created_at,total_price"
      },
    });

    const orders = ordersResponse.body.orders;

    // For each order, add metafield
    const ordersWithMetafields = await Promise.all(
      orders.map(async (order) => {
        try {
          const metafieldsResponse = await client.get({
            path: `orders/${order.id}/metafields`,
          });
          
          // Find custom metafield
          const customMetafield = metafieldsResponse.body.metafields.find(
            mf => mf.namespace === 'custom'
          ) || metafieldsResponse.body.metafields[0];
          
          return {
            ...order,
            metafield: customMetafield?.value || 'No metafield data'
          };
        } catch (error) {
          return {
            ...order,
            metafield: 'Error loading metafield'
          };
        }
      })
    );

    // Create status map from already loaded sync statuses
    const statusMap = {};
    syncStatuses.forEach(status => {
      statusMap[status.order_id] = status;
    });

    // Add sync status to each order
    const ordersWithStatus = ordersWithMetafields.map(order => ({
      ...order,
      sync_status: statusMap[order.id]?.status || 'pending'
    }));

    res.status(200).json({ orders: ordersWithStatus });
  } catch (error) {
    console.error("Greška pri dobijanju ordersa:", error);
    res.status(500).json({ error: error.message });
  }
});

// Test route for orders
app.get('/test-orders', async (req, res) => {
  try {
    const orders = await getAllOrderStatuses();
    res.json({ orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for manual webhook registration
app.post('/register-webhook', async (req, res) => {
  try {
    const shop = req.query.shop || req.body.shop;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const sessionData = await getSession(shop);
    const session = sessionData ? {
      shop: sessionData.shop,
      accessToken: sessionData.access_token,
      scope: sessionData.scope
    } : null;
    if (!session) {
      return res.status(401).json({ error: 'No session found for shop. Please authenticate first.' });
    }

    const client = new shopify.clients.Rest({ session });
    
    // Register webhook
    const webhook = await client.post({
      path: "webhooks",
      data: {
        webhook: {
          topic: "orders/create",
          address: `${process.env.HOST}/api/webhooks/orders/create`,
          format: "json"
        }
      }
    });

    res.json({ success: true, webhook: webhook.body.webhook });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint for listing existing webhooks
app.get('/list-webhooks', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const sessionData = await getSession(shop);
    const session = sessionData ? {
      shop: sessionData.shop,
      accessToken: sessionData.access_token,
      scope: sessionData.scope
    } : null;
    if (!session) {
      return res.status(401).json({ error: 'No session found for shop' });
    }

    const client = new shopify.clients.Rest({ session });
    const webhooks = await client.get({ path: "webhooks" });
    
    res.json({ webhooks: webhooks.body.webhooks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Additional webhook endpoint
app.post("/api/webhooks/orders", async (req, res) => {
  try {
    const orderData = req.body;
    const success = await sendOrderToAPI(orderData);
    
    if (!success) {
      // Try again after 1 minute
      setTimeout(() => sendOrderToAPI(orderData), 60000);
    }
    
    res.status(200).send();
  } catch (error) {
    res.status(500).send();
  }
});

// Endpoint for manual order sending from frontend
app.post("/api/manual-send-order", async (req, res) => {
  try {
    const orderData = req.body;
    const success = await sendOrderToAPI(orderData);
    
    if (success) {
      res.status(200).json({ success: true, message: "Order successfully sent" });
    } else {
      res.status(200).json({ success: false, message: "Failed to send order - added to retry queue" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint for testing fail scenarios
app.post("/api/test-fail-order", async (req, res) => {
  try {
    const orderData = req.body;
    const success = await sendOrderToAPI(orderData, true); // Use fail endpoint
    
    res.status(200).json({ 
      success: false, 
      message: "Test fail scenario - order added to retry queue",
      willRetry: true
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Serve static files from frontend directory (AFTER API routes)
app.use(serveStatic(join(__dirname, 'frontend')));

// Serve frontend application on root
app.get('/', (req, res) => {
  try {
    const htmlPath = join(__dirname, 'frontend', 'index.html');
    let html = readFileSync(htmlPath, 'utf8');
    // Replace placeholder with real API key
    html = html.replace('%VITE_SHOPIFY_API_KEY%', process.env.SHOPIFY_API_KEY || '');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: 'Frontend loading failed' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
});