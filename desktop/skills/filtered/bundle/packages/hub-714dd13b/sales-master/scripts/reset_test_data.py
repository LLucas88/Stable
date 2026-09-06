#!/usr/bin/env python3
"""
Reset demo database: set all emails to test address, adjust dates to trigger today
"""
import sqlite3, os
from datetime import date, timedelta

DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), "email_automation.db")
TEST_EMAIL = "[你的邮箱]"
today = date.today()

birthday_7d = (today + timedelta(days=7)).strftime('%m-%d')
contract_30d = (today + timedelta(days=30)).strftime('%Y-%m-%d')
contract_7d = (today + timedelta(days=7)).strftime('%Y-%m-%d')
today_md = today.strftime('%m-%d')

conn = sqlite3.connect(DB)
c = conn.cursor()

# 1. All customers -> test email
c.execute("UPDATE customers SET email = ?", (TEST_EMAIL,))

# 2. Update birthdays and contract dates
c.execute("UPDATE customers SET birthday = ? WHERE code = 'C-001'", ((today + timedelta(days=7)).strftime('%Y-%m-%d'),))
c.execute("UPDATE customers SET contract_end = ? WHERE code = 'C-001'", (contract_30d,))
c.execute("UPDATE customers SET contract_end = ? WHERE code = 'C-002'", (contract_7d,))

# 3. Clear and rebuild key_dates
c.execute("DELETE FROM key_dates")

# Row 1: C-001 birthday in 7 days
c.execute(
    "INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note) VALUES (1, 'birthday', ?, 1, 7, 'email', 'birthday_wish', 'birthday 7d')",
    (birthday_7d,)
)
# Row 2: C-001 contract end in 30 days
c.execute(
    "INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note) VALUES (1, 'contract_end', ?, 0, 30, 'email', 'contract_renewal', 'contract 30d')",
    (contract_30d,)
)
# Row 3: C-002 contract end in 7 days
c.execute(
    "INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note) VALUES (2, 'contract_end', ?, 0, 7, 'email', 'contract_renewal', 'contract 7d urgent')",
    (contract_7d,)
)
# Row 4: C-003 birthday today
c.execute(
    "INSERT INTO key_dates (customer_id, date_type, date_value, recurring, reminder_days, action_type, action_template, note) VALUES (3, 'birthday', ?, 1, 0, 'email', 'birthday_wish', 'birthday today')",
    (today_md,)
)

conn.commit()

rows = c.execute(
    "SELECT c.code, c.name, c.email, kd.date_type, kd.date_value, kd.reminder_days, kd.action_template "
    "FROM key_dates kd JOIN customers c ON kd.customer_id = c.id"
).fetchall()

print("Database reset complete. Test email:", TEST_EMAIL)
print("Today:", today.strftime('%Y-%m-%d'))
print("Key dates (" + str(len(rows)) + "):")
for r in rows:
    print("  " + str(r[0]) + " " + str(r[1]) + " | " + str(r[3]) + " | date=" + str(r[4]) + " | remind=" + str(r[5]) + "d | tpl=" + str(r[6]))

conn.close()
