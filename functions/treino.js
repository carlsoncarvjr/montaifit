// Regras puras do "Montar com IA": limpa o pedido que chega do app, monta as instruções
// e confere a resposta da IA antes de devolver. Sem rede aqui, para dar para testar.
import { z } from "zod";

export const MODELO = "claude-haiku-5-5";
export const LIMITE_DIA = 10;            // pedidos por pessoa por dia
export const DESCANSOS = ["45s", "60s", "90s", "2 min", "3 min"];
const GRUPOS = ["peito", "costas", "ombros", "biceps", "triceps", "quad", "post", "glut", "adut", "pant", "core"];
const EQUIP = { b: "barra", d: "halteres", g: "máquina ou polia", c: "peso do corpo" };

const texto = (v, max) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const idOk = v => typeof v === "string" && /^[a-z0-9]{2,24}$/.test(v);

// O que o app manda. Tudo vem do navegador, então nada aqui é confiável: corta tamanhos e descarta o que não tem formato certo.
export function limparPedido(data) {
  const d = data && typeof data === "object" ? data : {};
  const pedido = texto(d.pedido, 600);
  const catalogo = (Array.isArray(d.catalogo) ? d.catalogo : []).slice(0, 200)
    .filter(e => e && idOk(e.id) && GRUPOS.includes(e.grupo) && EQUIP[e.eq])
    .map(e => ({ id: e.id, nome: texto(e.nome, 60), grupo: e.grupo, eq: e.eq }))
    .sort((a, b) => a.id.localeCompare(b.id));    // mesma ordem sempre, para o cache das instruções funcionar
  const ids = new Set(catalogo.map(e => e.id));
  const p = d.perfil && typeof d.perfil === "object" ? d.perfil : {};
  const perfil = { objetivo: texto(p.objetivo, 40), nivel: texto(p.nivel, 30), equipamento: texto(p.equipamento, 40), tempo: texto(p.tempo, 20) };
  const evitar = (Array.isArray(d.evitar) ? d.evitar : []).filter(id => ids.has(id)).slice(0, 40);
  const recentes = (Array.isArray(d.recentes) ? d.recentes : []).slice(0, 30)
    .filter(r => r && ids.has(r.id))
    .map(r => ({ id: r.id, kg: Number(r.kg) || 0, reps: Math.max(0, Math.min(100, parseInt(r.reps) || 0)), data: texto(r.data, 10) }));
  return { pedido, catalogo, ids, perfil, evitar, recentes };
}

// Parte fixa das instruções. É igual para todo mundo (mesmo catálogo), então fica em cache e sai mais barata.
export function instrucoes(catalogo) {
  const lista = catalogo.map(e => `${e.id} | ${e.nome} | ${e.grupo} | ${EQUIP[e.eq]}`).join("\n");
  return `Você é o montador de treinos do MontAI Fit, um app brasileiro de musculação. A pessoa descreve o treino que quer hoje e você devolve um treino de academia pronto para executar.

Regras:
- Use somente exercícios do catálogo abaixo, pelo id exato. Nunca invente exercício.
- Respeite tempo, equipamento, foco e limitações que a pessoa disser. Sem tempo informado, use o tempo do perfil. Como referência, 45 min comportam uns 5 exercícios, 60 min uns 7 e 90 min uns 9.
- Exercícios compostos primeiro, isolados depois. Em geral 2 a 4 séries por exercício.
- Repetições como faixa curta, por exemplo "8–10" ou "12–15". Em prancha e exercícios parados, use segundos, como "30–45 s".
- Descanso: 2 min ou 3 min nos compostos pesados, 60s ou 90s nos demais, 45s em abdômen e panturrilha.
- Se a pessoa pedir cardio, monte um circuito com exercícios do catálogo que elevem a frequência cardíaca (agachamento com peso do corpo, afundo, escalador, flexão, subida no caixote) com descanso curto, e diga na nota como encaixar esteira, bicicleta ou corda, que não estão no catálogo.
- Se houver dor ou lesão, evite o que força a região e diga na nota, em uma frase, que vale procurar um profissional se a dor continuar. Não diagnostique nada.
- Considere os exercícios a evitar e o histórico recente, quando vierem.
- "titulo": nome curto do treino, até 40 caracteres, como "Costas e bíceps em 40 min".
- "nota": 2 ou 3 frases em português do Brasil, em tom direto, explicando a lógica do treino e uma dica de execução.
- Se o pedido não tiver relação com treino, devolva "itens" vazio e use a "nota" para dizer, em uma frase, que você só monta treinos.

Catálogo (id | nome | grupo | equipamento):
${lista}`;
}

export function mensagemUsuario({ pedido, perfil, evitar, recentes }) {
  const linhas = [`Pedido: ${pedido}`];
  const p = Object.entries(perfil).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join("; ");
  if (p) linhas.push(`Perfil salvo no app: ${p}`);
  if (evitar.length) linhas.push(`Exercícios que a pessoa não gosta (evite): ${evitar.join(", ")}`);
  if (recentes.length) linhas.push(`Última carga registrada por exercício: ${recentes.map(r => `${r.id} ${r.kg ? r.kg + " kg × " : ""}${r.reps} (${r.data})`).join("; ")}`);
  return linhas.join("\n");
}

export const Formato = z.object({
  titulo: z.string(),
  nota: z.string(),
  itens: z.array(z.object({
    id: z.string(),
    series: z.number().int(),
    reps: z.string(),
    descanso: z.enum(DESCANSOS),
  })),
});

// Confere a resposta: só ids do catálogo, sem repetir, números dentro do razoável.
export function conferirResposta(r, ids) {
  const vistos = new Set();
  const itens = [];
  for (const it of (r && Array.isArray(r.itens) ? r.itens : [])) {
    if (!ids.has(it.id) || vistos.has(it.id)) continue;
    vistos.add(it.id);
    itens.push({
      id: it.id,
      sets: Math.max(1, Math.min(6, parseInt(it.series) || 3)),
      reps: texto(it.reps, 20) || "8–12",
      rest: DESCANSOS.includes(it.descanso) ? it.descanso : "90s",
    });
    if (itens.length >= 12) break;
  }
  return { titulo: texto(r && r.titulo, 40) || "Treino da IA", nota: texto(r && r.nota, 500), itens };
}

// Dia no horário de Brasília, para o limite diário virar à meia-noite daqui.
export const hojeBR = (agora = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
