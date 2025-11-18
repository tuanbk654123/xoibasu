import express from 'express';
import path from 'node:path';
import http from 'node:http';
import 'dotenv/config';
import { insertOrder, updateOrderStatus, getOrders, getStats, getOrderById } from './db.js';
import { sendZaloText } from './zalo.js';
import { sendOrderEmail } from './email.js';
import { WebSocketServer } from 'ws';

const app = express();

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: '1mb' }));

// Serve the project root statically so /shop.html and /dashboard.html work
const rootDir = path.resolve(process.cwd(), '..');
app.use(express.static(rootDir, { extensions: ['html'] }));

const PORT = process.env.PORT || 3000;
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const wsClients = new Set();

wss.on('connection', (socket) => {
  wsClients.add(socket);
  socket.on('close', () => wsClients.delete(socket));
  socket.on('error', () => wsClients.delete(socket));
});

function broadcastRealtime(payload) {
  const data = JSON.stringify(payload);
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

app.post('/api/orders', async (req, res) => {
  try {
    const { customer, items, shipping, totals, preorder, payment } = req.body || {};
    if (!customer?.name || !customer?.phone || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    const shippingMethod = shipping === 'delivery' ? 'delivery' : 'pickup';
    const paymentMethod = payment?.method === 'qr' ? 'qr' : 'cod';
    const voucherDiscount = Math.max(0, Number(totals?.voucherDiscount || 0));
    const paymentDiscount = Math.max(0, Number(totals?.paymentDiscount || 0));
    const totalDiscount = Math.max(0, Number(totals?.discount || 0));
    const isPreorder = preorder?.enabled && preorder?.date;
    const order = {
      status: isPreorder ? 'scheduled' : 'new',
      customer_name: String(customer.name).trim(),
      customer_phone: String(customer.phone).trim(),
      customer_address: String(customer.address || ''),
      shipping_method: shippingMethod,
      subtotal: Math.max(0, Number(totals?.subtotal || 0) | 0),
      shipping_fee: Math.max(0, Number(totals?.shipping || 0) | 0),
      total: Math.max(0, Number(totals?.total || 0) | 0),
      discount_value: totalDiscount,
      voucher_discount: voucherDiscount,
      payment_discount: paymentDiscount,
      payment_method: paymentMethod,
      payment_status: paymentMethod === 'qr' ? "paid" : "unpaid",
      preorder: {
        enabled: !!isPreorder,
        date: isPreorder ? preorder.date : '',
        time: isPreorder ? (preorder.time || '') : ''
      },
      items
    };
    const id = insertOrder(order);
    const savedOrder = getOrderById(id);

    const lines = items.map(i => `- ${i.name} x${i.qty} = ${fmtVnd(i.qty * i.price)}`).join('\n');
    const preorderLine = order.preorder?.enabled ? `\n⏰ Nhận: ${order.preorder.date || ''} ${order.preorder.time || ''}` : '';
    const paymentLine = `\n💳 Thanh toán: ${order.payment_status === 'paid' ? 'ĐÃ THANH TOÁN (QR)' : 'Chưa thanh toán'}`;
    const text = `\uD83D\uDCDD Đơn hàng mới #${id}\nKhách: ${order.customer_name}\nSĐT: ${order.customer_phone}\nĐịa chỉ: ${order.shipping_method === 'delivery' ? (order.customer_address || '(chưa nhập)') : 'Nhận tại quán'}${preorderLine}${paymentLine}\n-------------------------\n${lines}\n-------------------------\nTạm tính: ${fmtVnd(order.subtotal)}\nPhí giao: ${fmtVnd(order.shipping_fee)}\nTổng cộng: ${fmtVnd(order.total)}\nTrạng thái: ${order.status.toUpperCase()}`;
    sendZaloText(text).catch((err) => console.error('[ZALO] Error:', err));
    if (savedOrder) {
      sendOrderEmail(savedOrder).then((result) => {
        if (!result?.ok) {
          console.error('[EMAIL] Failed to send order email:', result?.reason || result?.error);
        }
      }).catch((err) => console.error('[EMAIL] Exception:', err));
      broadcastRealtime({ type: 'order:new', order: savedOrder });
    }

    res.json({ id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/orders/:id/status', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = new Set(['new','scheduled','confirmed','preparing','delivering','completed','cancelled']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'Invalid status' });
    updateOrderStatus(id, status);
    const savedOrder = getOrderById(id);
    sendZaloText(`\u26A0\uFE0F Cập nhật trạng thái đơn #${id}: ${status.toUpperCase()}`).catch(() => {});
    if (savedOrder) broadcastRealtime({ type: 'order:update', order: savedOrder });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/ping', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/test-email', async (req, res) => {
  try {
    const { sendOrderEmail } = await import('./email.js');
    const testOrder = {
      id: 999,
      customer_name: 'Test User',
      customer_phone: '0123456789',
      customer_address: 'Test Address',
      shipping_method: 'delivery',
      payment_method: 'cod',
      payment_status: 'unpaid',
      subtotal: 100000,
      shipping_fee: 20000,
      total: 120000,
      discount_value: 0,
      items: [{ product_name: 'Test Item', quantity: 1, unit_price: 100000 }],
      preorder: { enabled: false }
    };
    const result = await sendOrderEmail(testOrder);
    res.json({ ok: result.ok, message: result.ok ? 'Email sent successfully' : (result.reason || result.error) });
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) });
  }
});

app.get('/api/orders', (req, res) => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const requestedPage = Math.max(1, Number(req.query.page || 1));
  const { start, end, status } = req.query || {};
  const { items, total, page, pages } = getOrders({ limit, page: requestedPage, start, end, status, includeMeta: true });
  res.json({
    items,
    total,
    page,
    pages,
    limit
  });
});

app.get('/api/orders/export', (req, res) => {
  const limit = Math.min(10000, Math.max(1, Number(req.query.limit || 10000)));
  const { start, end, status } = req.query || {};
  const orders = getOrders({ limit, start, end, status });
  const rows = [];
  rows.push(['id','created_at','status','customer_name','customer_phone','customer_address','shipping_method','subtotal','shipping_fee','total','items'].join(','));
  for (const o of orders) {
    const items = o.items.map(i => `${i.product_name} x${i.quantity} @${i.unit_price}`).join(' | ');
    rows.push([
      o.id, o.created_at, o.status, csv(o.customer_name), csv(o.customer_phone), csv(o.customer_address),
      o.shipping_method, o.subtotal, o.shipping_fee, o.total, csv(items)
    ].join(','));
  }
  const csvText = rows.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
  res.send(csvText);
});

app.get('/api/stats', (req, res) => {
  const { start, end, status } = req.query || {};
  res.json(getStats({ start, end, status }));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://0.0.0.0:${PORT}`);
});

function fmtVnd(n) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n).replace(/\s?₫/, '₫');
}

function csv(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}
