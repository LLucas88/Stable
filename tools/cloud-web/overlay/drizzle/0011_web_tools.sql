CREATE TABLE IF NOT EXISTS web_tool_prices (
  price_version_id TEXT PRIMARY KEY REFERENCES model_prices(id),
  request_micros INTEGER NOT NULL CHECK (typeof(request_micros) = 'integer' AND request_micros BETWEEN 0 AND 9007199254740991)
);
CREATE TRIGGER IF NOT EXISTS web_price_update_guard BEFORE UPDATE ON web_tool_prices
WHEN EXISTS (SELECT 1 FROM gateway_requests WHERE price_version_id = OLD.price_version_id)
BEGIN SELECT RAISE(ABORT, 'web_price_version_in_use'); END;
CREATE TRIGGER IF NOT EXISTS web_price_delete_guard BEFORE DELETE ON web_tool_prices
WHEN EXISTS (SELECT 1 FROM gateway_requests WHERE price_version_id = OLD.price_version_id)
BEGIN SELECT RAISE(ABORT, 'web_price_version_in_use'); END;
CREATE TABLE IF NOT EXISTS gateway_web_results (
  request_id TEXT PRIMARY KEY REFERENCES gateway_requests(id),
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS web_result_state_guard BEFORE INSERT ON gateway_web_results
WHEN NOT EXISTS (SELECT 1 FROM gateway_requests WHERE id = NEW.request_id AND state = 'inflight')
BEGIN SELECT RAISE(ABORT, 'web_request_not_inflight'); END;
