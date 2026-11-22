// Funções do MontAI Fit no Firebase. A chave da Anthropic fica só aqui, guardada como segredo do projeto.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions";
import { MODELO, LIMITE_DIA, limparPedido, instrucoes, mensagemUsuario, Formato, conferirResposta, hojeBR } from "./treino.js";

initializeApp();
const CHAVE = defineSecret("ANTHROPIC_API_KEY");

// Conta o pedido do dia e recusa a partir do limite. Fica numa coleção que o app não consegue gravar (só o servidor).
async function contarUso(uid) {
  const db = getFirestore(), ref = db.collection("iaUso").doc(uid), dia = hojeBR();
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), d = snap.exists ? snap.data() : {};
    const n = d.dia === dia ? (d.n || 0) : 0;
    if (n >= LIMITE_DIA) return false;
    tx.set(ref, { dia, n: n + 1, total: (d.total || 0) + 1 });
    return true;
  });
}

export const montarTreino = onCall(
  { region: "southamerica-east1", secrets: [CHAVE], timeoutSeconds: 60, memory: "256MiB", maxInstances: 5 },
  async req => {
    if (!req.auth) throw new HttpsError("unauthenticated", "Entre na sua conta para usar a IA.");
    const p = limparPedido(req.data);
    if (p.pedido.length < 3) throw new HttpsError("invalid-argument", "Escreva o que você quer treinar hoje.");
    if (p.catalogo.length < 10) throw new HttpsError("invalid-argument", "Atualize o app e tente de novo.");
    if (!(await contarUso(req.auth.uid))) throw new HttpsError("resource-exhausted", `Você já usou os ${LIMITE_DIA} pedidos de hoje. Amanhã libera de novo.`);

    const client = new Anthropic({ apiKey: CHAVE.value(), maxRetries: 1, timeout: 50_000 });
    let resp;
    try {
      resp = await client.messages.parse({
        model: MODELO,
        max_tokens: 8000,
        system: [{ type: "text", text: instrucoes(p.catalogo), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: mensagemUsuario(p) }],
        output_config: { format: zodOutputFormat(Formato) },
      });
    } catch (e) {
      logger.error("Falha ao chamar a Anthropic", { status: e?.status, tipo: e?.name, msg: e?.message });
      if (e instanceof Anthropic.RateLimitError) throw new HttpsError("unavailable", "A IA está ocupada agora. Tente de novo em instantes.");
      throw new HttpsError("internal", "Não deu para montar agora. Tente de novo.");
    }

    logger.info("uso", { uid: req.auth.uid, stop: resp.stop_reason, ...resp.usage });
    if (resp.stop_reason === "refusal") throw new HttpsError("failed-precondition", "Não consegui montar esse pedido. Tente descrever de outro jeito.");
    if (resp.stop_reason === "max_tokens" || !resp.parsed_output) throw new HttpsError("internal", "Não deu para montar agora. Tente de novo.");

    const treino = conferirResposta(resp.parsed_output, p.ids);
    if (!treino.itens.length) throw new HttpsError("failed-precondition", treino.nota || "Não consegui montar um treino com esse pedido. Tente descrever de outro jeito.");
    return treino;
  }
);
