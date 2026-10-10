// Bem-vindo ao
// __________         __    __  .__                               __
// \______   \_____ _/  |__/  |_|  |   ____   ______ ____ _____  |  | __ ____
//  |    |  _/\__  \   __\   __\  | _/ __ \ /  ___//    \__  \ |  |/ // __ \
//  |    |   \ / __ \|  |  |  | |  |_\  ___/ \___ \|   |  \/ __ \|    <\  ___/
//  |________/(______/__|  |__| |____/\_____>______>___|__(______/__|__\_____>
//
 // Estratégia Battlesnake: sobrevivência, espaço, alimento e pressão tática.
 // Substitua o conteúdo de logic.js por este arquivo em um template JavaScript.

const DIRECOES = [
  { nome: 'up', x: 0, y: 1 },
  { nome: 'right', x: 1, y: 0 },
  { nome: 'down', x: 0, y: -1 },
  { nome: 'left', x: -1, y: 0 },
];

const AJUSTES = {
  limiteBusca: 300,
  vidaParaPriorizarComida: 48,
  penalidadePerigo: 135,
  recompensaEspaco: 3.6,
  penalidadeCorredor: 180,
  penalidadeCabeca: 2400,
};

const chave = ({ x, y }) => `${x},${y}`;
const distancia = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const igual = (a, b) => a.x === b.x && a.y === b.y;
const avanca = (p, d) => ({ x: p.x + d.x, y: p.y + d.y });

export function info() {
  return {
    apiversion: '1',
    author: '', 
    color: '#6A0DAD',
    head: 'evil',
    tail: 'hook',
    version: '1.1.0',
  };
}

export function start(gameState) {
  if (process.env.DEBUG === 'true') console.log(`Início: ${gameState.game.id}`);
}

export function end(gameState) {
  if (process.env.DEBUG === 'true') console.log(`Fim: ${gameState.game.id}, turno ${gameState.turn}`);
}

function analisarEstado(estado) {
  const { board, you } = estado;
  const rivais = (board.snakes || []).filter(s => s.id !== you.id);
  const dentro = p => p.x >= 0 && p.y >= 0 && p.x < board.width && p.y < board.height;
  const ocupadas = new Set();

  
  for (const cobra of board.snakes || []) {
    const corpo = cobra.body || [];
    const cauda = corpo.at(-1);
    const repetida = corpo.length > 1 && igual(cauda, corpo.at(-2));
    const limite = repetida ? corpo.length : corpo.length - 1;
    for (let i = 0; i < limite; i++) ocupadas.add(chave(corpo[i]));
  }

  const ameacas = new Set();
  for (const rival of rivais) {
    if ((rival.body?.length || 0) < (you.body?.length || 0)) continue;
    for (const d of DIRECOES) {
      const p = avanca(rival.head || rival.body[0], d);
      if (dentro(p)) ameacas.add(chave(p));
    }
  }

  const perigos = new Set((board.hazards || []).map(chave));
  const alimentos = board.food || [];
  const danoPerigo = Number(estado.game?.ruleset?.settings?.hazardDamagePerTurn ?? 14);

  return { board, you, rivais, dentro, ocupadas, ameacas, perigos, alimentos, danoPerigo };
}

function explorar(inicio, contexto, bloqueios) {
  const visitados = new Set([chave(inicio)]);
  const fila = [{ p: inicio, passos: 0 }];
  let saidas = 0;
  let comidaProxima = Infinity;
  const comidas = new Set(contexto.alimentos.map(chave));

  for (let i = 0; i < fila.length && i < AJUSTES.limiteBusca; i++) {
    const atual = fila[i];

    if (comidas.has(chave(atual.p))) {
      comidaProxima = Math.min(comidaProxima, atual.passos);
    }

    for (const direcao of DIRECOES) {
      const proximo = avanca(atual.p, direcao);
      const id = chave(proximo);

      if (!contexto.dentro(proximo) || bloqueios.has(id) || visitados.has(id)) continue;

      if (atual.passos === 0) saidas++;
      visitados.add(id);
      fila.push({ p: proximo, passos: atual.passos + 1 });
    }
  }

  return { area: visitados.size, saidas, comidaProxima };
}

function pontuar(direcao, contexto) {
  const { you, rivais, dentro, ocupadas, ameacas, perigos, alimentos, danoPerigo } = contexto;
  const destino = avanca(you.head || you.body[0], direcao);
  const id = chave(destino);

  if (!dentro(destino) || ocupadas.has(id)) return -Infinity;

  const comeAgora = alimentos.some(f => igual(f, destino));
  const dano = perigos.has(id) ? danoPerigo : 0;
  const vidaApos = comeAgora ? 100 : you.health - 1 - dano;

  if (vidaApos <= 0) return -Infinity;

  if (comeAgora) {
    for (const cobra of contexto.board.snakes || []) {
      const cauda = cobra.body?.at(-1);
      if (cauda && igual(destino, cauda)) return -Infinity;
    }
  }

  const bloqueios = new Set(ocupadas);
  bloqueios.delete(id);

  const mapa = explorar(destino, contexto, bloqueios);
  const tamanho = you.body.length;

  let pontos = AJUSTES.recompensaEspaco * Math.min(mapa.area, tamanho * 5 + 15);

  if (mapa.area < tamanho + 3) {
    pontos -= AJUSTES.penalidadeCorredor + 35 * (tamanho + 3 - mapa.area);
  }

  if (mapa.saidas <= 1) pontos -= 75;
  if (ameacas.has(id)) pontos -= AJUSTES.penalidadeCabeca;
  if (perigos.has(id)) pontos -= AJUSTES.penalidadePerigo + dano * 5;

  const urgente = you.health <= AJUSTES.vidaParaPriorizarComida ||
    (mapa.comidaProxima !== Infinity && vidaApos <= mapa.comidaProxima + 12);

  const maiorRival = Math.max(0, ...rivais.map(s => s.body.length));
  const pesoComida = urgente ? 500 : tamanho <= maiorRival + 1 ? 155 : 65;

  if (mapa.comidaProxima !== Infinity) {
    pontos += pesoComida / (mapa.comidaProxima + 1);
  }

  if (comeAgora) pontos += urgente ? 175 : 50;

  if (!urgente && tamanho > maiorRival) {
    const menores = rivais.filter(s => s.body.length < tamanho);

    if (menores.length) {
      const perto = Math.min(
        ...menores.map(s => distancia(destino, s.head || s.body[0]))
      );
      pontos += 24 / (perto + 1);
    }
  }

  pontos += (
    contexto.board.width -
    Math.abs(destino.x - (contexto.board.width - 1) / 2)
  ) * 0.015;

  return pontos;
}

export function move(gameState) {
  const contexto = analisarEstado(gameState);

  const candidatos = DIRECOES.map(d => ({
    nome: d.nome,
    nota: pontuar(d, contexto)
  }));

  candidatos.sort((a, b) => b.nota - a.nota);

  const escolhido = candidatos[0]?.nome || 'up';

  if (process.env.DEBUG === 'true') {
    console.log(`Turno ${gameState.turn}: ${escolhido}`, candidatos);
  }

  return { move: escolhido };
}
