# Neo Drift — instruções para o agente

Action RPG top-down em pixel art (Phaser 3 + Vite, JavaScript). O loop é estilo Soul Blazer: hub → incursão → resgate de NPCs → hub mais vivo. Assets visuais nascem em código (`src/scenes/pixelGrid.js` + `BootScene.js`) ou como PNG drop-in em `art/`; áudio é sintetizado (`src/audio/`). Sem TypeScript.

Leia o `README.md` para o loop de jogo, controles, save/load e o roadmap de fases. Este arquivo só cobre **como trabalhar no repo** e **quando carregar cada skill**.

## Skills do projeto

As skills vivem em **`.agents/skills/`** (não em `.claude/skills/` nem `.cursor/skills/`). Elas vêm do plugin `playableintelligence/game-creator` — use o conhecimento delas, **não** o template/scaffold. Este repositório já existe e tem arquitetura própria.

Antes de implementar, leia o `SKILL.md` correspondente. Depois leia **só** os arquivos de referência que a tarefa precisa (progressive disclosure).

### Quando usar cada skill

| Skill | Use quando… | Não use quando… |
|-------|-------------|-----------------|
| **phaser** | Criar/alterar cenas, entidades, física arcade, input, pooling, performance, ciclo de vida Phaser, nova fase/mapa | A tarefa for só arte/sprite, só polish visual, ou documentação |
| **game-assets** | Criar ou trocar sprites (player, inimigo, chefe, NPC, tile, item, prop), pixel art procedural, animação de frames, integrar PNG/Piskel | A tarefa for gameplay, layout de salas, física, diálogo ou HUD |
| **game-designer** | Polish visual: atmosfera, paleta, partículas, juice (shake, flash, tween), transições, hierarquia visual, HUD/UX, “o jogo precisa parecer melhor” | A tarefa for mecânica, balanceamento, colisão, scoring ou conteúdo de fase |

Se a tarefa cruzar duas áreas, carregue as duas. Exemplo: “novo inimigo com sprite e ataque” → `game-assets` + `phaser`. “chefe novo com telegraph chamativo” → as três.

### Como carregar

1. Leia `.agents/skills/<nome>/SKILL.md`.
2. Leia só os companions citados abaixo para aquela tarefa.
3. Aplique os **overrides deste repo** (seção seguinte) — eles vencem o texto da skill.

#### phaser — `.agents/skills/phaser/`

| Arquivo | Carregue quando… |
|---------|------------------|
| `SKILL.md` | Sempre que a skill phaser entrar |
| `scenes-and-lifecycle.md` | Nova cena, `init`/`create`/`update`/`shutdown`, transição entre áreas |
| `game-objects.md` | Sprite, Group, Container, botão, pooling |
| `physics-and-movement.md` | Arcade physics, movimento, colliders, overlaps |
| `assets-and-performance.md` | Atlas, culling, partículas, `pixelArt`, mobile |
| `patterns.md` | State machine, managers, EventEmitter |
| `no-asset-design.md` | Visual procedural (gradiente, vinheta, luz) — alinhar com `pixelGrid.js` |
| `conventions.md` / `project-setup.md` / `examples/` | Só se precisar de um padrão Phaser isolado; **não** recrie o template |

#### game-assets — `.agents/skills/game-assets/`

| Arquivo | Carregue quando… |
|---------|------------------|
| `SKILL.md` | Sempre que a skill game-assets entrar |
| `sprite-catalog.md` | Escolher arquétipo (humanóide, voador, tile, item, chefe) |
| `pixel-renderer.md` | Ideia de matriz/paleta — **adapte para `pixelGrid.js`**, não crie `PixelRenderer.js` |
| `integration-patterns.md` | Ligar sprite novo em entidade/BootScene; PNG em `art/` |
| `character-pipeline.md` | Quase nunca. Este jogo não usa o sistema South Park / photo-composite |

#### game-designer — `.agents/skills/game-designer/`

| Arquivo | Carregue quando… |
|---------|------------------|
| `SKILL.md` | Sempre que a skill game-designer entrar |
| `visual-catalog.md` | Paleta, parallax, partículas, transições, juice |

## Overrides (este repo ganha da skill)

As skills foram escritas para um template TypeScript + EventBus + Play.fun. **Ignore** o que conflitar com o projeto:

- **JavaScript, não TypeScript.** Não converta arquivos, não adicione `tsconfig`, não crie `*.ts`.
- **Não recrie o scaffold** `src/core/{EventBus,GameState,Constants}.ts`, `objects/`, Preloader/Game/GameOver. Use `src/scenes/`, `src/entities/`, `src/world/`, `src/state/GameState.js`, `src/utils/constants.js`.
- **Pixel art:** gere com `src/scenes/pixelGrid.js` em `BootScene.js`, ou solte PNG em `art/<lote>/` (o boot só troca a textura se `this.textures.exists()`). Não crie `src/core/PixelRenderer.js` nem `src/sprites/`.
- **HUD existe** (`UIScene.js`) e deve continuar existindo. Ignore a regra Play.fun de “não criar HUD de score”.
- **Não altere física, dano, spawn ou scoring** num passe de design. Juice é aditivo.
- **Texto ao jogador em PT-BR**, sem meta-game (`chefe`, `boss`, `spawn`, `mini-boss`). Use o nome do antagonista ou o que acontece na cena.
- Espetáculo viral / SAFE_ZONE Play.fun / mute-button do template: só aplique se couber no jogo atual, sem quebrar layout nem controles.

## Convenções críticas do código

1. **`_checkItemPickups()` no `update()` de uma fase** sempre roda **antes** do `if (this.levelEnded) { ...; return; }`. O golpe que termina a fase já dropa loot nesse frame; se a coleta vier depois do early-return, o item fica impossível de pegar.
2. **Tela de fase completa:** toda fase nova precisa de entrada própria em `PHASE_OUTCOMES` (`src/scenes/UIScene.js`) — frase única + região de retorno correta (Ala Central, Distrito Neon, Submundo, …). Não hardcodar “Ala Central”.
3. **Nova fase** costuma ser o conjunto: `*Layout.js` + `*Scene.js` + entidade de confronto (se houver) + `*Captives.js` + flag em `GameState.js` + registro em `src/main.js` + sprites no `BootScene.js`.
4. Mudança cirúrgica: toque só o que a tarefa pede. Não refatore o template das skills para cima do código existente.

## Comandos

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```
