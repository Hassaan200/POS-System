CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(255) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE sequences (
  name VARCHAR(30) PRIMARY KEY,
  value INT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;

CREATE TABLE categories (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE fabric_types (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  category_id INT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  UNIQUE KEY uq_type (category_id, name),
  CONSTRAINT fk_type_category FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

CREATE TABLE products (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  category_id INT UNSIGNED NOT NULL,
  fabric_type_id INT UNSIGNED NULL,
  opening_stock DECIMAL(12,2) NOT NULL DEFAULT 0,
  purchase_cost DECIMAL(14,2) NOT NULL DEFAULT 0,
  selling_rate DECIMAL(14,2) NOT NULL DEFAULT 0,
  purchased_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  sold_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_qty DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock_value DECIMAL(16,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES categories(id),
  CONSTRAINT fk_product_type FOREIGN KEY (fabric_type_id) REFERENCES fabric_types(id),
  CONSTRAINT chk_opening CHECK (opening_stock >= 0),
  CONSTRAINT chk_rates CHECK (purchase_cost >= 0 AND selling_rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE suppliers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(30) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_sup_opening CHECK (opening_balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE customers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  mobile VARCHAR(30) NULL,
  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_cus_opening CHECK (opening_balance >= 0)
) ENGINE=InnoDB;

CREATE TABLE purchases (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(30) NOT NULL UNIQUE,
  purchase_date DATE NOT NULL,
  supplier_id INT UNSIGNED NOT NULL,
  total_amount DECIMAL(14,2) NOT NULL,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  notes VARCHAR(255) NULL,
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  KEY idx_purchase_date (purchase_date),
  KEY idx_purchase_supplier (supplier_id),
  CONSTRAINT fk_purchase_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB;

CREATE TABLE purchase_lines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  rate DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_pl_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  CONSTRAINT fk_pl_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_pl CHECK (quantity > 0 AND rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE sales (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ref VARCHAR(30) NOT NULL UNIQUE,
  sale_date DATE NOT NULL,
  customer_id INT UNSIGNED NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(14,2) NOT NULL,
  status ENUM('active','cancelled') NOT NULL DEFAULT 'active',
  notes VARCHAR(255) NULL,
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  KEY idx_sale_date (sale_date),
  KEY idx_sale_customer (customer_id),
  CONSTRAINT fk_sale_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB;

CREATE TABLE sale_lines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id INT UNSIGNED NOT NULL,
  product_id INT UNSIGNED NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  rate DECIMAL(14,2) NOT NULL,
  line_total DECIMAL(14,2) NOT NULL,
  discount_share DECIMAL(14,2) NOT NULL DEFAULT 0,
  cogs DECIMAL(14,2) NOT NULL,
  CONSTRAINT fk_sl_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT fk_sl_product FOREIGN KEY (product_id) REFERENCES products(id),
  CONSTRAINT chk_sl CHECK (quantity > 0 AND rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE customer_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id INT UNSIGNED NULL,
  sale_id INT UNSIGNED NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  notes VARCHAR(255) NULL,
  status ENUM('active','void') NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_cp_customer (customer_id),
  KEY idx_cp_sale (sale_id),
  KEY idx_cp_date (payment_date),
  CONSTRAINT fk_cp_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_cp_sale FOREIGN KEY (sale_id) REFERENCES sales(id),
  CONSTRAINT chk_cp CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE supplier_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT UNSIGNED NOT NULL,
  purchase_id INT UNSIGNED NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  notes VARCHAR(255) NULL,
  status ENUM('active','void') NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sp_supplier (supplier_id),
  KEY idx_sp_purchase (purchase_id),
  KEY idx_sp_date (payment_date),
  CONSTRAINT fk_sp_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
  CONSTRAINT fk_sp_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  CONSTRAINT chk_sp CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id INT UNSIGNED NOT NULL,
  movement_type ENUM('opening','purchase','sale','purchase_cancel','sale_cancel') NOT NULL,
  quantity DECIMAL(12,2) NOT NULL,
  value_change DECIMAL(16,2) NOT NULL,
  ref_type VARCHAR(20) NULL,
  ref_id INT UNSIGNED NULL,
  movement_date DATE NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sm_product (product_id),
  KEY idx_sm_ref (ref_type, ref_id),
  CONSTRAINT fk_sm_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NULL,
  action VARCHAR(60) NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id INT UNSIGNED NULL,
  details VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_entity (entity, entity_id)
) ENGINE=InnoDB;

INSERT INTO settings (setting_key, setting_value) VALUES
  ('shop_name', 'Fabric Shop'),
  ('currency', 'PKR'),
  ('allow_oversell', '0'),
  ('timezone', 'Asia/Karachi');

INSERT INTO sequences (name, value) VALUES ('purchase', 0), ('sale', 0);

INSERT INTO categories (name) VALUES ('Fancy Fabric'), ('China Fabric');

INSERT INTO fabric_types (category_id, name)
  SELECT id, 'Kardana' FROM categories WHERE name = 'Fancy Fabric';
INSERT INTO fabric_types (category_id, name)
  SELECT id, 'Leelan' FROM categories WHERE name = 'Fancy Fabric';
