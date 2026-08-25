'use strict'

const { randomBytes, randomUUID } = require('node:crypto')
const { networkInterfaces } = require('node:os')
const { WebSocket, WebSocketServer } = require('ws')

const INVITE_PREFIX = 'STB1-'

function encodeInvite(value) {
  return `${INVITE_PREFIX}${Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')}`
}

function decodeInvite(value) {
  const text = String(value || '').trim()
  if (!text.startsWith(INVITE_PREFIX)) throw new Error('Team 邀请码无效。')
  try {
    const decoded = JSON.parse(Buffer.from(text.slice(INVITE_PREFIX.length), 'base64url').toString('utf8'))
    if (!decoded.teamId || !decoded.secret || !decoded.relayUrl) throw new Error('missing fields')
    return decoded
  } catch {
    throw new Error('Team 邀请码无效。')
  }
}

function parseMessage(raw) {
  try { return JSON.parse(String(raw)) } catch { return null }
}

function lanAddress() {
  for (const entries of Object.values(networkInterfaces())) {
    for (const item of entries || []) {
      if (item.family === 'IPv4' && !item.internal && !item.address.startsWith('169.254.')) return item.address
    }
  }
  return '127.0.0.1'
}

class LocalTeamRelay {
  constructor({ host = '0.0.0.0', publicHost = lanAddress(), port = 47823 } = {}) {
    this.host = host
    this.publicHost = publicHost
    this.port = port
    this.server = undefined
    this.clients = new Map()
    this.teamId = ''
    this.secret = ''
    this.pending = new Map()
  }

  async start({ teamId, secret }) {
    if (this.server) return this.address()
    this.teamId = teamId
    this.secret = secret
    await new Promise((resolve, reject) => {
      const server = new WebSocketServer({ host: this.host, port: this.port })
      server.once('listening', resolve)
      server.once('error', reject)
      server.on('connection', (socket) => this.accept(socket))
      this.server = server
    })
    const address = this.server.address()
    if (address && typeof address === 'object') this.port = address.port
    return this.address()
  }

  address() { return `ws://${this.publicHost}:${this.port}` }

  accept(socket) {
    let deviceId = ''
    socket.on('message', (raw) => {
      const message = parseMessage(raw)
      if (!message) return
      if (message.type === 'hello') {
        if (message.teamId !== this.teamId || message.secret !== this.secret || !message.device?.id) {
          socket.close(1008, 'Team identity rejected')
          return
        }
        deviceId = String(message.device.id)
        const old = this.clients.get(deviceId)?.socket
        if (old && old !== socket) old.close(1000, 'Reconnected')
        this.clients.set(deviceId, { socket, device: { ...message.device, status: 'online', lastSeen: new Date().toISOString() } })
        const pending = this.pending.get(deviceId) || []
        this.pending.delete(deviceId)
        for (const item of pending) socket.send(JSON.stringify(item.message))
        this.broadcastRoster()
        return
      }
      if (!deviceId || message.type !== 'route') return
      const target = this.clients.get(String(message.targetDeviceId || ''))
      if (target?.socket.readyState === WebSocket.OPEN) {
        target.socket.send(JSON.stringify({ type: 'route', sourceDeviceId: deviceId, payload: message.payload }))
      } else {
        const targetDeviceId = String(message.targetDeviceId || '')
        const pending = this.pending.get(targetDeviceId) || []
        pending.push({
          createdAt: Date.now(),
          message: { type: 'route', sourceDeviceId: deviceId, payload: message.payload },
        })
        this.pending.set(targetDeviceId, pending.slice(-100))
        socket.send(JSON.stringify({ type: 'delivery-queued', targetDeviceId, taskId: message.payload?.taskId }))
      }
    })
    socket.on('close', () => {
      if (deviceId && this.clients.get(deviceId)?.socket === socket) {
        this.clients.delete(deviceId)
        this.broadcastRoster()
      }
    })
  }

  broadcastRoster() {
    const payload = JSON.stringify({ type: 'roster', devices: [...this.clients.values()].map((entry) => entry.device) })
    for (const { socket } of this.clients.values()) if (socket.readyState === WebSocket.OPEN) socket.send(payload)
  }

  async close() {
    for (const { socket } of this.clients.values()) socket.close(1001, 'Relay closed')
    this.clients.clear()
    this.pending.clear()
    if (!this.server) return
    const server = this.server
    this.server = undefined
    await new Promise((resolve) => server.close(resolve))
  }
}

class TeamNetwork {
  constructor({ onEvent = () => {}, capabilities = () => ({}) } = {}) {
    this.onEvent = onEvent
    this.capabilities = capabilities
    this.profile = undefined
    this.relay = undefined
    this.socket = undefined
    this.reconnectTimer = undefined
    this.closed = false
  }

  async create({ teamName, deviceName, port = 47823, deviceIdentity }) {
    await this.close()
    this.closed = false
    const teamId = randomUUID()
    const secret = randomBytes(24).toString('base64url')
    this.relay = new LocalTeamRelay({ port })
    const relayUrl = await this.relay.start({ teamId, secret })
    const inviteCode = encodeInvite({ teamId, teamName, secret, relayUrl })
    this.profile = {
      teamId, teamName, inviteCode, secret, relayUrl, role: 'owner',
      deviceId: deviceIdentity.id, deviceKey: deviceIdentity.key, deviceName,
    }
    await this.connect()
    return this.profile
  }

  async join({ inviteCode, deviceName, deviceIdentity }) {
    await this.close()
    this.closed = false
    const invite = decodeInvite(inviteCode)
    this.profile = {
      teamId: invite.teamId, teamName: invite.teamName || 'Stable Team', inviteCode, secret: invite.secret,
      relayUrl: invite.relayUrl, role: 'member', deviceId: deviceIdentity.id, deviceKey: deviceIdentity.key, deviceName,
    }
    await this.connect()
    return this.profile
  }

  async restore(profile) {
    if (!profile) return
    await this.close()
    this.closed = false
    this.profile = profile
    if (profile.role === 'owner') {
      const url = new URL(profile.relayUrl)
      this.relay = new LocalTeamRelay({ host: '0.0.0.0', publicHost: url.hostname, port: Number(url.port) })
      try { await this.relay.start({ teamId: profile.teamId, secret: profile.secret }) } catch (error) {
        this.onEvent({ type: 'connection', status: 'offline', error: `本地 Relay 启动失败：${error.message}` })
      }
    }
    await this.connect().catch(() => {})
  }

  connect() {
    return new Promise((resolve, reject) => {
      if (!this.profile) return reject(new Error('尚未加入 Team。'))
      const socket = new WebSocket(this.profile.relayUrl)
      this.socket = socket
      let settled = false
      socket.once('open', () => {
        socket.send(JSON.stringify({
          type: 'hello', teamId: this.profile.teamId, secret: this.profile.secret,
          device: { id: this.profile.deviceId, key: this.profile.deviceKey, name: this.profile.deviceName, role: this.profile.role, capabilities: this.capabilities() },
        }))
        settled = true
        this.onEvent({ type: 'connection', status: 'online' })
        resolve()
      })
      socket.on('message', (raw) => {
        const message = parseMessage(raw)
        if (message) this.onEvent(message)
      })
      socket.on('close', () => {
        if (this.socket === socket) this.socket = undefined
        this.onEvent({ type: 'connection', status: 'offline' })
        if (!this.closed && this.profile) {
          clearTimeout(this.reconnectTimer)
          this.reconnectTimer = setTimeout(() => void this.connect().catch(() => {}), 2_000)
        }
      })
      socket.once('error', (error) => {
        if (!settled) reject(new Error(`无法连接 Team Relay：${error.message}`))
      })
    })
  }

  send(targetDeviceId, payload) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Team Relay 当前未连接。')
    this.socket.send(JSON.stringify({ type: 'route', targetDeviceId, payload }))
  }

  updateProfile(values = {}) {
    if (!this.profile) throw new Error('尚未加入 Team。')
    this.profile = { ...this.profile, ...values }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({
        type: 'hello', teamId: this.profile.teamId, secret: this.profile.secret,
        device: { id: this.profile.deviceId, key: this.profile.deviceKey, name: this.profile.deviceName, role: this.profile.role, capabilities: this.capabilities() },
      }))
    }
    return this.profile
  }

  async close() {
    this.closed = true
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    if (this.socket) this.socket.close(1000, 'Client closed')
    this.socket = undefined
    if (this.relay) await this.relay.close()
    this.relay = undefined
  }
}

module.exports = { INVITE_PREFIX, LocalTeamRelay, TeamNetwork, decodeInvite, encodeInvite, lanAddress }
