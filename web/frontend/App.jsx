import { useState, useEffect } from "react";
import { LegacyCard, Page, DataTable, Button, Banner } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";

// Mock shop for development
const MOCK_SHOP = "test-shop.myshopify.com";

function useAppBridgeSafely() {
  try {
    return useAppBridge();
  } catch (error) {
    return null;
  }
}

export default function App() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState({});
  
  const app = useAppBridgeSafely();
  
  useEffect(() => {
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
        }
        
        // Fallback: try to get shop from URL parameters
        if (!shop) {
          const urlParams = new URLSearchParams(window.location.search);
          shop = urlParams.get('shop');
          
          // Try to get from host parameter
          if (!shop) {
            const host = urlParams.get('host');
            if (host) {
              try {
                const decodedHost = atob(host).split('/')[0];
                if (decodedHost.includes('.myshopify.com')) {
                  shop = decodedHost;
                }
              } catch (e) {
              }
            }
          }
        }
        
        
        // Call API with shop parameter
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
        setLoading(false);
      }
    };

  useEffect(() => {
    fetchOrders();
    
    // Refresh orders every 30 seconds
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, []);

  const sendOrderToAPI = async (order, testFail = false) => {
    try {
      const payload = {
        id: order.id,
        email: order.email,
        metafield: order.metafield || "example-metafield-value",
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
      return false;
    }
  };

  const handleSyncOrder = async (orderId, testFail = false) => {
    setSyncStatus(prev => ({ ...prev, [orderId]: "syncing" }));
    
    try {
      const success = await sendOrderToAPI(orders.find(o => o.id === orderId), testFail);
      
      if (success) {
        setSyncStatus(prev => ({ ...prev, [orderId]: "sent" }));
        // Update order in list
        setOrders(prev => prev.map(order => 
          order.id === orderId ? { ...order, sync_status: "sent" } : order
        ));
      } else {
        setSyncStatus(prev => ({ ...prev, [orderId]: "failed" }));
        // Update order in list
        setOrders(prev => prev.map(order => 
          order.id === orderId ? { ...order, sync_status: "failed" } : order
        ));
      }
      
      // Refresh orders after sending
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
    const statusText = currentStatus === "sent" ? "🟢 Sent" : 
                      currentStatus === "failed" ? "🔴 Failed" : 
                      "⏳ Pending";
    
    // Metafield value for each order
    const metafieldValue = order.metafield || "example-metafield-value";
    
    return [
      new Date(order.created_at).toLocaleDateString(),
      `#${order.name} - CHF ${order.total_price}`,
      metafieldValue,
      statusText,
      syncStatus[order.id] === "syncing" ? (
        <Button loading>Sending...</Button>
      ) : (
        <div style={{display: 'flex', gap: '8px'}}>
          <Button primary onClick={() => handleSyncOrder(order.id)}>
            {currentStatus === "sent" ? "Send again" : "Send manually"}
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
      title="Order Synchronization"
      primaryAction={{
        content: 'Refresh',
        onAction: () => {
          setLoading(true);
          fetchOrders();
        }
      }}
    >
      <Banner status="info">
        <p><strong>Automatic retry mechanism:</strong> Failed orders are automatically retried every 30 seconds, maximum 3 times. Use the "Test Fail" button to test retry functionality.</p>
        <p><strong>Auto refresh:</strong> List refreshes every 30 seconds or click "Refresh" for manual refresh.</p>
      </Banner>
      
      <LegacyCard>
        <DataTable
          columnContentTypes={["text", "text", "text", "text", "text"]}
          headings={["Date", "Order", "Metafield", "Status", "Actions"]}
          rows={rows}
          loading={loading}
        />
      </LegacyCard>
    </Page>
  );
}