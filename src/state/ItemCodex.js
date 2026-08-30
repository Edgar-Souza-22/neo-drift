// Catálogo central de comportamento + descrição de cada tipo de arma/
// consumível — usado tanto pela lógica de combate (Player.js) quanto pelas
// páginas de equipamento/consumíveis do menu (UIScene.js), pra garantir que
// o texto mostrado ao jogador NUNCA desalinhe do que a arma realmente faz.

// range/cone em tiles/graus; cone=null significa "hit em área" (sem checar
// direção, como a espada padrão sempre foi); knockbackMul multiplica o
// recuo padrão que Enemy.takeDamage já aplica.
export const MELEE_KINDS = {
  sword: {
    label: 'Corte',
    desc: 'Golpe simples de curto alcance, atinge tudo ao redor. Confiável, sem efeito especial.',
    range: 1.05, cone: null, knockbackMul: 1, cooldown: 340
  },
  pilebunker: {
    label: 'Britadeira',
    desc: 'Golpe pesado e lento (cadência menor). Acerta perto, mas empurra o alvo com força.',
    range: 0.95, cone: null, knockbackMul: 2.6, cooldown: 620
  }
};

// pellets>1 = dispara vários projéteis no mesmo gatilho (leque, se spreadDeg>0);
// dmgMul multiplica GameState.pistolDamage por projétil; ammoCost é gasto
// por gatilho (não por projétil).
export const RANGED_KINDS = {
  pistol: {
    label: 'Pistola', desc: 'Tiro único, preciso, cadência média.',
    cooldown: 450, pellets: 1, spreadDeg: 0, speed: 9, lifetime: 900, ammoCost: 1, dmgMul: 1
  },
  smg: {
    label: 'SMG Neural', desc: 'Rajada de 3 tiros rápidos em sequência — menos dano por bala, mas mais delas.',
    cooldown: 620, pellets: 3, spreadDeg: 5, speed: 9.5, lifetime: 800, ammoCost: 3, dmgMul: 0.55, burstDelay: 70
  },
  shotgun: {
    label: 'Shotgun de Choque', desc: 'Leque de estilhaços de curto alcance — devastador perto, quase inútil de longe.',
    cooldown: 750, pellets: 5, spreadDeg: 26, speed: 8, lifetime: 260, ammoCost: 2, dmgMul: 0.5
  },
  railgun: {
    label: 'Railgun de Sobrecarga', desc: 'Tiro carregado que atravessa todos os inimigos numa linha reta. Cadência lenta, munição cara, dano altíssimo.',
    cooldown: 1100, pellets: 1, spreadDeg: 0, speed: 13, lifetime: 700, ammoCost: 4, dmgMul: 2.2,
    pierce: true, bulletScale: 1.8, bulletTint: 0xffffff
  }
};

export const CONSUMABLE_INFO = {
  stim: {
    label: 'Estimulante', key: 'Q',
    desc: 'Cura instantânea. Guarde pra emergência — cargas são limitadas.'
  },
  emp: {
    label: 'Granada EMP', key: 'E',
    desc: 'Desliga (atordoa) drones e robôs ao redor por alguns segundos. Não afeta chefes.'
  }
};
