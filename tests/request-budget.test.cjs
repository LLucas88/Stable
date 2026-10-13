'use strict'
const test = require('node:test'), assert = require('node:assert/strict')
const { requestBudget } = require('../benchmarks/report-tasks/request-budget.cjs')

test('budget warns at 75 percent and remains exhausted across resume/correction requests', () => {
  const budget = requestBudget(60)
  for (let i = 0; i < 44; i++) assert.equal(budget.onRequest(), undefined)
  assert.match(budget.onRequest(), /45\/60.*还可请求 15 次/)
  for (let i = 45; i < 59; i++) budget.onRequest()
  assert.match(budget.onRequest(), /60\/60.*还可请求 0 次/)
  for (let i = 0; i < 2; i++) assert.throws(() => budget.onRequest(), /达到上限（60\/60）/)
  assert.equal(budget.used, 60)
})

test('small and invalid budgets do not allow an extra request', () => {
  for (const value of [0, -1, 1.5, NaN]) assert.throws(() => requestBudget(value))
  const budget = requestBudget(1)
  assert.match(budget.onRequest(), /1\/1.*还可请求 0 次/)
  assert.throws(() => budget.onRequest(), /达到上限/)
})
