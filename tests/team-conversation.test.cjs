'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { mkdtempSync, rmSync } = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { buildConversationSnapshot, normalizeConversationOffer } = require('../desktop/services/team-conversation.cjs')
const { StableStore } = require('../desktop/services/store.cjs')

test('Team conversation snapshot contains only visible dialogue and attachment metadata', () => {
  const snapshot = buildConversationSnapshot({ id: 'conversation-a', title: '会员复盘' }, [
    { role: 'system', content: 'hidden prompt' },
    { role: 'user', content: '请分析会员数据', trace: [{ detail: 'hidden reasoning' }], attachments: [
      { kind: 'data', name: '会员.xlsx', size: 1024, type: 'xlsx', path: 'C:\\secret\\会员.xlsx', text: 'secret body' },
    ] },
    { role: 'assistant', content: '结论：复购下降。', trace: [{ detail: 'hidden tool call' }] },
  ])

  assert.deepEqual(snapshot, {
    title: '会员复盘',
    messages: [
      { role: 'user', content: '请分析会员数据', createdAt: snapshot.messages[0].createdAt, attachments: [{ kind: 'data', name: '会员.xlsx', size: 1024, type: 'xlsx' }] },
      { role: 'assistant', content: '结论：复购下降。', createdAt: snapshot.messages[1].createdAt },
    ],
  })
  assert.doesNotMatch(JSON.stringify(snapshot), /hidden|secret|C:\\\\secret/)
})

test('received snapshot remains pending until accepted and imports as a continuable Team conversation', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'stable-team-conversation-'))
  const store = new StableStore(root)
  try {
    const activeBefore = store.activeConversationId()
    const offer = normalizeConversationOffer({
      offerId: 'offer-1', title: '门店诊断', createdAt: '2026-08-24T08:00:00.000Z',
      messages: [
        { role: 'user', content: '找出销售下降原因', createdAt: '2026-08-24T07:58:00.000Z' },
        { role: 'assistant', content: '主要来自客流下降。', createdAt: '2026-08-24T07:59:00.000Z' },
      ],
    }, 'device-b', '同事设备')

    store.saveTeamConversationOffer(offer)
    assert.equal(store.listTeamConversationOffers()[0].messageCount, 2)
    assert.equal(store.listConversations().some((item) => item.sourceType === 'team'), false)

    const imported = store.importTeamConversation(store.teamConversationOffer('offer-1'))
    store.removeTeamConversationOffer('offer-1')
    assert.equal(store.listTeamConversationOffers().length, 0)
    assert.equal(imported.sourceType, 'team')
    assert.equal(imported.sourceDeviceName, '同事设备')
    assert.equal(store.activeConversationId(), activeBefore)
    assert.deepEqual(store.listMessages(imported.id).map(({ role, content, trace }) => ({ role, content, trace })), [
      { role: 'user', content: '找出销售下降原因', trace: undefined },
      { role: 'assistant', content: '主要来自客流下降。', trace: undefined },
    ])

    store.selectConversation(imported.id)
    store.addMessage(imported.id, 'user', '继续给出改进建议')
    assert.equal(store.listMessages(imported.id).at(-1).content, '继续给出改进建议')
  } finally {
    store.close()
    rmSync(root, { recursive: true, force: true })
  }
})

test('empty Team conversation cannot be shared', () => {
  assert.throws(() => buildConversationSnapshot({ id: 'empty', title: '空对话' }, []), /还没有可发送/)
})
