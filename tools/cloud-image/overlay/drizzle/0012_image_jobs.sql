-- Durable provider task handles. Existing receipts and billing are untouched.
CREATE TABLE IF NOT EXISTS gateway_image_jobs (
  request_id TEXT PRIMARY KEY REFERENCES gateway_requests(id),
  task_id TEXT NOT NULL,
  model_json TEXT NOT NULL,
  image_micros INTEGER NOT NULL CHECK (image_micros >= 0),
  billing_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
