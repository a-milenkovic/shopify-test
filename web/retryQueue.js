import axios from "axios";
import { updateOrderStatus } from "./database.js";

let retryQueue = [];
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 30000; // 30 sekundi

const MOCK_API_SUCCESS_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success";

function addToRetryQueue(order, attempt = 1) {
  const retryOrder = { ...order, attempt };
  retryQueue.push(retryOrder);
  console.log(`Dodato u retry queue: ${order.id} (pokušaj ${attempt})`);
  
  setTimeout(() => tryResend(retryOrder), RETRY_DELAY);
}

async function tryResend(order) {
  try {
    console.log(`Pokušaj retry za order ${order.id}, pokušaj ${order.attempt}/${MAX_RETRY_ATTEMPTS}`);
    
    const res = await axios.post(MOCK_API_SUCCESS_URL, {
      id: order.id,
      email: order.email,
      metafield: order.metafield
    });

    if (res.status === 200 || res.status === 201) {
      console.log("Ponovni pokušaj uspešan:", order.id);
      await updateOrderStatus(order.id, 'sent');
      retryQueue = retryQueue.filter((o) => o.id !== order.id);
    } else {
      handleRetryFailure(order);
    }
  } catch (err) {
    console.log("Greška pri retry:", err.message);
    handleRetryFailure(order);
  }
}

async function handleRetryFailure(order) {
  if (order.attempt < MAX_RETRY_ATTEMPTS) {
    console.log(`Retry neuspešan za ${order.id}. Pokušaćemo ponovo (${order.attempt + 1}/${MAX_RETRY_ATTEMPTS})`);
    // Ukloni trenutni i dodaj novi sa povećanim brojem pokušaja
    retryQueue = retryQueue.filter((o) => o.id !== order.id);
    addToRetryQueue(order, order.attempt + 1);
  } else {
    console.log(`Maksimalan broj pokušaja dostignut za order ${order.id}`);
    await updateOrderStatus(order.id, 'failed');
    retryQueue = retryQueue.filter((o) => o.id !== order.id);
  }
}

export { addToRetryQueue };
