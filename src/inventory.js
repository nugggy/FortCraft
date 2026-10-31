// Inventory screen: rearrange the five loadout slots like Fortnite. Open it (I, or d-pad up on a
// controller), pick an item, then pick the slot to move it to (the two swap). Works with the mouse,
// touch, and the controller (the overlay is a .padlayer, so src/gamepad.js drives it: A picks, B closes).
import { RARITY, itemIcon, itemName, itemRarity } from './items.js';
import { escapeHtml } from './hud.js';

const CSS = `
#invMenu { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 40; display: none; flex-direction: column; gap: 12px;
  width: min(760px, calc(100vw - 32px)); padding: 18px 22px; background: rgba(10, 14, 34, 0.95); border-radius: 16px;
  box-shadow: 0 0 0 3px rgba(255, 216, 74, 0.35), 0 30px 80px rgba(0,0,0,0.7); color: #fff; font: 500 14px Rubik, sans-serif; }
#invMenu.show { display: flex; }
#invMenu .iv-foot { display: flex; justify-content: flex-end; }
#invMenu h2 { margin: 0; font: 30px Lucky, "Trebuchet MS", sans-serif; color: #ffd84a; letter-spacing: 1px; }
#invMenu button { cursor: pointer; font: 700 13px Rubik, sans-serif; color: #fff; background: #23305a; border: 0; border-radius: 8px; padding: 8px 14px; }
#invMenu .iv-hint { opacity: 0.7; font-size: 13px; margin: 0; min-height: 1.2em; }
#invMenu .iv-slots { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
#invMenu .iv-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 10px 6px; min-height: 120px; text-align: center;
  background: linear-gradient(160deg, rgba(0,0,0,0.6) 20%, color-mix(in srgb, var(--rar) 55%, #000)); box-shadow: inset 0 -4px 0 var(--rar); }
#invMenu .iv-slot.empty { background: rgba(255,255,255,0.06); }
#invMenu .iv-slot.pick { outline: 3px solid #ffd84a; outline-offset: -3px; transform: translateY(-4px); }
#invMenu .iv-slot .n { font-size: 11px; opacity: 0.6; }
#invMenu .iv-slot img { width: 100%; max-width: 96px; aspect-ratio: 26 / 14; image-rendering: pixelated; }
#invMenu .iv-slot span { font-size: 12px; line-height: 1.2; }
@media (max-width: 560px) { #invMenu .iv-slots { grid-template-columns: repeat(3, 1fr); } }
`;

class Inventory {
  constructor(game) {
    this.game = game;
    this.pick = -1; // slot index picked to move, or -1
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div');
    this.el.id = 'invMenu';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') this.close();
      else if (b.dataset.act === 'slot') this.choose(+b.dataset.i);
    });
    addEventListener('keydown', (e) => { if (this.isOpen && e.code === 'Escape') this.close(); });
  }

  get isOpen() { return this.el.classList.contains('show'); }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  open() {
    const g = this.game, p = g.player;
    if (!g.inMatch() || !p || !p.alive || p.state === 'bus') return;
    this.pick = -1;
    this.render();
    this.el.classList.add('show');
    this.el.classList.add('padlayer');
    g.inventoryOpen = true;
    g.ui.unlockPointer();
  }

  close() {
    if (!this.isOpen) return;
    this.el.classList.remove('show', 'padlayer');
    this.game.inventoryOpen = false;
    if (this.game.inMatch() && this.game.ui.screen === null) this.game.ui.lockPointer();
  }

  // First pick selects an item, the second pick moves it to that slot (swapping with whatever is there).
  choose(i) {
    const p = this.game.player;
    if (!p) return;
    if (this.pick < 0) { if (p.slots[i]) this.pick = i; }
    else if (this.pick === i) this.pick = -1;
    else { this.swap(p, this.pick, i); this.pick = -1; }
    this.render(i);
  }

  // Swap two slots; the player keeps holding the same item, wherever it moves to.
  swap(p, a, b) {
    [p.slots[a], p.slots[b]] = [p.slots[b], p.slots[a]];
    if (p.selected === a + 1) p.selected = b + 1;
    else if (p.selected === b + 1) p.selected = a + 1;
    p.using = null;
    this.game.audio.play('mag_in', { vol: 0.5 });
  }

  render(focus = -1) {
    const p = this.game.player;
    const cards = p.slots.map((it, i) => {
      if (!it) return `<button class="iv-slot empty${this.pick === i ? ' pick' : ''}" data-act="slot" data-i="${i}" style="--rar:transparent"><span class="n">Slot ${i + 1}</span><span>Empty</span></button>`;
      const col = RARITY[itemRarity(it)]?.color || '#aaa';
      const count = it.count ? ` x${it.count}` : '';
      return `<button class="iv-slot${this.pick === i ? ' pick' : ''}" data-act="slot" data-i="${i}" style="--rar:${col}"><span class="n">Slot ${i + 1}</span>`
        + `<img src="${itemIcon(it.id, it.kind === 'weapon' ? it.rarity : 0)}" alt=""><span>${escapeHtml(itemName(it))}${count}</span></button>`;
    }).join('');
    const hint = this.pick < 0 ? 'Pick an item to move.' : 'Now pick the slot to put it in. Pick it again to cancel.';
    // Close comes after the slots so the controller starts on slot 1
    this.el.innerHTML = `<h2>Inventory</h2><p class="iv-hint">${hint}</p><div class="iv-slots">${cards}</div>
      <div class="iv-foot"><button data-act="close">Close</button></div>`;
    // keep the controller focus on the slot that was just used
    if (focus >= 0 && this.game.menuPad) this.game.menuPad.setFocus(this.el.querySelector(`[data-i="${focus}"]`));
  }

  update() {
    const p = this.game.player;
    if (this.isOpen && (!this.game.inMatch() || !p || !p.alive || p.downed)) this.close();
  }
}

export function installInventory(game) {
  const inv = new Inventory(game);
  game.inventory = inv;
  game.events.on((ev, act) => { if (ev === 'input' && act === 'inventory') inv.toggle(); });
  setInterval(() => inv.update(), 250);
  return inv;
}
