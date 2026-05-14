import { ApiError } from "../utils/apiError.js";

function normalizeContext(context) {
  if (!context) {
    return "";
  }

  if (typeof context === "string") {
    return context;
  }

  try {
    return JSON.stringify(context);
  } catch {
    return "[contexto nao serializavel]";
  }
}

function buildChatPrompt({ message, context, user }) {
  const userContext = user
    ? `Usuario: ${user.name || ""} (${user.role || ""})`
    : "Usuario: anonimo";
  const contextText = normalizeContext(context);

  return `Voce e um assistente inteligente para o sistema Hortifruit. Responda em pt-BR, com objetividade e foco em operacoes do negocio. Considere que estamos no Brasil e use as definicoes de estacoes do ano brasileiras. Seja especifico ao sugerir frutas, legumes e verduras para cultivo em cada estacao, citando exemplos claros quando a pergunta envolver sazonalidade.\n\n${userContext}\nContexto adicional: ${contextText || "(vazio)"}\n\nPergunta do usuario: ${message}`;
}

async function callOpenAi({ prompt }) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new ApiError("OPENAI_API_KEY nao configurada", 500);
  }

  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "Voce responde perguntas de usuarios sobre o sistema e rotina do hortifruit.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  const payload = await response.json();

  if (!response.ok) {
    const message = payload?.error?.message || "Falha ao chamar a OpenAI";
    throw new ApiError(message, response.status || 502);
  }

  return {
    reply: payload?.choices?.[0]?.message?.content || "",
    model: payload?.model || model,
  };
}

export async function chatWithAi({ message, context, user }) {
  const prompt = buildChatPrompt({ message, context, user });
  const response = await callOpenAi({ prompt });

  if (!response.reply) {
    throw new ApiError("Resposta vazia da IA", 502);
  }

  return response.reply;
}
