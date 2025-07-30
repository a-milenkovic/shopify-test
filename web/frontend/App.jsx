import { useState, useEffect } from "react";
import { LegacyCard, Page, DataTable, Button, Banner } from "@shopify/polaris";

// Mock shop za development
const MOCK_SHOP = "test-shop.myshopify.com";

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({});

  useEffect(() => {
    async function fetchOrders() {
      try {
        // Pokušaj da dobiješ shop iz URL parametara
        const urlParams = new URLSearchParams(window.location.search);
        let shop = urlParams.get('shop');
        
        // Ako nema shop parametra, pokušaj da ga dobiješ iz embedded aplikacije
        if (!shop && window.location.hostname !== 'localhost') {
          // U embedded mode, hostname sadrži informacije o shop-u
          const embedded = urlParams.get('embedded') === '1';
          if (embedded) {
            // Pokušaj da extractuješ shop iz host parametra ili drugih embedded parametara
            const host = urlParams.get('host');
            if (host) {
              try {
                const decodedHost = atob(host).split('/')[0];
                shop = decodedHost;
              } catch (e) {
                console.log("Nije moguće dekodovati host parametar");
              }
            }
          }
        }
        
        shop = shop || MOCK_SHOP;
        console.log("Koristi shop:", shop);
        
        const response = await fetch(`/api/orders?shop=${shop}`);
        const data = await response.json();
        setOrders(data.orders || []);
        setLoading(false);
      } catch (error) {
        console.error("Greška pri učitavanju ordersa:", error);
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  const sendOrderToAPI = async (order, testFail = false) => {
    try {
      const payload = {
        id: order.id,
        email: order.email,
        metafield: order.metafield || "primer-metafield-vrednosti",
      };

      const endpoint = testFail ? "/api/test-fail-order" : "/api/manual-send-order";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error("Greška pri slanju ordera:", error);
      return false;
    }
  };

  const handleSyncOrder = async (orderId, testFail = false) => {
    setSyncStatus(prev => ({ ...prev, [orderId]: "syncing" }));
    
    try {
      const success = await sendOrderToAPI(orders.find(o => o.id === orderId), testFail);
      
      if (success) {
        setSyncStatus(prev => ({ ...prev, [orderId]: "sent" }));
        // Ažuriraj order u listi
        setOrders(prev => prev.map(order => 
          order.id === orderId ? { ...order, sync_status: "sent" } : order
        ));
      } else {
        setSyncStatus(prev => ({ ...prev, [orderId]: "failed" }));
        // Ažuriraj order u listi
        setOrders(prev => prev.map(order => 
          order.id === orderId ? { ...order, sync_status: "failed" } : order
        ));
      }
    } catch (error) {
      setSyncStatus(prev => ({ ...prev, [orderId]: "failed" }));
      setOrders(prev => prev.map(order => 
        order.id === orderId ? { ...order, sync_status: "failed" } : order
      ));
    }
  };

  const rows = orders.map(order => {
    const currentStatus = syncStatus[order.id] || order.sync_status;
    const statusText = currentStatus === "sent" ? "🟢 Poslato" : 
                      currentStatus === "failed" ? "🔴 Neuspešno" : 
                      "⏳ Pending";
    
    // Metafield vrednost za svaki order
    const metafieldValue = order.metafield || "primer-metafield-vrednosti";
    
    return [
      new Date(order.created_at).toLocaleDateString(),
      `#${order.name} - CHF ${order.total_price}`,
      metafieldValue,
      statusText,
      syncStatus[order.id] === "syncing" ? (
        <Button loading>Šalje se...</Button>
      ) : (
        <div style={{display: 'flex', gap: '8px'}}>
          <Button primary onClick={() => handleSyncOrder(order.id)}>
            {currentStatus === "sent" ? "Pošalji ponovo" : "Pošalji ručno"}
          </Button>
          <Button destructive onClick={() => handleSyncOrder(order.id, true)}>
            Test Fail
          </Button>
        </div>
      )
    ];
  });

  return (
    <Page title="Sinhronizacija porudžbina">
      <Banner status="info">
        <p><strong>Automatski retry mehanizam:</strong> Neuspešno poslate porudžbine se automatski pokušavaju poslati ponovo svakih 30 sekundi, maksimalno 3 puta. Koristite "Test Fail" dugme da testirate retry funkcionalnost.</p>
      </Banner>
      
      <LegacyCard>
        <DataTable
          columnContentTypes={["text", "text", "text", "text", "text"]}
          headings={["Datum", "Porudžbina", "Metafield", "Status", "Akcije"]}
          rows={rows}
          loading={loading}
        />
      </LegacyCard>
    </Page>
  );
}