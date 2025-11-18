import fs from 'node:fs';
import path from 'node:path';

const dbDir = path.resolve(process.cwd(), 'server');
const dbPath = path.join(dbDir, 'data.json');
fs.mkdirSync(dbDir, { recursive: true });

function defaultData() {
  return { nextOrderId: 1, orders: [] };
}

function load() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      const data = defaultData();
      save(data);
      return data;
    }
    throw err;
  }
}

function save(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
}

function applyFilters(orders, { start, end, status } = {}) {
  const startTs = start ? Date.parse(start) : null;
  const endTs = end ? Date.parse(end) : null;
  return orders.filter((order) => {
    const createdTs = Date.parse(order.created_at);
    if (Number.isFinite(startTs) && createdTs < startTs) return false;
    if (Number.isFinite(endTs) && createdTs > endTs) return false;
    if (status && status !== 'all' && order.status !== status) return false;
    return true;
  });
}

export function insertOrder(order) {
  const data = load();
  const id = data.nextOrderId++;
  const created_at = new Date().toISOString();
  const record = {
    id,
    created_at,
    status: order.status,
    customer_name: order.customer_name,
    customer_phone: order.customer_phone,
    customer_address: order.customer_address,
    shipping_method: order.shipping_method,
    subtotal: order.subtotal,
    shipping_fee: order.shipping_fee,
    total: order.total,
    discount_value: order.discount_value || 0,
    voucher_discount: order.voucher_discount || 0,
    payment_discount: order.payment_discount || 0,
    payment_method: order.payment_method || 'cod',
    payment_status: order.payment_status || 'unpaid',
    preorder: {
      enabled: order.preorder?.enabled || false,
      date: order.preorder?.date || '',
      time: order.preorder?.time || ''
    },
    preorder_date: order.preorder?.date || '',
    preorder_time: order.preorder?.time || '',
    items: order.items.map(it => ({
      product_id: it.id,
      product_name: it.name,
      unit_price: it.price,
      quantity: it.qty
    }))
  };
  data.orders.push(record);
  save(data);
  return id;
}

export function updateOrderStatus(id, status) {
  const data = load();
  const order = data.orders.find(o => o.id === Number(id));
  if (order) {
    order.status = status;
    save(data);
  }
}

export function getOrders({ limit = 50, page = 1, start, end, status, includeMeta = false } = {}) {
  const data = load();
  const filtered = applyFilters(data.orders, { start, end, status })
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  const safeLimit = Math.max(1, Number(limit) || 50);
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / safeLimit) || 1);
  const safePage = Math.min(Math.max(1, Number(page) || 1), pages);
  const offset = (safePage - 1) * safeLimit;
  const items = filtered.slice(offset, offset + safeLimit);
  if (includeMeta) {
    return { items, total, page: safePage, pages };
  }
  return items;
}

export function getStats({ start, end, status } = {}) {
  const orders = applyFilters(load().orders, { start, end, status });
  const byStatusMap = new Map();
  const revenueByDayMap = new Map();
  const productMap = new Map();
  let revenue = 0;

  for (const order of orders) {
    byStatusMap.set(order.status, (byStatusMap.get(order.status) || 0) + 1);
    const day = order.created_at.slice(0, 10);
    revenueByDayMap.set(day, (revenueByDayMap.get(day) || 0) + order.total);
    revenue += order.total;
    for (const item of order.items) {
      productMap.set(item.product_name, (productMap.get(item.product_name) || 0) + item.quantity);
    }
  }

  const byStatus = Array.from(byStatusMap.entries()).map(([status, count]) => ({ status, count }));
  const revenueByDay = Array.from(revenueByDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, rev]) => ({ day, revenue: rev }));
  const topProducts = Array.from(productMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, qty]) => ({ name, qty }));

  return {
    byStatus,
    revenueByDay,
    topProducts,
    totals: { orders: orders.length, revenue }
  };
}

export function getOrderById(id) {
  if (id == null) return null;
  const orders = load().orders;
  return orders.find(o => o.id === Number(id)) || null;
}
