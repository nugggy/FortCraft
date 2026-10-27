// Player XP and levels, saved per browser in localStorage.

const KEY = 'fortcraft.profile';
export const xpForLevel = (level) => Math.round(500 * Math.pow(1.1, level - 1));

export class Progression {
  constructor(game) {
    this.game = game;
    this.load();
    this.match = null;
    game.events.on((ev, ...args) => this.on(ev, ...args));
  }

  load() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem(KEY)); } catch { p = null; }
    this.p = { xp: 0, level: 1, matches: 0, wins: 0, kills: 0, ...(p || {}) };
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.p)); } catch { /* storage unavailable */ } }

  // Level progress view: { level, into, need, frac }
  view(total = this.p.xp) {
    let level = 1, rest = total;
    while (rest >= xpForLevel(level)) { rest -= xpForLevel(level); level++; }
    const need = xpForLevel(level);
    return { level, into: rest, need, frac: rest / need };
  }

  startMatch() {
    this.match = { kills: 0, chests: 0, won: false, committed: false, startXp: this.p.xp, gained: 0, parts: [] };
  }

  on(ev, ...args) {
    const g = this.game, me = g.player, m = this.match;
    if (!m || !me) return;
    if (ev === 'kill' && args[0] === me.id) { m.kills++; this.add(50, 'Elimination'); }
    if (ev === 'chest' && args[0] === me.id) { m.chests++; this.add(15, 'Chest'); }
    if (ev === 'victory') { m.won = true; this.add(300, 'Victory Royale'); }
  }

  add(n, label) {
    const m = this.match;
    const before = this.view().level;
    this.p.xp += n;
    if (m) {
      m.gained += n;
      const part = m.parts.find(p => p.label === label);
      if (part) { part.xp += n; part.count++; } else m.parts.push({ label, xp: n, count: 1 });
    }
    const after = this.view().level;
    this.p.level = after;
    if (after > before) this.onLevelUp?.(after, before);
    this.save();
  }

  // Called once per match when the player's result is known.
  commit(placement, total, timeSurvived) {
    const m = this.match;
    if (!m || m.committed) return m;
    m.committed = true;
    const survival = Math.max(0, Math.round((total - placement) / Math.max(1, total - 1) * 200));
    this.add(25, 'Match played');
    if (survival) this.add(survival, 'Survival');
    if (timeSurvived > 60) this.add(Math.min(150, Math.round(timeSurvived / 4)), 'Time alive');
    this.p.matches++;
    this.p.kills += m.kills;
    if (m.won) this.p.wins++;
    this.save();
    return m;
  }
}
