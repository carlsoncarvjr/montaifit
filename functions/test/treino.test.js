import { test } from "node:test";
import assert from "node:assert/strict";
import { limparPedido, instrucoes, mensagemUsuario, conferirResposta, hojeBR } from "../treino.js";

const cat = [
  { id: "supreto", nome: "Supino reto com barra", grupo: "peito", eq: "b" },
  { id: "puxada", nome: "Puxada frontal", grupo: "costas", eq: "g" },
  { id: "elevlat", nome: "Elevação lateral", grupo: "ombros", eq: "d" },
];

test("limparPedido corta texto, descarta itens inválidos e ordena o catálogo", () => {
  const p = limparPedido({
    pedido: "  treino   de costas " + "x".repeat(800),
    catalogo: [...cat, { id: "MAL", nome: "x", grupo: "peito", eq: "b" }, { id: "ok2", nome: "x", grupo: "pescoco", eq: "b" }],
    evitar: ["puxada", "inexistente"],
    recentes: [{ id: "supreto", kg: "40", reps: "10", data: "2026-11-20" }, { id: "fake", kg: 1, reps: 1 }],
  });
  assert.equal(p.pedido.length, 600);
  assert.ok(p.pedido.startsWith("treino de costas"));
  assert.deepEqual(p.catalogo.map(e => e.id), ["elevlat", "puxada", "supreto"]);
  assert.deepEqual(p.evitar, ["puxada"]);
  assert.deepEqual(p.recentes, [{ id: "supreto", kg: 40, reps: 10, data: "2026-11-20" }]);
});

test("limparPedido aguenta entrada vazia ou estranha", () => {
  const p = limparPedido(null);
  assert.equal(p.pedido, "");
  assert.deepEqual(p.catalogo, []);
});

test("instruções listam o catálogo e a mensagem leva perfil e histórico", () => {
  const p = limparPedido({ pedido: "peito", catalogo: cat, perfil: { objetivo: "Ganhar massa", tempo: "60 min" }, recentes: [{ id: "supreto", kg: 40, reps: 10, data: "2026-11-20" }] });
  assert.match(instrucoes(p.catalogo), /supreto \| Supino reto com barra \| peito \| barra/);
  const m = mensagemUsuario(p);
  assert.match(m, /Pedido: peito/);
  assert.match(m, /objetivo: Ganhar massa; tempo: 60 min/);
  assert.match(m, /supreto 40 kg × 10/);
});

test("conferirResposta tira ids fora do catálogo e repetidos e limita números", () => {
  const ids = new Set(cat.map(e => e.id));
  const r = conferirResposta({ titulo: "Peito", nota: "Boa.", itens: [
    { id: "supreto", series: 9, reps: "8–10", descanso: "2 min" },
    { id: "supreto", series: 3, reps: "8", descanso: "90s" },
    { id: "inventado", series: 3, reps: "10", descanso: "90s" },
    { id: "elevlat", series: 0, reps: "", descanso: "5 min" },
  ] }, ids);
  assert.deepEqual(r.itens, [
    { id: "supreto", sets: 6, reps: "8–10", rest: "2 min" },
    { id: "elevlat", sets: 3, reps: "8–12", rest: "90s" },
  ]);
});

test("hojeBR usa o fuso de Brasília", () => {
  assert.equal(hojeBR(new Date("2026-11-23T02:30:00Z")), "2026-11-22");
});
