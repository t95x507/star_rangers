// Thin P2P layer over PeerJS (WebRTC data channels, public signalling broker).
// Star topology: the host is authoritative, clients talk only to the host.
const PREFIX = 'star-rangers-p2p-v1-';
const CHUNK = 4000; // PeerJS json channel limit is ~16KB of UTF-8 (Cyrillic = 2 bytes), so we slice messages ourselves
let msgSeq = 0;

function sendRaw(conn, text) {
  if (!conn || !conn.open) return;
  if (text.length <= CHUNK) { conn.send({ t: 'raw', d: text }); return; }
  const id = ++msgSeq, n = Math.ceil(text.length / CHUNK);
  for (let i = 0; i < n; i++) conn.send({ t: 'chunk', id, i, n, d: text.slice(i * CHUNK, (i + 1) * CHUNK) });
}

function receiver(handler) {
  const parts = new Map();
  return d => {
    if (d.t === 'raw') return handler(JSON.parse(d.d));
    if (d.t !== 'chunk') return;
    let p = parts.get(d.id);
    if (!p) parts.set(d.id, p = { n: d.n, got: 0, a: [] });
    if (p.a[d.i] == null) { p.a[d.i] = d.d; p.got++; }
    if (p.got === p.n) { parts.delete(d.id); handler(JSON.parse(p.a.join(''))); }
  };
}

export function randomCode() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export class Net {
  constructor() {
    this.peer = null;
    this.conns = new Map();
    this.hostConn = null;
    this.onMessage = () => {};
    this.onJoin = () => {};
    this.onLeave = () => {};
    this.onStatus = () => {};
  }

  _peer(id) {
    const peer = id ? new Peer(id, { debug: 1 }) : new Peer({ debug: 1 });
    peer.on('disconnected', () => { this.onStatus('Потеряна связь с сервером сигналинга, переподключение…'); setTimeout(() => !peer.destroyed && peer.reconnect(), 1500); });
    return peer;
  }

  host(code) {
    return new Promise((resolve, reject) => {
      const peer = this.peer = this._peer(PREFIX + code);
      let opened = false;
      peer.on('open', () => { opened = true; resolve(code); });
      peer.on('error', e => { if (!opened) reject(e); else this.onStatus('Ошибка сети: ' + e.type); });
      peer.on('connection', c => {
        c.on('open', () => { this.conns.set(c.peer, c); this.onJoin(c.peer); });
        c.on('data', receiver(m => this.onMessage(c.peer, m)));
        const bye = () => { if (this.conns.delete(c.peer)) this.onLeave(c.peer); };
        c.on('close', bye);
        c.on('error', bye);
      });
    });
  }

  join(code) {
    return new Promise((resolve, reject) => {
      const peer = this.peer = this._peer();
      let done = false;
      const timer = setTimeout(() => { if (!done) reject(new Error('Хост не отвечает. Проверьте код комнаты.')); }, 15000);
      peer.on('error', e => {
        if (!done) { clearTimeout(timer); reject(new Error(e.type === 'peer-unavailable' ? 'Комната не найдена' : 'Ошибка сети: ' + e.type)); }
        else this.onStatus('Ошибка сети: ' + e.type);
      });
      peer.on('open', () => {
        const c = this.hostConn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        c.on('open', () => { done = true; clearTimeout(timer); resolve(); });
        c.on('data', receiver(m => this.onMessage('host', m)));
        c.on('close', () => this.onLeave('host'));
      });
    });
  }

  send(msg) { sendRaw(this.hostConn, JSON.stringify(msg)); }
  sendTo(peerId, msg) { sendRaw(this.conns.get(peerId), JSON.stringify(msg)); }
  broadcast(msg) { const text = JSON.stringify(msg); for (const c of this.conns.values()) sendRaw(c, text); }
}
