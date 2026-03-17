-- FNUCI/Bicycode declaration tracking
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS fnuci_declared boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fnuci_declared_at timestamptz;
