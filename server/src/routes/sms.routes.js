import express from 'express';
import { queryOne, queryAll, run } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List Eligible Customers & SMS Settings
router.get('/eligible-customers', requirePermission('sms', 'send'), (req, res) => {
  const customers = queryAll(`
    SELECT id, name, mobile, village, current_balance AS outstanding_amount, credit_limit,
           (SELECT MAX(created_at) FROM customer_transactions WHERE customer_id = customers.id AND txn_type = 'SALE') AS last_sale_date
    FROM customers
    WHERE current_balance > 0 AND mobile IS NOT NULL AND mobile != ''
    ORDER BY current_balance DESC
  `);

  const templateSetting = queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'sms_template_udhar'")?.setting_value || 
    'Dear {customer_name}, your outstanding balance at {store_name} is Rs.{outstanding_amount}. Kindly settle at your convenience. Contact: {store_phone}.';

  const providerSetting = queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'sms_provider'")?.setting_value || 'Simulated';

  return res.json({ success: true, customers, template: templateSetting, provider: providerSetting });
});

// Render template helper
function renderSmsMessage(template, customerName, outstandingAmt, storeName, storePhone) {
  return template
    .replace('{customer_name}', customerName)
    .replace('{outstanding_amount}', outstandingAmt)
    .replace('{store_name}', storeName)
    .replace('{store_phone}', storePhone)
    .replace('{due_date}', 'Immediate');
}

// Send One-Click Bulk SMS Reminders
router.post('/send-reminders', requirePermission('sms', 'send'), async (req, res) => {
  const { customer_ids, template_override } = req.body;

  if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
    return res.status(400).json({ success: false, message: 'Select at least one customer to send SMS.' });
  }

  const storeName = queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'store_name'")?.setting_value || 'Krushi Seva Kendra';
  const storePhone = queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'mobile'")?.setting_value || '9822012345';
  const provider = queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'sms_provider'")?.setting_value || 'Simulated';
  const defaultTemplate = queryOne("SELECT setting_value FROM business_settings WHERE setting_key = 'sms_template_udhar'")?.setting_value || '';

  const activeTemplate = template_override || defaultTemplate;

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const cid of customer_ids) {
    const cust = queryOne('SELECT id, name, mobile, current_balance FROM customers WHERE id = ?', [cid]);
    if (!cust || !cust.mobile) continue;

    const messageText = renderSmsMessage(activeTemplate, cust.name, cust.current_balance, storeName, storePhone);

    try {
      // Configurable Provider Logic (Simulated or Live Provider Call)
      let providerMsgId = `SIM-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      let smsStatus = 'SENT';

      if (provider === 'MSG91') {
        // Placeholder for real MSG91 API call using fetch
        providerMsgId = `MSG91-${Date.now()}`;
      } else if (provider === 'Twilio') {
        // Placeholder for Twilio API call
        providerMsgId = `TW-${Date.now()}`;
      }

      run(`
        INSERT INTO sms_logs (customer_id, mobile, template_name, message, provider, provider_msg_id, status, sent_by)
        VALUES (?, ?, 'udhar_reminder', ?, ?, ?, ?, ?)
      `, [cust.id, cust.mobile, messageText, provider, providerMsgId, smsStatus, req.user.id]);

      successCount++;
      results.push({ customer_id: cust.id, name: cust.name, mobile: cust.mobile, status: 'SENT', msg_id: providerMsgId });
    } catch (err) {
      failCount++;
      run(`
        INSERT INTO sms_logs (customer_id, mobile, template_name, message, provider, status, error_message, sent_by)
        VALUES (?, ?, 'udhar_reminder', ?, ?, 'FAILED', ?, ?)
      `, [cust.id, cust.mobile, messageText, provider, err.message, req.user.id]);

      results.push({ customer_id: cust.id, name: cust.name, mobile: cust.mobile, status: 'FAILED', error: err.message });
    }
  }

  logAuditAction(req.user.id, 'SEND_BULK_SMS', 'sms', null, null, { successCount, failCount, provider }, req);

  return res.json({
    success: true,
    message: `Processed ${customer_ids.length} SMS reminders (${successCount} Sent, ${failCount} Failed).`,
    successCount,
    failCount,
    results
  });
});

// SMS History Logs
router.get('/logs', requirePermission('sms', 'send'), (req, res) => {
  const logs = queryAll(`
    SELECT sl.*, c.name AS customer_name, u.username AS sent_by_user
    FROM sms_logs sl
    LEFT JOIN customers c ON sl.customer_id = c.id
    LEFT JOIN users u ON sl.sent_by = u.id
    ORDER BY sl.sent_at DESC LIMIT 100
  `);

  return res.json({ success: true, logs });
});

export default router;
