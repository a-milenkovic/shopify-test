import express from "express";
import { updateOrderStatus } from "./database.js";
import { addToRetryQueue } from "./retryQueue.js";

const router = express.Router();

// Mock API endpoints
const MOCK_API_SUCCESS_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success";
const MOCK_API_FAIL_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_fail";

// Funkcija za slanje porudžbine na eksterni API (kopija iz index.js)
async function sendOrderToAPI(orderData, useFailEndpoint = false) {
  try {
    const url = useFailEndpoint ? MOCK_API_FAIL_URL : MOCK_API_SUCCESS_URL;
    
    console.log(`Webhook: Slanje order ${orderData.id} na ${useFailEndpoint ? 'FAIL' : 'SUCCESS'} endpoint`);
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(orderData),
    });
    
    const success = response.ok;
    
    if (success) {
      console.log(`Webhook: Order ${orderData.id} uspešno poslat`);
      await updateOrderStatus(orderData.id, 'sent');
    } else {
      console.log(`Webhook: Slanje order ${orderData.id} neuspešno, dodajem u retry queue`);
      await updateOrderStatus(orderData.id, 'failed');
      addToRetryQueue(orderData);
    }
    
    return success;
  } catch (error) {
    console.error("Webhook: Greška pri slanju porudžbine:", error);
    await updateOrderStatus(orderData.id, 'failed');
    addToRetryQueue(orderData);
    return false;
  }
}

router.post("/api/webhooks/orders/create", async (req, res) => {
  try {
    console.log("🚀 Webhook order/create pozvan!");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const order = req.body;

    // Pokušaj da dobije metafield iz order-a, ili koristi default
    const metafieldValue = order.metafields?.find(mf => mf.namespace === 'custom')?.value || 
                          order.note_attributes?.find(attr => attr.name === 'special_instructions')?.value ||
                          "Automatski dodato metafield";

    const payload = {
      id: order.id,
      name: order.name,
      email: order.email,
      created_at: order.created_at,
      total_price: order.total_price,
      metafield: metafieldValue,
    };

    console.log("🔄 Webhook: Početno obeležavanje order-a kao pending");
    await updateOrderStatus(order.id, 'pending');

    // Koristi centralnu funkciju za slanje
    const success = await sendOrderToAPI(payload);

    if (success) {
      console.log("✅ Webhook: Order uspešno poslat:", order.id);
      res.status(200).send("OK");
    } else {
      console.log("⚠️ Webhook: Order nije poslat, dodat u retry queue:", order.id);
      res.status(202).send("Retry queued");
    }
  } catch (err) {
    console.log("❌ Webhook greška:", err.message);
    // Označi kao failed u bazi ako je moguće
    if (req.body?.id) {
      try {
        await updateOrderStatus(req.body.id, 'failed');
      } catch (dbErr) {
        console.log("Greška pri ažuriranju baze:", dbErr.message);
      }
    }
    res.status(500).send("Greška u webhook handleru");
  }
});

export default router;
