import 'dotenv/config';
import nodemailer from 'nodemailer';

const {
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '587',
  SMTP_USER = 'tuannm744@gmail.com',
  SMTP_PASS = 'gptugqlzibgscugc',
  ORDER_EMAIL_TO = 'tuannm744@gmail.com',
  EMAIL_FROM = '"Xôi Bà Su" <tuannm744@gmail.com>'
} = process.env;

let transporter = null;
if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS
    }
  });
}

export async function sendOrderEmail(order) {
  try {
    if (!transporter) {
      return { ok: false, reason: 'Missing SMTP config' };
    }
    const recipients = String(ORDER_EMAIL_TO || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (!recipients.length) {
      return { ok: false, reason: 'Missing ORDER_EMAIL_TO' };
    }

    const subject = `[Xôi Bà Su] Đơn mới #${order?.id ?? '---'} từ ${order?.customer_name ?? 'khách'}`;
    const textBody = buildTextBody(order);
    const htmlBody = buildHtmlBody(order);

    await transporter.sendMail({
      from: EMAIL_FROM || `"Xôi Bà Su" <${SMTP_USER}>`,
      to: recipients.join(','),
      subject,
      text: textBody,
      html: htmlBody
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function buildTextBody(order = {}) {
  const lines = [];
  lines.push(`Đơn mới #${order.id ?? ''}`);
  lines.push(`Khách: ${order.customer_name ?? ''}`);
  lines.push(`SĐT: ${order.customer_phone ?? ''}`);
  lines.push(`Hình thức: ${order.shipping_method === 'delivery' ? 'Giao tận nơi' : 'Nhận tại quán'}`);
  if (order.customer_address) lines.push(`Địa chỉ: ${order.customer_address}`);
  if (order.preorder?.enabled) {
    lines.push(`Đặt trước: ${order.preorder.date || ''} ${order.preorder.time || ''}`);
  }
  if (order.payment_method === 'qr') {
    lines.push(`Thanh toán: QR (đã giảm 10%) - Trạng thái ${order.payment_status}`);
  } else {
    lines.push(`Thanh toán: Khi nhận hàng`);
  }
  lines.push('--- Món ---');
  (order.items || []).forEach((item) => {
    lines.push(`- ${item.product_name} x${item.quantity} (${item.unit_price}₫)`);
  });
  lines.push('------------');
  lines.push(`Tạm tính: ${order.subtotal?.toLocaleString('vi-VN')}₫`);
  lines.push(`Ship: ${order.shipping_fee?.toLocaleString('vi-VN')}₫`);
  if (order.discount_value) {
    lines.push(`Giảm giá: -${order.discount_value.toLocaleString('vi-VN')}₫`);
  }
  lines.push(`Tổng: ${order.total?.toLocaleString('vi-VN')}₫`);
  return lines.join('\n');
}

function buildHtmlBody(order = {}) {
  const formatVnd = (val = 0) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(val || 0));
  const itemsHtml = (order.items || [])
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.product_name)}</strong> x${item.quantity} – ${formatVnd(item.unit_price)}</li>`
    )
    .join('');

  return `
    <div style="font-family: 'Inter', system-ui, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin:0 0 8px;">Đơn mới #${order.id ?? ''}</h2>
      <p style="margin:0 0 4px;">Khách: <strong>${escapeHtml(order.customer_name || '')}</strong></p>
      <p style="margin:0 0 4px;">SĐT: <a href="tel:${escapeHtml(order.customer_phone || '')}">${escapeHtml(
    order.customer_phone || ''
  )}</a></p>
      <p style="margin:0 0 4px;">Hình thức: <strong>${
        order.shipping_method === 'delivery' ? 'Giao tận nơi' : 'Nhận tại quán'
      }</strong></p>
      ${
        order.customer_address
          ? `<p style="margin:0 0 4px;">Địa chỉ: ${escapeHtml(order.customer_address)}</p>`
          : ''
      }
      ${
        order.preorder?.enabled
          ? `<p style="margin:0 0 4px;">Đặt trước: ${escapeHtml(order.preorder.date || '')} ${
              order.preorder.time || ''
            }</p>`
          : ''
      }
      <p style="margin:0 0 12px;">Thanh toán: <strong>${
        order.payment_method === 'qr'
          ? 'Chuyển khoản QR (giảm 10%)'
          : 'Thanh toán khi nhận'
      }</strong> • Trạng thái: ${escapeHtml(order.payment_status || 'unpaid')}</p>

      <h3 style="margin:12px 0 6px;">Món đặt</h3>
      <ul style="padding-left:18px; margin:0 0 12px;">${itemsHtml || '<li>(Không có món)</li>'}</ul>

      <table style="width:100%; border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;">Tạm tính</td>
          <td style="text-align:right; font-weight:600;">${formatVnd(order.subtotal)}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;">Phí giao</td>
          <td style="text-align:right; font-weight:600;">${formatVnd(order.shipping_fee)}</td>
        </tr>
        ${
          order.discount_value
            ? `<tr><td style="padding:4px 0;">Giảm giá</td><td style="text-align:right; font-weight:600;">- ${formatVnd(
                order.discount_value
              )}</td></tr>`
            : ''
        }
        <tr>
          <td style="padding:8px 0; font-size:16px; font-weight:700;">Tổng</td>
          <td style="text-align:right; font-size:16px; font-weight:700;">${formatVnd(order.total)}</td>
        </tr>
      </table>
    </div>
  `;
}

function escapeHtml(str = '') {
  return String(str).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

