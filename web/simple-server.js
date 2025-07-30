import express from "express";
import { updateOrderStatus, getOrderStatus, getAllOrderStatuses } from "./database.js";
import cors from "cors";

const app = express();

app.use(express.json());
app.use(cors());

// Mock API endpoints
const MOCK_API_SUCCESS_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_success";
const MOCK_API_FAIL_URL = "https://6889d1d54c55d5c73953af8c.mockapi.io/api/v1/orders_fail";

// Debug endpoint
app.get('/debug', (req, res) => {
  res.json({ 
    message: "Simple server radi!", 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 4000
  });
});

// Funkcija za slanje porudžbine na eksterni API
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
    
    // Čuvaj status u bazi
    await updateOrderStatus(orderData.id, success ? 'sent' : 'failed');
    
    return success;
  } catch (error) {
    console.error("Greška pri slanju porudžbine:", error);
    await updateOrderStatus(orderData.id, 'failed');
    return false;
  }
}

// Ruta za dobijanje liste porudžbina - mock podaci
app.get("/api/orders", async (req, res) => {
  try {
    // Mock orderi za testiranje
    const mockOrders = [
      {
        id: 12345,
        name: "1001",
        email: "test@example.com",
        created_at: "2025-01-28T10:00:00Z",
        total_price: "29.99",
        sync_status: "pending"
      },
      {
        id: 12346,
        name: "1002", 
        email: "test2@example.com",
        created_at: "2025-01-28T11:00:00Z",
        total_price: "49.99",
        sync_status: "sent"
      },
      {
        id: 12347,
        name: "1003", 
        email: "failed@example.com",
        created_at: "2025-01-28T12:00:00Z",
        total_price: "19.99",
        sync_status: "failed"
      }
    ];

    // Dobij sync statuse iz baze
    const syncStatuses = await getAllOrderStatuses();
    const statusMap = {};
    syncStatuses.forEach(status => {
      statusMap[status.order_id] = status;
    });

    // Dodaj sync status na svaki order
    const ordersWithStatus = mockOrders.map(order => ({
      ...order,
      sync_status: statusMap[order.id]?.status || order.sync_status || 'pending'
    }));

    res.status(200).json({ orders: ordersWithStatus });
  } catch (error) {
    console.error("Greška pri dobijanju ordersa:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint za ručno slanje ordera iz frontend-a
app.post("/api/manual-send-order", async (req, res) => {
  try {
    const orderData = req.body;
    console.log("Primejen zahtev za slanje ordera:", orderData);
    
    const success = await sendOrderToAPI(orderData);
    
    if (success) {
      res.status(200).json({ success: true, message: "Order uspešno poslat" });
    } else {
      res.status(500).json({ success: false, message: "Neuspešno slanje ordera" });
    }
  } catch (error) {
    console.error("Greška pri ručnom slanju:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Test ruta za ordere iz baze
app.get('/test-orders', async (req, res) => {
  try {
    const orders = await getAllOrderStatuses();
    res.json({ orders, count: orders.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Pokretanje servera
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Simple server pokrenut na portu ${PORT}`);
});