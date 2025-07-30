import express from "express";
import axios from "axios";
import { addToRetryQueue } from "./retryQueue.js";

const router = express.Router();

router.post("/api/webhooks/orders/create", async (req, res) => {
  try {
    console.log("🚀 Webhook order/create pozvan!");
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    
    const order = req.body;

    const metafieldValue = "primer-metafield-vrednosti";

    const payload = {
      id: order.id,
      email: order.email,
      metafield: metafieldValue,
    };

    const resApi = await axios.post(
      "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success",
      payload
    );

    if (resApi.status === 200) {
      console.log("Order uspešno poslat:", order.id);
      res.status(200).send("OK");
    } else {
      console.log("Order nije poslat. Dodajemo u retry:", order.id);
      addToRetryQueue(payload);
      res.status(202).send("Retry queued");
    }
  } catch (err) {
    console.log("Greška u webhooku:", err.message);
    res.status(500).send("Greška u webhook handleru");
  }
});

export default router;
