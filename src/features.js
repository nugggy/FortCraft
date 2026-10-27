// Feature modules register themselves here. Each module exports install(game),
// which runs once after the game and UI exist. Keep one import + one call per module.
// See docs/CONTRACT.md for the plug-in points available to modules.
import { installTeams } from './teams.js';
import { installCreative } from './creative.js';
import { installLanExtras } from './lanextras.js';
import { installPresentation } from './presentation.js';
import { installGadgets } from './gadgets.js';
import { installVehicles } from './vehicles.js';
import { installVending } from './vending.js';
import { installSupplyDrops } from './supplydrop.js';
import { installReplay } from './replay.js';
import { installControlsUI } from './ui/controlsui.js';
import { installUpdates } from './updates.js';
import { installTouch } from './touch.js';

export function installFeatures(game) {
  // installs are added below by each feature module, one line each
  installTeams(game);
  installCreative(game);
  installLanExtras(game);
  installPresentation(game);
  installGadgets(game);
  installVehicles(game);
  installVending(game);
  installSupplyDrops(game);
  installReplay(game);
  installControlsUI(game);
  installUpdates(game);
  installTouch(game);
}
