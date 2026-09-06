## Input
Feature: seller payout dashboard for our gaming item marketplace. Sellers (boosters) complete orders and currently receive payouts manually via request to support. We're building a self-serve dashboard where they can see their balance, request a withdrawal, and track payout status.

Users: verified sellers (boosters) who have completed at least one order. They're very money-focused — this is their income. Delays and unclear balances are the top support complaint.

PRD is done. We need user stories for sprint planning. Backend already has the balance and transaction data available via internal API.

Known constraints: payout minimum is $10. We only support PayPal and bank transfer. Withdrawal processing takes 1–3 business days. Balance can include pending earnings (from orders in progress) that can't be withdrawn yet.

## Expected output
Story set organized by epic:

---

**Epic 1: Balance visibility**

Story 1.1: View available and pending balance
As a verified seller, I want to see my current available balance and my pending balance separately, so I know exactly how much I can withdraw now vs. how much is still locked in active orders.

Acceptance criteria:
- Available balance shows confirmed, withdrawable earnings (rounded to 2 decimal places)
- Pending balance shows earnings from orders that are in progress or in dispute
- Both figures update within 5 minutes of an order completing or a dispute being resolved
- If available balance = $0, the page still loads with a $0 state, not an error

Story 1.2: View transaction history
As a verified seller, I want to see a list of completed orders and their payout amounts, so I can reconcile my earnings with my completed work.

Acceptance criteria:
- Transaction list shows: order ID, date completed, amount earned, status (available / pending / withdrawn)
- List is paginated, showing 20 items per page, sorted by date descending
- Filter by date range (last 30 days, last 90 days, all time)
- Each row links to the order detail page
- Blocker: depends on Story 1.1 (balance display must be in place)

---

**Epic 2: Withdrawal request**

Story 2.1: Request a withdrawal
As a verified seller with available balance ≥ $10, I want to request a withdrawal to my connected payout method, so I can receive my earnings.

Acceptance criteria:
- Given available balance ≥ $10, when seller taps "Withdraw", a withdrawal request form appears
- Form shows: amount (pre-filled with max available, editable down to minimum $10), payout method (PayPal or bank — must be previously connected), estimated processing time (1–3 business days)
- Seller confirms and submits; withdrawal status changes to "processing" immediately
- Given available balance < $10, the "Withdraw" button is visible but disabled, with tooltip "Minimum withdrawal is $10"

Story 2.2: Withdrawal confirmation and status tracking
As a verified seller who submitted a withdrawal, I want to see the status of my request, so I know when to expect payment.

Acceptance criteria:
- Status values: Processing / Completed / Failed
- Processing status shows: date submitted, amount, method, estimated completion date
- Completed status shows: date completed, amount received, method
- Failed status shows: reason (payment method rejected, invalid account details) and CTA to update payout method
- Seller receives email notification on status change (Processing → Completed or Failed)

---

**Epic 3: Payout method management**

Story 3.1: Connect a payout method
As a verified seller, I want to connect a PayPal account or bank account, so I have a destination for my withdrawals.

Acceptance criteria:
- Seller can add PayPal (enter email address, verified by PayPal confirmation flow) or bank account (IBAN + account holder name)
- Only one method of each type can be active at a time
- Seller can set a default method
- Method connection requires re-verification if not used for 90 days (fraud prevention)
- Edge case: if a seller attempts to withdraw without a payout method connected, they are redirected to add one before the withdrawal form

---

Definition of done (all stories):
- All amount values pass through the same currency formatting utility (no mixed $X.XX vs. $X)
- All API errors surface user-facing messages, not raw error codes
- Mobile-responsive (sellers access on mobile ~60% of the time per analytics)

Estimated story count: 6 stories across 3 epics
Rough scope signal: medium — 3-4 weeks for one frontend engineer with backend API available
Blockers: Story 1.1 must be completed before 1.2; Story 3.1 must be completed before 2.1
