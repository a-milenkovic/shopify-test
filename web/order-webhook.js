import express from "express";
import { updateOrderStatus } from "./database.js";
import { addToRetryQueue } from "./retryQueue.js";

const router = express.Router();

// Mock API endpoints
const MOCK_API_SUCCESS_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success";
const MOCK_API_FAIL_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_fail";

// Function for sending order to external API (copy from index.js)
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
      addToRetryQueue(orderData);
    }
    
    return success;
  } catch (error) {
    await updateOrderStatus(orderData.id, 'failed');
    addToRetryQueue(orderData);
    return false;
  }
}

router.post("/api/webhooks/orders/create", async (req, res) => {
  try {
    
    const order = req.body;

    // Try to get metafield from order, or use default
    const metafieldValue = order.metafields?.find(mf => mf.namespace === 'custom')?.value || 
                          order.note_attributes?.find(attr => attr.name === 'special_instructions')?.value ||
                          "Automatically added metafield";

    const payload = {
      id: order.id,
      name: order.name,
      email: order.email,
      created_at: order.created_at,
      total_price: order.total_price,
      metafield: metafieldValue,
    };

    await updateOrderStatus(order.id, 'pending');

    // Koristi centralnu funkciju za slanje
    const success = await sendOrderToAPI(payload);

    if (success) {
      res.status(200).send("OK");
    } else {
      res.status(202).send("Retry queued");
    }
  } catch (err) {
    // Mark as failed in database if possible
    if (req.body?.id) {
      try {
        await updateOrderStatus(req.body.id, 'failed');
      } catch (dbErr) {
      }
    }
    res.status(500).send("Error in webhook handler");
  }
});

export default router;
