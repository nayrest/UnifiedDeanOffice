// ======================================================
//  UnifiedDeanOffice — Bot (MVP "Деканат 24/7")
// ======================================================

import { Bot, Keyboard } from "@maxhub/max-bot-api";
import dotenv from "dotenv";
dotenv.config();

import { runPython } from "./pythonBridge.js";
import { sendBroadcastToAll } from "./notifications.js";

// ----------------------------------------------
// Конфиг
// ----------------------------------------------
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = Number(process.env.ADMIN_ID || 0);

const bot = new Bot(BOT_TOKEN);

// ----------------------------------------------
// Утилита клавиатур
// ----------------------------------------------
function kb(rows) {
  return Keyboard.inlineKeyboard(
    rows.map((row) =>
      row.map((b) => Keyboard.button.callback(b.text, b.payload))
    )
  );
}

// ----------------------------------------------
// ГАРАНТИРОВАННОЕ получение user_id
// ----------------------------------------------
function extractUserId(ctx) {
  // callback
  if (ctx?.callback?.user?.user_id) return ctx.callback.user.user_id;

  // message_created
  if (ctx?.message?.sender?.user_id) return ctx.message.sender.user_id;

  // fallback (почти не используется)
  if (ctx?.message?.from?.user_id) return ctx.message.from.user_id;

  return null;
}

// ----------------------------------------------
// FSM (Finite State Machine) — состояние рассылки
// ----------------------------------------------
const composeState = new Map(); // user_id → { mode: "broadcast", attachments: [] }

// ----------------------------------------------
// Получить роль пользователя
// ----------------------------------------------
async function getRole(userId) {
  const u = await runPython("get_user", [String(userId)]);
  return u?.role || "user";
}

// ======================================================
//  MESSAGE HANDLER
// ======================================================
async function handleMessage(ctx) {
  const userId = extractUserId(ctx);
  const text = ctx?.message?.body?.text || "";
  const attachments = ctx?.message?.body?.attachments || [];

  if (!userId) return;

  // ----------- AUTO REGISTER -----------
  const name =
    ctx?.message?.sender?.first_name ||
    ctx?.callback?.user?.first_name ||
    "";
  await runPython("ensure_user", [String(userId), name]);

  // ======================================================
  // FSM BROADCAST MODE
  // ======================================================
  const state = composeState.get(userId);

  console.log("FSM CHECK:", userId, state);

  if (state?.mode === "broadcast") {
    // вложения
    if (attachments.length) {
      state.attachments.push(...attachments);
      composeState.set(userId, state);

      await ctx.reply(
        `Добавлено вложений: ${attachments.length}. Можете отправить текст — я начну рассылку.`
      );
      return;
    }

    // текст = запуск рассылки
    if (text.trim()) {
      composeState.delete(userId);

      await ctx.reply("Начинаю рассылку…");

      const res = await sendBroadcastToAll(
        userId,
        text.trim(),
        state.attachments
      );

      await ctx.reply(
        `Готово!\nОтправлено: ${res.sent}\nПропущено: ${res.skipped}`
      );
      return;
    }

    return; // пустое сообщение — игнорируем
  }

  // ======================================================
  // /start
  // ======================================================
  if (text.startsWith("/start")) {
    const role = await getRole(userId);

    const rows = [
      [
        { text: "🧾 Подать заявку", payload: "REQ_MENU" },
        { text: "📞 Перезвоните мне", payload: "CALLBACK_MENU" }
      ]
    ];

    if (role === "dekanat" || role === "admin") {
      rows.push([
        { text: "📢 Рассылка", payload: "DEKANAT_BROADCAST" },
        { text: "📂 Заявки", payload: "DEKANAT_REQUESTS" }
      ]);

      rows.push([{ text: "☎️ Перезвоны", payload: "DEKANAT_CALLBACKS" }]);
    }

    if (userId === ADMIN_ID) {
      rows.push([{ text: "⚙️ Управление ролями", payload: "ADMIN_ROLES" }]);
    }

    await ctx.reply("Добро пожаловать! Выберите действие:", {
      attachments: [kb(rows)],
    });
    return;
  }

  // ======================================================
  // ADMIN — /role <user_id> <role>
  // ======================================================
  if (text.startsWith("/role") && userId === ADMIN_ID) {
    const [, uidStr, role] = text.split(/\s+/);
    const uid = Number(uidStr);

    if (!uid || !role) {
      return ctx.reply("Использование: /role <user_id> <user|dekanat|admin>");
    }

    await runPython("set_user_role", [String(uid), role]);
    return ctx.reply(`Роль пользователя ${uid} изменена на ${role}`);
  }

  // ======================================================
  // USER REQUEST: "тип: текст"
  // ======================================================
  if (text.includes(":")) {
    const [type, body] = text.split(":", 2).map((s) => s.trim());
    if (!body) {
      return ctx.reply("Формат:\nтип: текст\nНапример:\nсправка: нужна справка");
    }

    const req = await runPython("create_request", [
      String(userId),
      type.toLowerCase(),
      body,
    ]);

    return ctx.reply(`Заявка принята! ID: ${req?.id}`);
  }

  // ======================================================
  // CALLBACK REQUEST: телефон
  // ======================================================
  if (/^\+?\d{7,15}$/.test(text.trim())) {
    await runPython("create_callback", [
      String(userId),
      text.trim(),
      "",
    ]);

    return ctx.reply("Заявка на перезвон принята! Вам перезвонят.");
  }

  return ctx.reply("Не понял. Напишите /start");
}

// ======================================================
// CALLBACK BUTTON HANDLER
// ======================================================
async function handleCallback(ctx) {
  const userId = extractUserId(ctx);
  const payload = ctx?.callback?.payload;

  if (!userId) return;

  // авто-регистрация
  const name =
    ctx?.callback?.user?.first_name ||
    ctx?.message?.sender?.first_name ||
    "";
  await runPython("ensure_user", [String(userId), name]);

  // ======================================================
  // Подать заявку
  // ======================================================
  if (payload === "REQ_MENU") {
    return ctx.reply(
      "Напишите заявку в формате:\n\nтип: текст\nНапример:\nсправка: нужна справка"
    );
  }

  // ======================================================
  // Перезвон
  // ======================================================
  if (payload === "CALLBACK_MENU") {
    return ctx.reply("Введите номер телефона:");
  }

  // ======================================================
  // Деканат — список заявок
  // ======================================================
  if (payload === "DEKANAT_REQUESTS") {
    const list = await runPython("list_requests", []);
    if (!list.length) return ctx.reply("Заявок пока нет.");

    let msg = "📂 Заявки:\n\n";
    for (const r of list) {
      msg += `ID ${r.id}\nТип: ${r.type}\nОт: ${r.user_id}\nСтатус: ${r.status}\n\n`;
    }

    return ctx.reply(msg);
  }

  // ======================================================
  // Деканат — перезвоны
  // ======================================================
  if (payload === "DEKANAT_CALLBACKS") {
    const list = await runPython("list_callbacks", []);
    if (!list.length) return ctx.reply("Нет заявок на перезвон.");

    let msg = "☎️ Перезвоны:\n\n";
    for (const r of list) {
      msg += `ID ${r.id}\nТелефон: ${r.phone}\nОт: ${r.user_id}\nСтатус: ${r.status}\n\n`;
    }

    return ctx.reply(msg);
  }

  // ======================================================
  // Деканат — рассылка
  // ======================================================
  if (payload === "DEKANAT_BROADCAST") {
    const role = await getRole(userId);
    if (!(role === "dekanat" || role === "admin")) {
      return ctx.reply("❌ Недостаточно прав.");
    }

    composeState.set(userId, { mode: "broadcast", attachments: [] });

    console.log("FSM SET:", userId);

    return ctx.reply(
      "Отправьте текст рассылки или вложения.\n" +
      "Когда отправите текст — начну рассылку."
    );
  }

  // ======================================================
  // Admin — управление ролями
  // ======================================================
  if (payload === "ADMIN_ROLES") {
    return ctx.reply("Команда:\n/role <user_id> <user|dekanat|admin>");
  }
}

// ======================================================
// Register handlers
// ======================================================
bot.on("message_created", handleMessage);
bot.on("message_callback", handleCallback);

// ======================================================
// Start bot
// ======================================================
bot.start().then(() => {
  console.log("Бот «Деканат 24/7» запущен!");
});
