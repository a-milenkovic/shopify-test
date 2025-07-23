import "@shopify/shopify-api/adapters/node";
import { shopifyApi, LATEST_API_VERSION } from "@shopify/shopify-api";
import express from "express";
import orderWebhookHandler from "./order-webhook.js";

const app = express();

app.use(express.json());
app.use(orderWebhookHandler);

// Shopify konfiguracija
const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET,
  scopes: ["read_orders", "write_orders"],
  hostName: process.env.HOST.replace(/https?:\/\//, ""),
  apiVersion: LATEST_API_VERSION,
  isEmbeddedApp: true,
});

// Mock API endpoint (koristićemo mockapi.io)
const MOCK_API_URL = "https://mockapi.io/projects/123/orders";

// Funkcija za slanje porudžbine na eksterni API
async function sendOrderToAPI(orderData) {
  try {
    const response = await fetch(MOCK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
    return response.ok;
  } catch (error) {
    console.error("Greška pri slanju porudžbine:", error);
    return false;
  }
}

// Ruta za dobijanje liste porudžbina
app.get("/api/orders", async (req, res) => {
  try {
    const session = {
      shop: req.query.shop,
      accessToken: process.env.SHOPIFY_API_SECRET,
    };

    const client = new shopify.clients.Rest({ session });
    const orders = await client.get({
      path: "orders",
      query: { status: "any" },
    });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pokretanje servera
app.listen(3000, () => {
  console.log("Server running on port 3000");
});


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