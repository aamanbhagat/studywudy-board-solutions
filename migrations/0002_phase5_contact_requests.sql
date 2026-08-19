CREATE TABLE IF NOT EXISTS phase5_contact_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  submitted_by_role TEXT NOT NULL CHECK (
    submitted_by_role IN ('parent_guardian', 'teacher', 'adult_data_principal', 'other_adult')
  ),
  adult_name TEXT NOT NULL CHECK (length(adult_name) BETWEEN 2 AND 80),
  adult_email TEXT NOT NULL CHECK (length(adult_email) BETWEEN 3 AND 160),
  request_type TEXT NOT NULL CHECK (
    request_type IN ('privacy', 'grievance', 'content_correction', 'copyright', 'technical', 'other')
  ),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 20 AND 3000),
  adult_attested INTEGER NOT NULL CHECK (adult_attested = 1),
  status TEXT NOT NULL DEFAULT 'new' CHECK (
    status IN ('new', 'in_review', 'resolved', 'legal_hold')
  ),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
) STRICT;

CREATE INDEX IF NOT EXISTS phase5_contact_requests_status_idx
  ON phase5_contact_requests (status, created_at);

CREATE INDEX IF NOT EXISTS phase5_contact_requests_expiry_idx
  ON phase5_contact_requests (expires_at, status);
