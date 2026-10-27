// Presentation features: music, voiced radio lines, layered sound effects, emotes and cutscenes.
import { installMusic } from './music.js';
import { installVoice } from './voice.js';
import { installSfx } from './sfx.js';
import { installEmotes } from './emotes.js';
import { installCutscenes } from './cutscene.js';

export function installPresentation(game) {
  installMusic(game);
  installVoice(game);
  installSfx(game);
  installCutscenes(game);
  installEmotes(game);
}
