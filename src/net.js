// LAN networking client. Offline (single-player) when not connected: this client is the host.

export class Net {
  constructor() {
    this.ws = null; this.online = false;
    this.id = 0; this.hostId = 0;
    this.handlers = new Map();
    this.lobby = [];
    this.queue = [];
  }

  get isHost() { return !this.online || this.id === this.hostId; }
  get myId() { return this.online ? this.id : 0; }

  on(type, fn) { this.handlers.set(type, fn); }

  connect(name, outfit) {
    return new Promise((resolve, reject) => {
      if (location.protocol === 'file:' && !this.server) { reject(new Error('Open the game through the server (node server.js) to play on the LAN.')); return; }
      // this.server is set when joining from the Android app (it isn't served by the LAN server)
      const url = this.server ? `ws://${this.server}/ws` : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      const timer = setTimeout(() => { ws.close(); reject(new Error('Could not reach the FortCraft server.')); }, 4000);
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', name, outfit, platform: this.platform || 'desktop' }));
      ws.onerror = () => { clearTimeout(timer); reject(new Error('Could not reach the FortCraft server.')); };
      ws.onclose = () => {
        if (this.online) { this.online = false; this.dispatch({ t: 'disconnected' }); }
      };
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'welcome') {
          clearTimeout(timer);
          this.ws = ws; this.online = true;
          this.id = msg.id; this.hostId = msg.hostId; this.lobby = msg.lobby;
          resolve(msg);
        }
        this.dispatch(msg);
      };
    });
  }

  disconnect() { if (this.ws) { this.online = false; this.ws.close(); this.ws = null; } }

  dispatch(msg) {
    if (msg.t === 'lobby') { this.lobby = msg.lobby; this.hostId = msg.hostId; }
    if (msg.t === 'host') this.hostId = msg.id;
    const fn = this.handlers.get(msg.t);
    if (fn) fn(msg);
  }

  send(msg) {
    if (!this.online || !this.ws || this.ws.readyState !== 1) return;
    this.ws.send(JSON.stringify(msg));
  }

  // to: client id or 'host'
  sendTo(to, msg) { msg.to = to; this.send(msg); }
}
