ALTER TABLE products
  ADD COLUMN set_name VARCHAR(100) NULL AFTER name,
  ADD COLUMN part VARCHAR(20) NULL AFTER set_name,
  ADD KEY idx_product_set (set_name);

ALTER TABLE purchase_lines
  MODIFY rate DECIMAL(14,4) NOT NULL,
  ADD COLUMN rate_unit VARCHAR(10) NOT NULL DEFAULT 'yard' AFTER rate;

ALTER TABLE sale_lines
  MODIFY rate DECIMAL(14,4) NOT NULL,
  ADD COLUMN rate_unit VARCHAR(10) NOT NULL DEFAULT 'yard' AFTER rate;

CREATE TABLE purchase_line_pieces (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_line_id INT UNSIGNED NOT NULL,
  seq SMALLINT UNSIGNED NOT NULL,
  length DECIMAL(10,2) NOT NULL,
  KEY idx_plp_line (purchase_line_id),
  CONSTRAINT fk_plp_line FOREIGN KEY (purchase_line_id) REFERENCES purchase_lines(id),
  CONSTRAINT chk_plp_length CHECK (length > 0)
) ENGINE=InnoDB;