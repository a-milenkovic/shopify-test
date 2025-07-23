const axios = require("axios");

let retryQueue = [];

function addToRetryQueue(order) {
  retryQueue.push(order);
  console.log("Dodato u retry queue:", order.id);
  setTimeout(() => tryResend(order), 10000); // Retry za 10s
}

async function tryResend(order) {
  try {
    const res = await axios.post(
      "https://686277b096f0cc4e34b9d336.mockapi.io/orders/fail",
      order
    );

    if (res.status === 200) {
      console.log("Ponovni pokušaj uspešan:", order.id);
      retryQueue = retryQueue.filter((o) => o.id !== order.id);
    } else {
      console.log("Neuspešan retry. Pokušaćemo ponovo.");
      setTimeout(() => tryResend(order), 10000);
    }
  } catch (err) {
    console.log("Greška pri retry:", err.message);
    setTimeout(() => tryResend(order), 10000);
  }
}

module.exports = { addToRetryQueue };
