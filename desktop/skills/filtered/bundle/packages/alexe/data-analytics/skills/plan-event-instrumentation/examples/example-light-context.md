## Input
We're building a new search feature in our app and want to track how it's being used. We care about whether users find what they're looking for. We use Amplitude. Not sure what events to track exactly.

## Expected output
Event tracking plan (draft — requires confirmation on activation definition and search flow):

| Event name | Trigger | Required properties |
|---|---|---|
| search_initiated | User submits a search query | user_id, query_text (or hash if PII concern), session_id, source (where search was opened from) |
| search_results_viewed | Search results page loads with results | user_id, query_text, results_count, session_id |
| search_result_clicked | User clicks a result | user_id, query_text, result_position, result_id, result_type, session_id |
| search_no_results | Query returns zero results | user_id, query_text, session_id |
| search_abandoned | User closes search without clicking a result | user_id, query_text, results_count, session_id |

Naming convention:
Follows search_[action] pattern. Confirm against your existing taxonomy before implementing.

Funnel events:
- Entry: search_initiated
- Success signal: search_result_clicked (user found something worth clicking)
- Failure signal: search_no_results or search_abandoned after viewing results

Coverage check:
"Whether users find what they're looking for" requires a success definition. Click on a result is a proxy but not a guarantee. If the product allows post-search confirmation (e.g., the user completes a task after a search), that event should also be tracked.

Missing information that would improve this plan:
- What does the search flow look like step by step?
- Is there a downstream action after finding a result that would confirm success?
- Does query_text contain PII? If so, hashing or exclusion policy needs to be defined before shipping
- What is the existing event naming taxonomy?

Confidence level:
Context-informed
