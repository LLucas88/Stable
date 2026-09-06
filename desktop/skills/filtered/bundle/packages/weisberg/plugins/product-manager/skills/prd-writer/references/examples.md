# prd-writer — Worked Examples

Concrete before/after examples for the `prd-writer` skill. `SKILL.md` points here
when it needs an illustration. Use these as calibration for the quality bar, not
as templates to copy verbatim.

---

## A. Bad → Good Problem Statement (SKILL.md §14)

**Bad:**
> Users have asked for a way to export their data. We should add an export feature.

**Good:**
> Power users on annual plans (≈8% of accounts, ≈40% of revenue) need to move
> historical reports out of the platform for compliance audits, which happen
> quarterly. Today they take screenshots one report at a time — averaging
> 4.5 hours per audit, per the last 12 months of support tickets (n=47). Three
> have cited this in churn calls.

The good version names the user, the trigger, the job, the cost, and the evidence.
Engineering and design now have something to design *for*, not just toward.

---

## B. Bad → Good Goal (SKILL.md §14)

**Bad:** *Goal: Make exporting easy.*

**Good:** *Goal: Reduce time-to-export-full-account from 4.5 hours (current
median, screenshot workflow) to under 5 minutes for 90% of power users, within
60 days of GA. Measured via the new `export_completed` event, segmented by plan tier.*
