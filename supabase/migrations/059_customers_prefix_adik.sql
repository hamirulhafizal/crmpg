-- Allow "Adik" honorific for customers under 18
ALTER TABLE customers DROP CONSTRAINT IF EXISTS customers_prefix_check;

ALTER TABLE customers ADD CONSTRAINT customers_prefix_check
  CHECK (prefix IN ('En', 'Pn', 'Cik', 'Tn', 'Adik'));
