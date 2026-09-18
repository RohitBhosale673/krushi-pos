import express from 'express';
import { queryOne, queryAll, run, transaction } from '../db/connection.js';
import { authenticateToken, requirePermission, logAuditAction, getTenantScope } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

// List / Search Products with Batch & Stock aggregation
router.get('/', requirePermission('products', 'view'), async (req, res) => {
  try {
    const { search, category_id, brand_id, product_type } = req.query;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT p.*, 
             c.name AS category_name, 
             b.name AS brand_name, 
             u.symbol AS unit_symbol,
             u.allow_decimal,
             COALESCE(SUM(pb.available_qty), 0) AS total_available_qty,
             COUNT(DISTINCT pb.id) AS batch_count
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      LEFT JOIN product_batches pb ON p.id = pb.product_id AND pb.status != 'Blocked'
      WHERE 1=1
    `;

    const params = [];

    if (tenantScope !== null) {
      sql += ` AND p.tenant_id = ?`;
      params.push(tenantScope);
    }

    if (search) {
      sql += ` AND (p.name LIKE ? OR p.product_code LIKE ? OR p.sku LIKE ? OR p.barcode LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    if (category_id) {
      sql += ` AND p.category_id = ?`;
      params.push(category_id);
    }

    if (brand_id) {
      sql += ` AND p.brand_id = ?`;
      params.push(brand_id);
    }

    if (product_type) {
      sql += ` AND p.product_type = ?`;
      params.push(product_type);
    }

    sql += ` GROUP BY p.id ORDER BY p.name ASC`;

    const products = await queryAll(sql, params);
    return res.json({ success: true, products });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Master Data: Categories, Brands, Units
router.get('/masters/all', requirePermission('products', 'view'), async (req, res) => {
  try {
    const categories = await queryAll('SELECT * FROM categories ORDER BY name ASC');
    const brands = await queryAll('SELECT * FROM brands ORDER BY name ASC');
    const units = await queryAll('SELECT * FROM units ORDER BY name ASC');
    return res.json({ success: true, categories, brands, units });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Get Single Product details including all active batches
router.get('/:id', requirePermission('products', 'view'), async (req, res) => {
  try {
    const productId = req.params.id;
    const tenantScope = getTenantScope(req);

    let sql = `
      SELECT p.*, c.name AS category_name, b.name AS brand_name, u.symbol AS unit_symbol
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN units u ON p.primary_unit_id = u.id
      WHERE p.id = ?
    `;
    const params = [productId];

    if (tenantScope !== null) {
      sql += ` AND p.tenant_id = ?`;
      params.push(tenantScope);
    }

    const product = await queryOne(sql, params);

    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const batches = await queryAll(`
      SELECT * FROM product_batches 
      WHERE product_id = ? 
      ORDER BY exp_date ASC
    `, [productId]);

    const stockMovements = await queryAll(`
      SELECT sm.*, pb.batch_no, u.username
      FROM stock_movements sm
      LEFT JOIN product_batches pb ON sm.batch_id = pb.id
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.product_id = ?
      ORDER BY sm.created_at DESC LIMIT 30
    `, [productId]);

    return res.json({ success: true, product, batches, stockMovements });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Create New Product
router.post('/', requirePermission('products', 'manage'), async (req, res) => {
  const {
    name, product_code, sku, barcode, category_id, brand_id, product_type,
    description, primary_unit_id, secondary_unit_id, conversion_factor,
    purchase_price, selling_price, mrp, wholesale_price, retail_price,
    gst_rate, hsn_code, min_stock, max_stock, reorder_level,
    opening_stock, batch_no, exp_date
  } = req.body;

  if (!name || !product_code || !product_type || !primary_unit_id) {
    return res.status(400).json({
      success: false,
      message: 'Product Name, Product Code, Product Type, and Primary Unit are required.'
    });
  }

  try {
    const tenantScope = getTenantScope(req);
    const assignedTenantId = tenantScope !== null ? tenantScope : (req.body.tenant_id || 1);

    // Enforce Tenant Product Catalog Quota
    if (req.user.tenant && req.user.tenant.max_products) {
      const prodCountRow = await queryOne('SELECT COUNT(*) AS cnt FROM products WHERE tenant_id = ?', [assignedTenantId]);
      const currentCount = prodCountRow?.cnt || 0;
      if (currentCount >= req.user.tenant.max_products) {
        return res.status(400).json({
          success: false,
          message: `Product limit reached (${currentCount} / ${req.user.tenant.max_products} products in catalog). Contact Super Admin to upgrade.`
        });
      }
    }

    const existing = await queryOne('SELECT id FROM products WHERE product_code = ? AND tenant_id = ?', [product_code.trim(), assignedTenantId]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Product code already exists in your organization.' });
    }

    let newProdId;
    const parsedOpeningStock = parseFloat(opening_stock) || 0;

    await transaction(async () => {
      const resProd = await run(`
        INSERT INTO products (
          tenant_id, name, product_code, sku, barcode, category_id, brand_id, product_type,
          description, primary_unit_id, secondary_unit_id, conversion_factor,
          purchase_price, selling_price, mrp, wholesale_price, retail_price,
          gst_rate, hsn_code, min_stock, max_stock, reorder_level, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
      `, [
        assignedTenantId,
        name.trim(),
        product_code.trim(),
        sku ? sku.trim() : null,
        barcode ? barcode.trim() : null,
        category_id ? parseInt(category_id) : null,
        brand_id ? parseInt(brand_id) : null,
        product_type,
        description || null,
        parseInt(primary_unit_id),
        secondary_unit_id ? parseInt(secondary_unit_id) : null,
        parseFloat(conversion_factor) || 1.0,
        parseFloat(purchase_price) || 0,
        parseFloat(selling_price) || 0,
        parseFloat(mrp) || 0,
        wholesale_price ? parseFloat(wholesale_price) : (parseFloat(selling_price) || 0),
        retail_price ? parseFloat(retail_price) : (parseFloat(selling_price) || 0),
        parseFloat(gst_rate) || 0,
        hsn_code ? hsn_code.trim() : null,
        parseFloat(min_stock) || 10,
        parseFloat(max_stock) || 1000,
        parseFloat(reorder_level) || 20
      ]);

      newProdId = resProd.lastInsertRowid;

      if (parsedOpeningStock > 0) {
        const cleanBatchNo = (batch_no && String(batch_no).trim() !== '')
          ? String(batch_no).trim()
          : `BATCH-${Date.now().toString().slice(-6)}`;
        const defaultExpDate = (exp_date && String(exp_date).trim() !== '')
          ? String(exp_date).trim()
          : new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const resBatch = await run(`
          INSERT INTO product_batches (
            tenant_id, product_id, batch_no, mfg_date, exp_date,
            purchase_rate, selling_rate, mrp,
            qty_received, available_qty, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
        `, [
          assignedTenantId,
          newProdId,
          cleanBatchNo,
          new Date().toISOString().split('T')[0],
          defaultExpDate,
          purchase_price || 0,
          selling_price || 0,
          mrp || 0,
          parsedOpeningStock,
          parsedOpeningStock
        ]);

        await run(`
          INSERT INTO stock_movements (
            tenant_id, product_id, batch_id, movement_type,
            qty_change, previous_qty, new_qty,
            reference_type, reference_id, notes, user_id
          ) VALUES (?, ?, ?, 'opening_stock', ?, 0, ?, 'product_creation', ?, 'Initial opening stock entry', ?)
        `, [
          assignedTenantId,
          newProdId,
          resBatch.lastInsertRowid,
          parsedOpeningStock,
          parsedOpeningStock,
          String(newProdId),
          req.user.id
        ]);
      }
    });

    logAuditAction(req.user.id, 'CREATE_PRODUCT', 'products', newProdId, null, { name, product_code, opening_stock: parsedOpeningStock }, req);

    return res.json({
      success: true,
      message: parsedOpeningStock > 0
        ? `Product added successfully with ${parsedOpeningStock} units opening stock.`
        : 'Product added successfully.',
      productId: newProdId
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Update Product & Manage Stock
router.put('/:id', requirePermission('products', 'manage'), async (req, res) => {
  const productId = req.params.id;
  const tenantScope = getTenantScope(req);

  try {
    let checkSql = 'SELECT * FROM products WHERE id = ?';
    const checkParams = [productId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const oldProduct = await queryOne(checkSql, checkParams);
    if (!oldProduct) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    const {
      name, sku, barcode, category_id, brand_id, product_type,
      primary_unit_id, purchase_price, selling_price, mrp, wholesale_price, retail_price,
      gst_rate, hsn_code, min_stock, max_stock, reorder_level, is_active, description,
      current_stock, stock_notes
    } = req.body;

    const cleanName = (name !== undefined && name !== null && String(name).trim() !== '') ? String(name).trim() : oldProduct.name;
    const cleanSku = (sku !== undefined && sku !== null && String(sku).trim() !== '') ? String(sku).trim() : null;
    const cleanBarcode = (barcode !== undefined && barcode !== null && String(barcode).trim() !== '') ? String(barcode).trim() : null;
    const cleanCatId = (category_id !== undefined && category_id !== null && String(category_id).trim() !== '') ? parseInt(category_id) : null;
    const cleanBrandId = (brand_id !== undefined && brand_id !== null && String(brand_id).trim() !== '') ? parseInt(brand_id) : null;
    const cleanProductType = (product_type !== undefined && product_type !== null && String(product_type).trim() !== '') ? product_type : oldProduct.product_type;
    const cleanUnitId = (primary_unit_id !== undefined && primary_unit_id !== null && String(primary_unit_id).trim() !== '') ? parseInt(primary_unit_id) : oldProduct.primary_unit_id;
    const cleanPurchasePrice = (purchase_price !== undefined && purchase_price !== null && purchase_price !== '') ? parseFloat(purchase_price) : oldProduct.purchase_price;
    const cleanSellingPrice = (selling_price !== undefined && selling_price !== null && selling_price !== '') ? parseFloat(selling_price) : oldProduct.selling_price;
    const cleanMrp = (mrp !== undefined && mrp !== null && mrp !== '') ? parseFloat(mrp) : oldProduct.mrp;
    const cleanWholesale = (wholesale_price !== undefined && wholesale_price !== null && wholesale_price !== '') ? parseFloat(wholesale_price) : (selling_price !== undefined && selling_price !== null && selling_price !== '' ? parseFloat(selling_price) : oldProduct.wholesale_price);
    const cleanRetail = (retail_price !== undefined && retail_price !== null && retail_price !== '') ? parseFloat(retail_price) : (selling_price !== undefined && selling_price !== null && selling_price !== '' ? parseFloat(selling_price) : oldProduct.retail_price);
    const cleanGst = (gst_rate !== undefined && gst_rate !== null && gst_rate !== '') ? parseFloat(gst_rate) : oldProduct.gst_rate;
    const cleanHsn = (hsn_code !== undefined && hsn_code !== null && String(hsn_code).trim() !== '') ? String(hsn_code).trim() : null;
    const cleanMinStock = (min_stock !== undefined && min_stock !== null && min_stock !== '') ? parseFloat(min_stock) : oldProduct.min_stock;
    const cleanMaxStock = (max_stock !== undefined && max_stock !== null && max_stock !== '') ? parseFloat(max_stock) : oldProduct.max_stock;
    const cleanReorderLevel = (reorder_level !== undefined && reorder_level !== null && reorder_level !== '') ? parseFloat(reorder_level) : oldProduct.reorder_level;
    const cleanIsActive = (is_active !== undefined && is_active !== null) ? (is_active ? 1 : 0) : oldProduct.is_active;
    const cleanDesc = (description !== undefined && description !== null && String(description).trim() !== '') ? String(description).trim() : null;

    await transaction(async () => {
      await run(`
        UPDATE products SET
          name = ?,
          sku = ?,
          barcode = ?,
          category_id = ?,
          brand_id = ?,
          product_type = ?,
          primary_unit_id = ?,
          purchase_price = ?,
          selling_price = ?,
          mrp = ?,
          wholesale_price = ?,
          retail_price = ?,
          gst_rate = ?,
          hsn_code = ?,
          min_stock = ?,
          max_stock = ?,
          reorder_level = ?,
          is_active = ?,
          description = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        cleanName, cleanSku, cleanBarcode, cleanCatId, cleanBrandId, cleanProductType,
        cleanUnitId, cleanPurchasePrice, cleanSellingPrice, cleanMrp, cleanWholesale, cleanRetail,
        cleanGst, cleanHsn, cleanMinStock, cleanMaxStock, cleanReorderLevel, cleanIsActive, cleanDesc, productId
      ]);

      // Sync active batch prices
      await run(`
        UPDATE product_batches
        SET selling_rate = ?, mrp = ?, purchase_rate = ?
        WHERE product_id = ? AND status = 'Active'
      `, [cleanSellingPrice, cleanMrp, cleanPurchasePrice, productId]);

      // If current_stock is provided, handle stock adjustment directly
      if (current_stock !== undefined && current_stock !== null && current_stock !== '') {
        const targetStock = Math.max(0, parseFloat(current_stock));
        const stockRow = await queryOne(`
          SELECT COALESCE(SUM(available_qty), 0) AS total_qty
          FROM product_batches
          WHERE product_id = ? AND status != 'Blocked'
        `, [productId]);

        const currentTotal = stockRow?.total_qty || 0;
        const diff = targetStock - currentTotal;

        if (Math.abs(diff) > 0.001) {
          const activeBatch = await queryOne(`
            SELECT * FROM product_batches
            WHERE product_id = ? AND status = 'Active'
            ORDER BY exp_date DESC LIMIT 1
          `, [productId]);

          if (activeBatch) {
            const newBatchQty = Math.max(0, activeBatch.available_qty + diff);
            await run(`
              UPDATE product_batches
              SET available_qty = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [newBatchQty, activeBatch.id]);

            await run(`
              INSERT INTO stock_movements (
                tenant_id, product_id, batch_id, movement_type,
                qty_change, previous_qty, new_qty,
                reference_type, notes, user_id
              ) VALUES (?, ?, ?, 'stock_adjustment', ?, ?, ?, 'product_master_edit', ?, ?)
            `, [
              oldProduct.tenant_id,
              productId,
              activeBatch.id,
              diff,
              currentTotal,
              targetStock,
              stock_notes || 'Stock updated from Product Master',
              req.user.id
            ]);
          } else {
            const defaultExp = new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            const resBatch = await run(`
              INSERT INTO product_batches (
                tenant_id, product_id, batch_no, mfg_date, exp_date,
                purchase_rate, selling_rate, mrp,
                qty_received, available_qty, status
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
            `, [
              oldProduct.tenant_id,
              productId,
              `BATCH-${Date.now().toString().slice(-6)}`,
              new Date().toISOString().split('T')[0],
              defaultExp,
              cleanPurchasePrice,
              cleanSellingPrice,
              cleanMrp,
              targetStock,
              targetStock
            ]);

            await run(`
              INSERT INTO stock_movements (
                tenant_id, product_id, batch_id, movement_type,
                qty_change, previous_qty, new_qty,
                reference_type, notes, user_id
              ) VALUES (?, ?, ?, 'stock_adjustment', ?, 0, ?, 'product_master_edit', ?, ?)
            `, [
              oldProduct.tenant_id,
              productId,
              resBatch.lastInsertRowid,
              targetStock,
              targetStock,
              stock_notes || 'Initial batch created from Product Master edit',
              req.user.id
            ]);
          }
        }
      }
    });

    logAuditAction(req.user.id, 'UPDATE_PRODUCT', 'products', productId, oldProduct, req.body, req);

    return res.json({ success: true, message: 'Product and stock details updated successfully.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Quick Stock Adjustment Endpoint
router.post('/:id/adjust-stock', requirePermission('products', 'manage'), async (req, res) => {
  const productId = req.params.id;
  const { new_stock, qty_change, adjustment_type = 'set', notes, batch_no, exp_date } = req.body;
  const tenantScope = getTenantScope(req);

  try {
    let checkSql = 'SELECT * FROM products WHERE id = ?';
    const checkParams = [productId];
    if (tenantScope !== null) {
      checkSql += ' AND tenant_id = ?';
      checkParams.push(tenantScope);
    }

    const product = await queryOne(checkSql, checkParams);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found.' });
    }

    let finalStock = 0;
    await transaction(async () => {
      const stockRow = await queryOne(`
        SELECT COALESCE(SUM(available_qty), 0) AS total_qty
        FROM product_batches
        WHERE product_id = ? AND status != 'Blocked'
      `, [productId]);

      const currentTotal = stockRow?.total_qty || 0;

      if (adjustment_type === 'delta') {
        const delta = parseFloat(qty_change) || 0;
        finalStock = Math.max(0, currentTotal + delta);
      } else {
        finalStock = Math.max(0, parseFloat(new_stock) || 0);
      }

      const diff = finalStock - currentTotal;
      if (Math.abs(diff) < 0.001) {
        return;
      }

      const activeBatch = await queryOne(`
        SELECT * FROM product_batches
        WHERE product_id = ? AND status = 'Active'
        ORDER BY exp_date DESC LIMIT 1
      `, [productId]);

      if (activeBatch) {
        const newBatchQty = Math.max(0, activeBatch.available_qty + diff);
        await run(`
          UPDATE product_batches
          SET available_qty = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [newBatchQty, activeBatch.id]);

        await run(`
          INSERT INTO stock_movements (
            tenant_id, product_id, batch_id, movement_type,
            qty_change, previous_qty, new_qty,
            reference_type, notes, user_id
          ) VALUES (?, ?, ?, 'stock_adjustment', ?, ?, ?, 'quick_stock_adjust', ?, ?)
        `, [
          product.tenant_id,
          productId,
          activeBatch.id,
          diff,
          currentTotal,
          finalStock,
          notes || 'Quick stock adjustment from Product Master',
          req.user.id
        ]);
      } else {
        const defaultBatchNo = (batch_no && String(batch_no).trim() !== '')
          ? String(batch_no).trim()
          : `BATCH-${Date.now().toString().slice(-6)}`;
        const defaultExp = (exp_date && String(exp_date).trim() !== '')
          ? String(exp_date).trim()
          : new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const resBatch = await run(`
          INSERT INTO product_batches (
            tenant_id, product_id, batch_no, mfg_date, exp_date,
            purchase_rate, selling_rate, mrp,
            qty_received, available_qty, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')
        `, [
          product.tenant_id,
          productId,
          defaultBatchNo,
          new Date().toISOString().split('T')[0],
          defaultExp,
          product.purchase_price,
          product.selling_price,
          product.mrp,
          finalStock,
          finalStock
        ]);

        await run(`
          INSERT INTO stock_movements (
            tenant_id, product_id, batch_id, movement_type,
            qty_change, previous_qty, new_qty,
            reference_type, notes, user_id
          ) VALUES (?, ?, ?, 'stock_adjustment', ?, 0, ?, 'quick_stock_adjust', ?, ?)
        `, [
          product.tenant_id,
          productId,
          resBatch.lastInsertRowid,
          finalStock,
          finalStock,
          notes || 'Opening batch created via quick stock adjustment',
          req.user.id
        ]);
      }
    });

    logAuditAction(req.user.id, 'ADJUST_PRODUCT_STOCK', 'products', productId, null, { new_stock: finalStock, notes }, req);

    return res.json({
      success: true,
      message: `Stock for ${product.name} updated to ${finalStock} units.`,
      newStock: finalStock
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/masters/category', requirePermission('products', 'manage'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    const resCat = await run('INSERT INTO categories (name, description) VALUES (?, ?)', [name, description || null]);
    return res.json({ success: true, message: 'Category created', id: resCat.lastInsertRowid });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/masters/brand', requirePermission('products', 'manage'), async (req, res) => {
  try {
    const { name, contact_person, mobile } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Brand name is required.' });
    const resBrand = await run('INSERT INTO brands (name, contact_person, mobile) VALUES (?, ?, ?)', [name, contact_person || null, mobile || null]);
    return res.json({ success: true, message: 'Brand created', id: resBrand.lastInsertRowid });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
