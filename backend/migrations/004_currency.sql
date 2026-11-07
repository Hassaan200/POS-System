ALTER TABLE suppliers ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'PKR' AFTER mobile;
ALTER TABLE suppliers ALTER COLUMN currency SET DEFAULT 'CNY';

ALTER TABLE purchases
  ADD COLUMN currency VARCHAR(3) NOT NULL DEFAULT 'PKR' AFTER supplier_id,
  ADD COLUMN exchange_rate DECIMAL(14,4) NOT NULL DEFAULT 1 AFTER currency;

ALTER TABLE purchase_lines ADD COLUMN cost_pkr DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER line_total;
UPDATE purchase_lines SET cost_pkr = line_total;

ALTER TABLE supplier_payments ADD COLUMN exchange_rate DECIMAL(14,4) NOT NULL DEFAULT 1 AFTER amount;

ALTER TABLE stock_movements
  MODIFY movement_type ENUM('opening','purchase','sale','purchase_cancel','sale_cancel','cost_add','cost_void') NOT NULL;

CREATE TABLE purchase_costs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_id INT UNSIGNED NOT NULL,
  cost_date DATE NOT NULL,
  kind VARCHAR(20) NOT NULL,
  description VARCHAR(255) NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('active','void') NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pc_purchase (purchase_id),
  CONSTRAINT fk_pc_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(id),
  CONSTRAINT chk_pc_amount CHECK (amount > 0)
) ENGINE=InnoDB;

CREATE TABLE purchase_cost_shares (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cost_id INT UNSIGNED NOT NULL,
  purchase_line_id INT UNSIGNED NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  KEY idx_pcs_cost (cost_id),
  CONSTRAINT fk_pcs_cost FOREIGN KEY (cost_id) REFERENCES purchase_costs(id),
  CONSTRAINT fk_pcs_line FOREIGN KEY (purchase_line_id) REFERENCES purchase_lines(id)
) ENGINE=InnoDB;

INSERT INTO settings (setting_key, setting_value) VALUES ('cny_pkr_rate', '0');