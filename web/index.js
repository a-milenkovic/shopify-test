import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import express from "express";
import orderWebhookHandler from "./order-webhook.js";
import { updateOrderStatus, getOrderStatus, getAllOrderStatuses } from "./database.js";
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

// Session storage - u production koristiti bazu
const sessionStorage = new Map();

app.use(express.json());
app.use(orderWebhookHandler);

// Serviranje static fajlova iz frontend direktorijuma
app.use(serveStatic(join(__dirname, 'frontend')));

// Serviranje frontend aplikacije na root
app.get('/', (req, res) => {
  try {
    const htmlPath = join(__dirname, 'frontend', 'index.html');
    let html = readFileSync(htmlPath, 'utf8');
    // Zameni placeholder sa pravim API key
    html = html.replace('%VITE_SHOPIFY_API_KEY%', process.env.SHOPIFY_API_KEY || '');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: 'Frontend loading failed' });
  }
});

// OAuth začetek - redirect na Shopify authorization
app.get('/auth', (req, res) => {
  const shop = req.query.shop;
  if (!shop) {
    return res.status(400).send('Missing shop parameter');
  }
  
  const authRoute = `/admin/oauth/authorize?client_id=${process.env.SHOPIFY_API_KEY}&scope=read_orders,write_orders,read_metafields,write_metafields&redirect_uri=${process.env.HOST}/auth/callback&state=nonce`;
  const shopifyURL = `https://${shop}${authRoute}`;
  
  res.redirect(shopifyURL);
});

// OAuth callback - prima authorization code i generiše access token
app.get('/auth/callback', async (req, res) => {
  const { shop, code, state } = req.query;
  
  if (!shop || !code) {
    return res.status(400).send('Missing shop or code parameter');
  }
  
  try {
    // Razmeni code za access token
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
    
    // Sačuvaj access token
    sessionStorage.set(shop, {
      shop: shop,
      accessToken: access_token,
      scope: 'read_orders,write_orders,read_metafields,write_metafields'
    });
    
    console.log(`✅ OAuth uspešan za shop: ${shop}`);
    console.log(`🔑 Access token sačuvan: ${access_token?.substring(0, 10)}...`);
    
    // Redirect na frontend aplikaciju sa potrebnim parametrima
    const host = Buffer.from(`${shop}/admin`).toString('base64');
    res.redirect(`/?shop=${shop}&host=${host}&embedded=1`);
  } catch (error) {
    console.error('OAuth greška:', error);
    res.status(500).send('OAuth failed');
  }
});

// Debug endpoint - mora biti posle auth!
app.get('/debug', (req, res) => {
  res.json({ 
    message: "Backend radi!", 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV,
    sessions: Array.from(sessionStorage.keys())
  });
});

// Shopify konfiguracija
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ["read_orders", "write_orders", "read_metafields", "write_metafields"],
  hostName: process.env.HOST ? process.env.HOST.replace(/https?:\/\//, "") : "localhost",
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

// Mock shop za development
const MOCK_SHOP = "test-shop.myshopify.com";

// Mock API endpoints
const MOCK_API_SUCCESS_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success";
const MOCK_API_FAIL_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_fail";

// Funkcija za slanje porudžbine na eksterni API
async function sendOrderToAPI(orderData, useFailEndpoint = false) {
  try {
    const url = useFailEndpoint ? MOCK_API_FAIL_URL : MOCK_API_SUCCESS_URL;
    
    console.log(`Slanje order ${orderData.id} na ${useFailEndpoint ? 'FAIL' : 'SUCCESS'} endpoint`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
    
    const success = response.ok;
    
    if (success) {
      console.log(`Order ${orderData.id} uspešno poslat`);
      await updateOrderStatus(orderData.id, 'sent');
    } else {
      console.log(`Slanje order ${orderData.id} neuspešno, dodajem u retry queue`);
      await updateOrderStatus(orderData.id, 'failed');
      // Dodaj u retry queue za automatski ponovni pokušaj
      addToRetryQueue(orderData);
    }
    
    return success;
  } catch (error) {
    console.error("Greška pri slanju porudžbine:", error);
    await updateOrderStatus(orderData.id, 'failed');
    // Dodaj u retry queue za automatski ponovni pokušaj
    addToRetryQueue(orderData);
    return false;
  }
}

// Ruta za dobijanje liste porudžbina
app.get("/api/orders", async (req, res) => {
  try {
    const shop = req.query.shop || req.headers['x-shopify-shop-domain'];
    console.log("API /orders pozvan sa shop:", shop);
    console.log("Query params:", req.query);
    console.log("Headers:", req.headers['x-shopify-shop-domain']);
    
    // Proverava da li imamo session za ovaj shop
    const session = sessionStorage.get(shop);
    console.log("Session za shop:", session ? "✅ postoji" : "❌ ne postoji");
    
    if (!shop || shop === MOCK_SHOP || !session) {
      console.log("Koristi mock ordere jer nema validnog shop parametra ili session-a");
      // Ako nema shop parametra, vrati mock ordere za development
      const mockOrders = [
        {
          id: 12345,
          name: "1001",
          email: "test@example.com",
          created_at: "2025-01-28T10:00:00Z",
          total_price: "29.99",
          metafield: "Prioritetna dostava",
          sync_status: "pending"
        },
        {
          id: 12346,
          name: "1002", 
          email: "test2@example.com",
          created_at: "2025-01-28T11:00:00Z",
          total_price: "49.99",
          metafield: "Poklon pakovanje",
          sync_status: "sent"
        },
        {
          id: 12347,
          name: "1003", 
          email: "failed@example.com",
          created_at: "2025-01-28T12:00:00Z",
          total_price: "19.99",
          metafield: "Specijalne instrukcije",
          sync_status: "failed"
        }
      ];

      // Dobij sync statuse iz baze
      const syncStatuses = await getAllOrderStatuses();
      const statusMap = {};
      syncStatuses.forEach(status => {
        statusMap[status.order_id] = status;
      });

      const ordersWithStatus = mockOrders.map(order => ({
        ...order,
        sync_status: statusMap[order.id]?.status || order.sync_status || 'pending'
      }));

      return res.status(200).json({ orders: ordersWithStatus });
    }

    // Pravi Shopify API poziv sa sačuvanim access token-om
    console.log("🚀 Koristi pravi Shopify API sa access token-om");
    
    const client = new shopify.clients.Rest({ session });
    
    // Dobij ordere sa Shopify API
    const ordersResponse = await client.get({
      path: "orders",
      query: { 
        status: "any",
        limit: 50,
        fields: "id,name,email,created_at,total_price"
      },
    });

    const orders = ordersResponse.body.orders;

    // Za svaki order, dodaj metafield
    const ordersWithMetafields = await Promise.all(
      orders.map(async (order) => {
        try {
          const metafieldsResponse = await client.get({
            path: `orders/${order.id}/metafields`,
          });
          
          // Pronađi custom metafield
          const customMetafield = metafieldsResponse.body.metafields.find(
            mf => mf.namespace === 'custom'
          ) || metafieldsResponse.body.metafields[0];
          
          return {
            ...order,
            metafield: customMetafield?.value || 'Nema metafield podataka'
          };
        } catch (error) {
          return {
            ...order,
            metafield: 'Greška pri učitavanju metafield'
          };
        }
      })
    );

    // Dobij sync statuse iz baze
    const syncStatuses = await getAllOrderStatuses();
    const statusMap = {};
    syncStatuses.forEach(status => {
      statusMap[status.order_id] = status;
    });

    // Dodaj sync status na svaki order
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

// Test ruta za ordere
app.get('/test-orders', async (req, res) => {
  try {
    const orders = await getAllOrderStatuses();
    res.json({ orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint za manuelno registrovanje webhook-a
app.post('/register-webhook', async (req, res) => {
  try {
    const shop = req.query.shop || req.body.shop;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const session = sessionStorage.get(shop);
    if (!session) {
      return res.status(401).json({ error: 'No session found for shop. Please authenticate first.' });
    }

    const client = new shopify.clients.Rest({ session });
    
    // Registruje webhook
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

    console.log("✅ Webhook registrovan:", webhook.body.webhook);
    res.json({ success: true, webhook: webhook.body.webhook });
  } catch (error) {
    console.error("❌ Greška pri registrovanju webhook-a:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint za listovanje postojećih webhook-ova
app.get('/list-webhooks', async (req, res) => {
  try {
    const shop = req.query.shop;
    if (!shop) {
      return res.status(400).json({ error: 'Missing shop parameter' });
    }

    const session = sessionStorage.get(shop);
    if (!session) {
      return res.status(401).json({ error: 'No session found for shop' });
    }

    const client = new shopify.clients.Rest({ session });
    const webhooks = await client.get({ path: "webhooks" });
    
    res.json({ webhooks: webhooks.body.webhooks });
  } catch (error) {
    console.error("Greška pri listovanju webhook-ova:", error);
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint - direktno poziva webhook logiku
app.post('/test-webhook-direct', async (req, res) => {
  try {
    const testOrder = {
      id: Date.now(),
      name: `TEST-${Date.now()}`,
      email: "test@webhook.com",
      created_at: new Date().toISOString(),
      total_price: "99.99"
    };

    console.log("🧪 Test webhook - direktno pozivanje logike");
    console.log("Test order:", testOrder);

    // Direktno pozovi sendOrderToAPI funkciju
    const result = await sendOrderToAPI(testOrder);
    
    res.json({ 
      success: true, 
      testOrder, 
      apiResult: result,
      message: result ? "Order uspešno poslat na API" : "Order failed - dodat u retry queue"
    });
  } catch (error) {
    console.error("Test webhook greška:", error);
    res.status(500).json({ error: error.message });
  }
});

// Dodatni webhook endpoint
app.post("/api/webhooks/orders", async (req, res) => {
  try {
    const orderData = req.body;
    const success = await sendOrderToAPI(orderData);
    
    if (!success) {
      // Pokušaj ponovo nakon 1 minuta
      setTimeout(() => sendOrderToAPI(orderData), 60000);
    }
    
    res.status(200).send();
  } catch (error) {
    res.status(500).send();
  }
});

// Endpoint za ručno slanje ordera iz frontend-a
app.post("/api/manual-send-order", async (req, res) => {
  try {
    const orderData = req.body;
    const success = await sendOrderToAPI(orderData);
    
    if (success) {
      res.status(200).json({ success: true, message: "Order uspešno poslat" });
    } else {
      res.status(200).json({ success: false, message: "Neuspešno slanje ordera - dodato u retry queue" });
    }
  } catch (error) {
    console.error("Greška pri ručnom slanju:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Endpoint za testiranje fail scenarija
app.post("/api/test-fail-order", async (req, res) => {
  try {
    const orderData = req.body;
    const success = await sendOrderToAPI(orderData, true); // Koristi fail endpoint
    
    res.status(200).json({ 
      success: false, 
      message: "Test fail scenario - order dodato u retry queue",
      willRetry: true
    });
  } catch (error) {
    console.error("Greška pri test fail:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Pokretanje servera
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});