import { useState, useEffect } from "react";
import { Card, Page, DataTable, Button, Banner } from "@shopify/polaris";

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({});

  useEffect(() => {
    async function fetchOrders() {
      const shop = new URLSearchParams(window.location.search).get("shop");
      const response = await fetch(`/api/orders?shop=${shop}`);
      const data = await response.json();
      setOrders(data.orders || []);
      setLoading(false);
    }
    fetchOrders();
  }, []);

  const handleSyncOrder = async (orderId) => {
    setSyncStatus(prev => ({ ...prev, [orderId]: "syncing" }));
    
    try {
      const success = await sendOrderToAPI(orders.find(o => o.id === orderId));
      setSyncStatus(prev => ({ ...prev, [orderId]: success ? "synced" : "failed" }));
      
      if (!success) {
        // Pokušaj ponovo nakon 5 sekundi
        setTimeout(() => handleSyncOrder(orderId), 5000);
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, [orderId]: "failed" }));
    }
  };

  const rows = orders.map(order => [
    new Date(order.created_at).toLocaleDateString(),
    `#${order.name} - CHF ${order.total_price}`,
    syncStatus[order.id] === "synced" ? "🟢 Poslato" : "🔴 Nije poslato",
    syncStatus[order.id] === "syncing" ? (
      <Button loading>Šalje se...</Button>
    ) : (
      <Button primary onClick={() => handleSyncOrder(order.id)}>
        Pošalji ručno
      </Button>
    )
  ]);

  return (
    <Page title="Sinhronizacija porudžbina">
      <Card>
        <DataTable
          columnContentTypes={["text", "text", "text", "text"]}
          headings={["Datum", "Porudžbina", "Status", "Akcije"]}
          rows={rows}
          loading={loading}
        />
      </Card>
    </Page>
  );
}