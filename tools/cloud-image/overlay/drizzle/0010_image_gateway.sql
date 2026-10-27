-- Additive only: no existing account, quota or conversation rows are rewritten.
CREATE TABLE IF NOT EXISTS image_prices (
  price_version_id TEXT PRIMARY KEY REFERENCES model_prices(id),
  image_micros INTEGER NOT NULL CHECK (typeof(image_micros) = 'integer' AND image_micros BETWEEN 0 AND 9007199254740991)
);
CREATE TRIGGER IF NOT EXISTS image_price_update_guard BEFORE UPDATE ON image_prices
WHEN EXISTS (SELECT 1 FROM gateway_requests WHERE price_version_id = OLD.price_version_id)
BEGIN SELECT RAISE(ABORT, 'image_price_version_in_use'); END;
CREATE TRIGGER IF NOT EXISTS image_price_delete_guard BEFORE DELETE ON image_prices
WHEN EXISTS (SELECT 1 FROM gateway_requests WHERE price_version_id = OLD.price_version_id)
BEGIN SELECT RAISE(ABORT, 'image_price_version_in_use'); END;
CREATE TABLE IF NOT EXISTS gateway_image_results (
  request_id TEXT PRIMARY KEY REFERENCES gateway_requests(id),
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS image_result_state_guard BEFORE INSERT ON gateway_image_results
WHEN NOT EXISTS (SELECT 1 FROM gateway_requests WHERE id = NEW.request_id AND state = 'inflight')
BEGIN SELECT RAISE(ABORT, 'image_request_not_inflight'); END;
