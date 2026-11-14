CREATE TABLE containers (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  delivery_date DATE NOT NULL,
  container_no VARCHAR(40) NOT NULL,
  party_name VARCHAR(120) NOT NULL,
  weight_kg DECIMAL(12,2) NOT NULL,
  bales INT UNSIGNED NOT NULL,
  status ENUM('active','void') NOT NULL DEFAULT 'active',
  idempotency_key VARCHAR(64) NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_containers_date (delivery_date),
  KEY idx_containers_no (container_no),
  CONSTRAINT chk_container_weight CHECK (weight_kg >= 0)
) ENGINE=InnoDB;