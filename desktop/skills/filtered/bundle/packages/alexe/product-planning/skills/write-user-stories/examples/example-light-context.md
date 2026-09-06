## Input
We're adding a comment feature to our project management tool. Users should be able to leave comments on tasks. Write user stories.

## Expected output
Story set organized by epic:

---

**Epic 1: Create and view comments**

Story 1.1: Add a comment to a task
As a team member, I want to leave a comment on a task, so I can share context or ask questions without leaving the task view.

Acceptance criteria (draft):
- Given a user is viewing a task, when they type in the comment field and submit, the comment is saved and displayed below the task description
- Comment shows: author name, timestamp, comment text
- Comment field supports plain text (rich text / mentions — out of scope for v1, TBD)

Story 1.2: View all comments on a task
As a team member, I want to see all comments on a task in chronological order, so I can follow the conversation.

Acceptance criteria (draft):
- Comments are displayed below task details, sorted oldest-first
- Each comment shows author, timestamp, and text
- If there are no comments, the section shows "No comments yet"

---

**Epic 2: Edit and delete comments**

Story 2.1: Edit own comment
As a team member, I want to edit a comment I posted, so I can fix mistakes.

Acceptance criteria (draft):
- Users can only edit their own comments (not others')
- Edit shows an inline edit field, not a modal
- Edited comments show "(edited)" indicator with original timestamp preserved

Story 2.2: Delete own comment
As a team member, I want to delete a comment I posted, so I can remove it if it's no longer relevant.

Acceptance criteria (draft):
- Users can only delete their own comments
- Deletion requires confirmation ("Delete comment?" with Cancel / Delete)
- Deleted comments are removed from the thread permanently

---

Open questions that will affect stories:
- Should admins/project owners be able to delete any comment, or only their own?
- Do comments need to support @mentions of other team members? (If yes, this adds 2-3 stories)
- Are comments private to the team or visible to clients/guests?
- Should commenting trigger a notification to task owner or watchers? (If yes, adds notification stories)
- Is there a comment character limit?

Estimated story count: 4 stories (minimum v1)
Rough scope signal: small — likely 3–5 days engineering depending on notification requirements
Blockers: none identified; stories can be developed in parallel
