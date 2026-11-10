CREATE TABLE clearing_payments (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  payment_date DATE NOT NULL,
  agent_name VARCHAR(120) NULL,
  description VARCHAR(255) NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('active','void') NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_clearing_date (payment_date),
  CONSTRAINT chk_clearing_amount CHECK (amount > 0)
) ENGINE=InnoDB;