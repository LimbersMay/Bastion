# Skins de las unidades

Cada unidad aparece con una de sus skins al azar (`skins` en `scripts/units/catalog.ts`). Todas salen de
[The Skindex](https://www.minecraftskins.com/), una web donde la comunidad sube skins. La web no da una
licencia para reutilizarlas: valen para jugar y probar, pero **antes de publicar el addon hay que pedir
permiso a cada autor o cambiar la skin**.

Los originales y las versiones ya preparadas están en `assets/skins/skindex/` (fuera de git).

## Cómo se preparan

- Formato 64x64 con brazos anchos (4 px), el que dibuja `geometry.bastion.humanoid`. Las de brazos finos
  (3 px) se ensanchan repitiendo la columna central de cada cara del brazo.
- Algunas skins antiguas rellenan la capa exterior de negro en vez de dejarla transparente; Java lo
  ignoraba, Bedrock lo pinta y la unidad sale negra. Esos píxeles negros pasan a transparentes.
- Se descartan las copias de packs oficiales de pago (por ejemplo, los de Skyrim para Xbox 360).

## En uso

| Archivo | Skin | Autor | Cambios |
| --- | --- | --- | --- |
| `ally_soldier_0` | [English Knight](https://www.minecraftskins.com/skin/22682989/english-knight/) | danymok | capa negra limpiada |
| `ally_soldier_1` | [French Knight](https://www.minecraftskins.com/skin/22686808/french-knight/) | danymok | capa negra limpiada |
| `ally_soldier_2` | [Plate Armored Knight](https://www.minecraftskins.com/skin/22668638/plate-armored-knight/) | danymok | |
| `ally_soldier_3` | [k n i g h t](https://www.minecraftskins.com/skin/20793257/k-n-i-g-h-t/) | mochhi | |
| `ally_wizard_0` | [Flame Lord](https://www.minecraftskins.com/skin/13768185/flame-lord/) | thiccsnail | |
| `ally_wizard_1` | [Fire Wizard (with special effects)](https://www.minecraftskins.com/skin/19896756/fire-wizard--with-special-effects-/) | PlasmicRay | brazos ensanchados |
| `ally_wizard_2` | [inferno mage](https://www.minecraftskins.com/skin/24039805/inferno-mage/) | cestor | brazos ensanchados |
| `ally_wizard_3` | [Pyromancer](https://www.minecraftskins.com/skin/23103385/pyromancer--dark-souls-/) | VelesTG | brazos ensanchados |
| `invader_soldier_0` | [Orc Warrior Male](https://www.minecraftskins.com/skin/20313301/orc-warrior-male/) | Pemke | |
| `invader_soldier_1` | [Orc Warrior Female](https://www.minecraftskins.com/skin/20313302/orc-warrior-female/) | Pemke | |
| `invader_soldier_2` | [Immersive Fantasy orc](https://www.minecraftskins.com/skin/22981775/immersive-fantasy-orc/) | EzraNaamah | |
| `invader_soldier_3` | [Khal Warchief #2](https://www.minecraftskins.com/skin/15676790/khal-warchief--2/) | Stormer99 | |
| `invader_soldier_4` | [Inga-Half Orc](https://www.minecraftskins.com/skin/20294950/inga-half-orc/) | NervyYew1585 | brazos ensanchados |
| `invader_wizard_0` | [Khal Warchief #3](https://www.minecraftskins.com/skin/15729497/khal-warchief--3/) | Stormer99 | |
| `invader_wizard_1` | [Khal Shaman](https://www.minecraftskins.com/skin/15728770/khal-shaman/) | Stormer99 | |
| `invader_wizard_2` | [blood shamaness](https://www.minecraftskins.com/skin/20743676/blood-shamaness/) | ThatOneGuy372 | brazos ensanchados |
| `invader_wizard_3` | [Goblin Warrior/Spellcaster](https://www.minecraftskins.com/skin/19982872/goblin-warrior-spellcaster-for-dapprdust---kalsan/) | MeechiFox | capa negra limpiada |
| `ally_warrior_0` | [Knights Templar (Fantasy)](https://www.minecraftskins.com/skin/22858165/knights-templar--fantasy-/) | GlLBERT | |
| `ally_warrior_1` | [staying holy..](https://www.minecraftskins.com/skin/21999427/staying-holy--/) | Lushyy | |
| `ally_warrior_2` | [Knight Veteran](https://www.minecraftskins.com/skin/13873619/knight-veteran/) | tk2dogs | |
| `ally_warrior_3` | [Royal Crusaders Guard](https://www.minecraftskins.com/skin/24081719/royal-crusaders-guard/) | Foxiler | capa negra limpiada |
| `ally_archer_0` | [medieval crossbowman with kettle hat](https://www.minecraftskins.com/skin/15306341/medieval-crossbowmanarcher-with-kattle-hat/) | soldatjojoPL | |
| `ally_archer_1` | [French crossbowman](https://www.minecraftskins.com/skin/22802061/french-crossbowman/) | EndlessImagination | capa negra limpiada |
| `ally_archer_2` | [Medieval Ranger](https://www.minecraftskins.com/skin/13183129/medieval-ranger/) | Tankrid | |
| `ally_archer_3` | [Crossbowman](https://www.minecraftskins.com/skin/24349987/crossbowman/) | Spook22 | |
| `invader_archer_0` | [Orc Archer (Horns of War)](https://www.minecraftskins.com/skin/23906473/orc-archer--horns-of-war-/) | GladeoftheMudWings | |

## Pendientes

Más skins para el arquero invasor, que de momento solo tiene una: las dos candidatas ([1](https://www.minecraftskins.com/skin/10704627/orc-archer/), [2](https://www.minecraftskins.com/skin/11929995/orc-archer/)) no se pudieron descargar (la web bloquea las descargas automáticas). Si Limbers las baja a mano, se preparan como las demás.
