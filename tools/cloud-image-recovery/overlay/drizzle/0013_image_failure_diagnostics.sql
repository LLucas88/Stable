CREATE TABLE IF NOT EXISTS gateway_image_failures (
  request_id TEXT PRIMARY KEY NOT NULL REFERENCES gateway_requests(id),
  failure_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
