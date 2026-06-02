/* =====================================================================
   Точка входа для регресс-харнеса. esbuild бандлит её в один IIFE,
   который экспонирует игровые символы на globalThis — ровно те, что
   ждёт драйвер в harness.mjs (Game/CONFIG/Input/UI/RNG/dist2/rand/
   Meta/Weapons/Spawner). НЕ импортирует main.ts (никакого bootstrap/DOM).
   ===================================================================== */

import { CONFIG } from '../src/config';
import { RNG, dist2, rand } from '../src/utils';
import { Game } from '../src/game';
import { Input } from '../src/input';
import { UI } from '../src/ui';
import { Meta } from '../src/meta';
import { Weapons } from '../src/weapons';
import { Spawner } from '../src/spawner';

const g: any = globalThis;
g.CONFIG = CONFIG;
g.RNG = RNG;
g.dist2 = dist2;
g.rand = rand;
g.Game = Game;
g.Input = Input;
g.UI = UI;
g.Meta = Meta;
g.Weapons = Weapons;
g.Spawner = Spawner;
