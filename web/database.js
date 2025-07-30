import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = join(__dirname, 'orders.db');
const db = new sqlite3.Database(dbPath);

// Kreiranje tabele ako ne postoji
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS order_sync (
    order_id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_attempt DATETIME,
    attempts INTEGER DEFAULT 0
  )`);
});

export const updateOrderStatus = (orderId, status) => {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO order_sync (order_id, status, last_attempt, attempts) 
       VALUES (?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT attempts FROM order_sync WHERE order_id = ?), 0) + 1)`,
      [orderId, status, orderId],
      function(err) {
        if (err) reject(err);
        else resolve(this.changes);
      }
    );
  });
};

export const getOrderStatus = (orderId) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM order_sync WHERE order_id = ?`,
      [orderId],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

export const getAllOrderStatuses = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM order_sync ORDER BY created_at DESC`,
      [],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

export default db;