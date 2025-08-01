import { useState, useEffect } from "react";
import { LegacyCard, Page, DataTable, Button, Banner } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

// Mock shop za development
const MOCK_SHOP = "test-shop.myshopify.com";

function useAppBridgeSafely() {
  try {
    return useAppBridge();
  } catch (error) {
    console.log("App Bridge nije dostupan:", error.message);
    return null;
  }
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({});
  
  const app = useAppBridgeSafely();
  
  useEffect(() => {
    // Debug informacije
    const urlParams = new URLSearchParams(window.location.search);
    console.log("🔍 Shop parameter:", urlParams.get('shop'));
    console.log("🔍 Host parameter:", urlParams.get('host'));
    console.log("🔍 Referrer:", document.referrer);
    console.log("🔍 App Bridge dostupan:", !!app);
  }, [app]);

  const fetchOrders = async () => {
      try {
        // Pokušaj da dobiješ shop iz App Bridge-a
        let shop = null;
        
        try {
          if (app?.config?.shop) {
            shop = app.config.shop;
          }
        } catch (e) {
          console.log("App Bridge config nije dostupan");
        }
        
        // Fallback: pokušaj da dobiješ shop iz URL parametara
        if (!shop) {
          const urlParams = new URLSearchParams(window.location.search);
          shop = urlParams.get('shop');
          
          // Pokušaj da dobiješ iz host parametra
          if (!shop) {
            const host = urlParams.get('host');
            if (host) {
              try {
                const decodedHost = atob(host).split('/')[0];
                if (decodedHost.includes('.myshopify.com')) {
                  shop = decodedHost;
                }
              } catch (e) {
                console.log("Nije moguće dekodovati host parametar");
              }
            }
          }
        }
        
        console.log("🏪 App Bridge shop:", app?.config?.shop);
        console.log("🏪 Detected shop:", shop);
        console.log("🏪 Koristi shop:", shop || "mock shop");
        
        // Pozovi API sa shop parametrom
        const apiUrl = shop ? `/api/orders?shop=${shop}` : '/api/orders';
        const response = await fetch(apiUrl, {
          headers: {
            'X-Shopify-Shop-Domain': shop || MOCK_SHOP
          }
        });
        
        if (!response.ok) {
          throw new Error(`API request failed: ${response.status}`);
        }
        
        const data = await response.json();
        setOrders(data.orders || []);
        setLoading(false);
      } catch (error) {
        console.error("Greška pri učitavanju ordersa:", error);
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchOrders();
    
    // Osvežava ordere svakih 30 sekundi
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
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
      
      // Osvežava ordere nakon slanja
      setTimeout(fetchOrders, 1000);
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
    <Page 
      title="Sinhronizacija porudžbina"
      primaryAction={{
        content: 'Osveži',
        onAction: () => {
          setLoading(true);
          fetchOrders();
        }
      }}
    >
      <Banner status="info">
        <p><strong>Automatski retry mehanizam:</strong> Neuspešno poslate porudžbine se automatski pokušavaju poslati ponovo svakih 30 sekundi, maksimalno 3 puta. Koristite "Test Fail" dugme da testirate retry funkcionalnost.</p>
        <p><strong>Automatsko osvežavanje:</strong> Lista se osvežava svakih 30 sekundi ili kliknite "Osveži" za manuelno osvežavanje.</p>
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