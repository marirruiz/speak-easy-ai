import axios from "axios";
import express from "express";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const userMemory: Record<string, string[]> = {};

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Speak Easy AI rodando 🚀");
});

app.post("/chat", async (req, res) => {
  try {
    const {
      userId = "default_user",
      message,
      mode = "conversation",
    } = req.body;

    if (!message) {
      return res.status(400).json({ error: "Message é obrigatória" });
    }

    if (!userMemory[userId]) {
      userMemory[userId] = [];
    }

    const chatHistory = userMemory[userId];

    const modeInstructions: Record<string, string> = {
      conversation: `
Modo conversa:
- Converse naturalmente em inglês.
- Faça perguntas simples para manter a conversa.
- Corrija apenas erros muito importantes.
`,

      correction: `
Modo correção:
- Corrija a frase do usuário.
- Explique o erro em português.
- Dê uma versão mais natural em inglês.
`,

      vocabulary: `
Modo vocabulário:
- Ensine palavras e expressões úteis sobre o tema.
- Dê tradução em português.
- Dê exemplos curtos em inglês.
`,

      teacher: `
Modo professor:
- Explique gramática ou estrutura em português.
- Use exemplos simples.
- Não deixe a explicação longa demais.
`,
    };

    const selectedMode =
      modeInstructions[mode] || modeInstructions.conversation;

    chatHistory.push(`Usuário: ${message}`);

    const prompt = `
Você é o Speak Easy AI, um assistente amigável para ajudar pessoas brasileiras a praticarem inglês.

Regras gerais:
- Responda de forma simples, clara e natural.
- Quando o usuário escrever em português, explique em português.
- Quando o usuário quiser praticar inglês, converse em inglês.
- Corrija erros de inglês de forma gentil.
- Não diga que você é um modelo do Google.
- Seja encorajador e didático.

${selectedMode}

Histórico da conversa:
${chatHistory.join("\n")}
`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    const reply = response.text || "";

    chatHistory.push(`Speak Easy AI: ${reply}`);

    res.json({
      userId,
      mode,
      reply,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao processar mensagem" });
  }
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  console.log("MODE:", mode);
  console.log("TOKEN RECEBIDO:", token);
  console.log("TOKEN ENV:", process.env.WHATSAPP_VERIFY_TOKEN);

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;

    const message = body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) {
      return res.sendStatus(200);
    }

    const from = message.from;
    const text = message.text?.body;

    if (!text) {
      return res.sendStatus(200);
    }

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Você é o Speak Easy AI, um assistente amigável para ajudar pessoas brasileiras a praticarem inglês.

Responda de forma curta, natural e didática.

Mensagem do usuário:
${text}
      `,
    });

    const reply = response.text || "Desculpa, não consegui responder agora.";

    await axios.post(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to: from,
        type: "text",
        text: {
          body: reply,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
      }
    );

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook:", error);
    res.sendStatus(500);
  }
});

app.listen(3000, () => {
  console.log("Servidor rodando na porta 3000");
});