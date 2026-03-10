-- Colonne pour stocker l'URL du bon de livraison PDF
ALTER TABLE livraisons ADD COLUMN IF NOT EXISTS attestation_pdf_url TEXT DEFAULT NULL;

-- Bucket storage pour les documents
INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true) ON CONFLICT (id) DO NOTHING;
