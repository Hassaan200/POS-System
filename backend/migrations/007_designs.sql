CREATE TABLE designs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

INSERT INTO designs (name) VALUES ('Moti wala'), ('Velvet'), ('Silk'), ('Dot wala'), ('Multi'), ('Dori wala'), ('Phool wala'), ('Lining wala');

ALTER TABLE purchase_lines
  ADD COLUMN design_id INT UNSIGNED NULL AFTER product_id,
  ADD CONSTRAINT fk_pl_design FOREIGN KEY (design_id) REFERENCES designs(id);