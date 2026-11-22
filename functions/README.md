# Funções do MontAI Fit (Firebase)

`montarTreino`: recebe o pedido escrito no app ("Montar com IA", na aba Plano), chama o Claude Haiku 5.5 e devolve um treino montado só com exercícios do catálogo do app. A chave da Anthropic fica guardada como segredo do Firebase e nunca vai para o navegador.

- Só quem está logado consegue chamar.
- Limite de 10 pedidos por pessoa por dia (horário de Brasília), contado na coleção `iaUso`, que só o servidor grava.
- Região `southamerica-east1` (São Paulo).

## Publicar pela primeira vez

1. No console do Firebase, mude o projeto `montai-fit` para o plano **Blaze**. Em Faturamento, crie um alerta de orçamento (por exemplo, US$ 5).
2. Em https://platform.claude.com, crie uma chave de API, coloque créditos e defina um limite mensal de gasto.
3. No computador, com o Node 22 instalado:

   ```bash
   npm install -g firebase-tools
   firebase login
   cd functions && npm install && cd ..
   firebase functions:secrets:set ANTHROPIC_API_KEY   # cole a chave quando pedir
   firebase deploy --only functions
   ```

4. Abra o site, vá em Plano e toque em "Montar com IA".

## Testes

```bash
cd functions && npm test
```

## Custos e ajustes

- Modelo e limite diário: `MODELO` e `LIMITE_DIA` em `treino.js`.
- O uso de tokens de cada pedido aparece nos logs da função (`firebase functions:log`).
