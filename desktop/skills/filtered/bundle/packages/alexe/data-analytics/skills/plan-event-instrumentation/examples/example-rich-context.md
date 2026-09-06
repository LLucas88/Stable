## Input
We're shipping a "collections" feature to our B2B project management SaaS. Collections let users group tasks into named folders and share them with teammates. Key metrics we need to track: collection creation rate, sharing adoption, and whether shared collections drive team activation. We use Segment feeding into Amplitude. Existing event taxonomy uses object_action format (e.g., task_created, project_archived). Need a tracking plan before the sprint ends — engineering can implement during the build.

## Expected output
Event tracking plan:

| Event name | Trigger | Required properties |
|---|---|---|
| collection_created | User saves a new collection | user_id, collection_id, workspace_id, task_count, created_from (sidebar / task_context_menu / shortcut) |
| collection_edited | User renames or changes collection properties | user_id, collection_id, workspace_id, field_changed |
| collection_shared | User shares a collection with a teammate | user_id, collection_id, workspace_id, share_method (invite_link / direct_user), recipient_count |
| collection_viewed | User opens a collection | user_id, collection_id, workspace_id, viewer_role (owner / collaborator), source (notification / direct_link / sidebar) |
| collection_task_added | User adds a task to a collection | user_id, collection_id, task_id, workspace_id |
| collection_deleted | User deletes a collection | user_id, collection_id, workspace_id, task_count_at_deletion |

Naming convention:
Follows existing object_action format. Object: collection. Actions: created, edited, shared, viewed, task_added, deleted.

Funnel events:
- Entry: collection_created (user creates their first collection)
- Key activation signal: collection_shared (sharing is the primary value delivery for team use)
- Engagement depth: collection_task_added (indicates active use)

Identity and session tracking:
Use existing Segment user_id and session_id. workspace_id is required on all events to support team-level analysis.

Coverage check:
- Collection creation rate: covered by collection_created
- Sharing adoption: covered by collection_shared (share_method property allows breakdown)
- Team activation: covered by collection_viewed with viewer_role = collaborator (non-owner views indicate cross-team spread)

Engineering implementation notes:
- collection_id must be assigned server-side at creation, not client-side, to avoid duplicate IDs
- source property on collection_viewed requires the client to pass referrer context — coordinate with FE
- All events should fire on confirmed user action, not on UI element render

Events not covered and why:
- Collection search / filter usage: not a priority metric for this sprint, can be added in v2
- Collection export: feature not in scope for this release
