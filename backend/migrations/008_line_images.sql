CREATE TABLE purchase_line_images (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  purchase_line_id INT UNSIGNED NOT NULL,
  mime VARCHAR(20) NOT NULL,
  data MEDIUMBLOB NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_pli_line (purchase_line_id),
  CONSTRAINT fk_pli_line FOREIGN KEY (purchase_line_id) REFERENCES purchase_lines(id)
) ENGINE=InnoDB;