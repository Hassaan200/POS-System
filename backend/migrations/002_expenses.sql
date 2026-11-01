CREATE TABLE expenses (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  expense_date DATE NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'other',
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  status ENUM('active','void') NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_expense_date (expense_date),
  CONSTRAINT chk_expense_amount CHECK (amount > 0)
) ENGINE=InnoDB;