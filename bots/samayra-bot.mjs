#!/usr/bin/env node
/**
 * SAMAYRA Telegram companion for OmniRoute.
 * Uses Telegram's HTTPS Bot API directly to avoid an extra runtime dependency.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const ownerId = String(process.env.BOT_OWNER_ID || "");
const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 20128);
const apiBase = (process.env.SAMAYRA_API_BASE || `http://127.0.0.1:${port}/v1`).replace(/\/$/, "");
const apiKey = process.env.SAMAYRA_API_KEY || process.env.OMNIROUTE_API_KEY || "";
const model = process.env.SAMAYRA_MODEL || "auto";
const personalityNames = ["savage","sweet","flirty","dark romance","funny","gangster","formal"];
const chats = new Map();
const modes = new Map();
let offset = 0;
let stopping = false;

if (!token) {
  console.error("[SAMAYRA] TELEGRAM_BOT_TOKEN is missing; bot polling is disabled.");
  process.exit(1);
}
const tg = async (method, payload = {}) => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(payload), signal: AbortSignal.timeout(35000)
  });
  const data = await response.json();
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
};
const send = (chat_id, text, extra = {}) => tg("sendMessage", {
  chat_id, text: String(text).slice(0, 4000), ...extra
});
const isOwner = (id) => ownerId && String(id) === ownerId;
const historyFor = (key) => {
  if (!chats.has(key)) chats.set(key, []);
  return chats.get(key);
};
const getMode = (key) => modes.get(key) || "savage";
const promptFor = (mode) => `You are SAMAYRA, a witty, context-aware Telegram companion. Current personality: ${mode}. Speak natural Hinglish when the user does. Usually keep casual replies concise (5-12 words), but give complete detailed help for technical/educational questions. Be playful, varied, never spam groups, never claim to perform actions you cannot do. Do not generate images.`;
async function askAI(key, userText) {
  const history = historyFor(key);
  history.push({ role: "user", content: userText.slice(0, 3000) });
  const messages = [{ role: "system", content: promptFor(getMode(key)) }, ...history.slice(-12)];
  const headers = { "content-type": "application/json" };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;
  const response = await fetch(`${apiBase}/chat/completions`, {
    method: "POST", headers, body: JSON.stringify({ model, messages, temperature: 0.85, max_tokens: 450 }),
    signal: AbortSignal.timeout(60000)
  });
  if (!response.ok) throw new Error(`AI engine returned HTTP ${response.status}`);
  const data = await response.json();
  const answer = data.choices?.[0]?.message?.content;
  if (!answer) throw new Error("AI engine returned an empty response");
  history.push({ role: "assistant", content: answer });
  if (history.length > 24) history.splice(0, history.length - 24);
  return answer;
}
async function handle(update) {
  const msg = update.message;
  if (!msg?.chat || !msg.from || !msg.text) return;
  const chatId = msg.chat.id, userId = msg.from.id, text = msg.text.trim();
  const chatKey = String(chatId);
  const cmd = text.match(/^\/(\w+)(?:@\w+)?(?:\s+([\s\S]*))?$/);
  if (cmd) {
    const [, command, arg = ""] = cmd;
    if (command === "start" || command === "help") {
      return send(chatId, "✨ SAMAYRA AI online\n\nChat with me in DM. In groups, reply to me or mention me.\n\n/mode — choose personality\n/mode savage|sweet|flirty|dark romance|funny|gangster|formal\n/forget — clear this chat's short-term context\n/panel — owner controls");
    }
    if (command === "mode") {
      if (!arg) return send(chatId, `Current: ${getMode(chatKey)}\nModes: ${personalityNames.join(", ")}`);
      const selected = personalityNames.find((name) => name === arg.toLowerCase());
      if (!selected) return send(chatId, `Choose: ${personalityNames.join(", ")}`);
      modes.set(chatKey, selected);
      return send(chatId, `Personality set to ${selected} ✨`);
    }
    if (command === "forget") {
      chats.delete(chatKey);
      return send(chatId, "Is chat ka short-term context clear kar diya.");
    }
    if (command === "panel") {
      if (!isOwner(userId)) return send(chatId, "Owner-only command.");
      return send(chatId, "SAMAYRA Owner Panel\n/health — API health\n/mode <name> — set this chat personality\nBroadcast and permission controls are planned for the next module.");
    }
    if (command === "health") {
      if (!isOwner(userId)) return send(chatId, "Owner-only command.");
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/monitoring/health`, { signal: AbortSignal.timeout(5000) });
        return send(chatId, `OmniRoute: HTTP ${r.status}\nTelegram: polling active`);
      } catch { return send(chatId, "OmniRoute health endpoint unreachable."); }
    }
    if (["ban","mute","unmute","unban","warn","pin","purge"].includes(command)) {
      if (msg.chat.type === "private") return send(chatId, "Ye command group mein use hoti hai.");
      try {
        const actor = await tg("getChatMember", { chat_id: chatId, user_id: userId });
        if (!["administrator", "creator"].includes(actor.status)) return send(chatId, "Sirf group admins ye command use kar sakte hain.");
      } catch { return send(chatId, "Admin permission verify nahi ho paayi."); }
      const member = msg.reply_to_message?.from?.id;
      if (!member) return send(chatId, "Is command ke liye target user ke message par reply karo.");
      try {
        if (command === "ban") await tg("banChatMember", { chat_id: chatId, user_id: member });
        else if (command === "unban") await tg("unbanChatMember", { chat_id: chatId, user_id: member, only_if_banned: true });
        else if (command === "mute") await tg("restrictChatMember", { chat_id: chatId, user_id: member, permissions: { can_send_messages: false }, use_independent_chat_permissions: true });
        else if (command === "unmute") await tg("restrictChatMember", { chat_id: chatId, user_id: member, permissions: { can_send_messages: true, can_send_audios: true, can_send_documents: true, can_send_photos: true, can_send_videos: true, can_send_video_notes: true, can_send_voice_notes: true, can_send_polls: true, can_send_other_messages: true, can_add_web_page_previews: true }, use_independent_chat_permissions: true });
        else if (command === "pin" && msg.reply_to_message) await tg("pinChatMessage", { chat_id: chatId, message_id: msg.reply_to_message.message_id });
        else if (command === "purge") return send(chatId, "Purge is not enabled in this lightweight build yet.");
        else if (command === "warn") return send(chatId, "Warning system abhi active nahi hai; is command ka action record nahi hua.");
        return send(chatId, `Done: ${command}`);
      } catch (error) { return send(chatId, `Action failed: ${error.message}`); }
    }
    return;
  }
  const isPrivate = msg.chat.type === "private";
  const botName = process.env.TELEGRAM_BOT_USERNAME || "";
  const mentioned = (msg.entities || []).some(e => e.type === "mention" && text.slice(e.offset, e.offset + e.length).toLowerCase() === `@${botName.toLowerCase()}`);
  const replied = msg.reply_to_message?.from?.is_bot;
  const shouldReply = isPrivate || mentioned || replied;
  if (!shouldReply) return;
  const cleaned = botName ? text.replace(new RegExp(`@${botName}\\b`, "ig"), "").trim() : text;
  await tg("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => {});
  try {
    const answer = await askAI(`${chatKey}:${userId}`, cleaned);
    await send(chatId, answer, { reply_to_message_id: msg.message_id });
  } catch (error) {
    console.error("[SAMAYRA] AI request failed:", error.message);
    await send(chatId, "AI engine abhi busy hai. Thodi der baad try karo.", { reply_to_message_id: msg.message_id });
  }
}
async function poll() {
  console.log("[SAMAYRA] Telegram polling started.");
  while (!stopping) {
    try {
      const updates = await tg("getUpdates", { offset, timeout: 25, allowed_updates: ["message"] });
      for (const update of updates) {
        offset = update.update_id + 1;
        try { await handle(update); } catch (error) { console.error("[SAMAYRA] Update error:", error.message); }
      }
    } catch (error) {
      if (!stopping) { console.error("[SAMAYRA] Poll error:", error.message); await new Promise(r => setTimeout(r, 2500)); }
    }
  }
}
process.on("SIGINT", () => { stopping = true; });
process.on("SIGTERM", () => { stopping = true; });
poll();
