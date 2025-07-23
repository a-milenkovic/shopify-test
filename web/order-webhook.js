const express = require("express");
const router = express.Router();
const axios = require("axios");
const { addToRetryQueue } = require("./retryQueue");

router.post("/api/webhooks/orders-create", async (req, res) => {
  try {
    const order = req.body;

    const metafieldValue = "primer-metafield-vrednosti";

    const payload = {
      id: order.id,
      email: order.email,
      metafield: metafieldValue,
    };

    const resApi = await axios.post(
      "https://686277b096f0cc4e34b9d336.mockapi.io/orders/success",
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

module.exports = router;
