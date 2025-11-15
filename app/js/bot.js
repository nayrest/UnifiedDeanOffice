// ======================================================
//  UnifiedDeanOffice — Bot (MVP "Деканат 24/7")
// ======================================================

import { Bot, Keyboard } from "@maxhub/max-bot-api";
import dotenv from "dotenv";
dotenv.config();

import { runPython } from "./pythonBridge.js";
import { sendBroadcastToAll } from "./notifications.js";

// ======================================================
//  Bot Init
// ======================================================
const bot = new Bot(process.env.BOT_TOKEN);


// ======================================================
//  Database Init
// ======================================================
await runPython("init_db", []);

// ======================================================
//  Extract user_id from any update
// ======================================================

const VALID_ROLES = ["admin", "dekanat", "user"];

function extractUserId(ctx) {
  return (
    ctx?.callback?.user?.user_id ||
    ctx?.message?.sender?.user_id ||
    ctx?.user?.user_id ||
    null
  );
}

// ======================================================
//  Inline keyboard helper
// ======================================================
function kb(rows) {
  return Keyboard.inlineKeyboard(
    rows.map((row) =>
      row.map((b) =>
        Keyboard.button.callback(b.text, b.payload)
      )
    )
  );
}

// ======================================================
//  FSM — broadcast mode
// ======================================================
const composeState = new Map(); // user_id -> { mode, attachments }

// ======================================================
//  Get user role
// ======================================================
async function getRole(userId) {
  const u = await runPython("get_user", [String(userId)]);
  return u?.role || "user";
}

// ======================================================
//  HELP TEXT
// ======================================================
async function showHelp(ctx) {
  const text = `
<b>Помощь по использованию чат-бота</b>

Добро пожаловать в <b>«Единый деканат 24/7»</b>!

<b>⚙ Команды:</b>
• <b>/start</b> — главное меню  
• <b>/help</b> — помощь  
• <b>/about</b> — сведения о проекте

<b>Для студентов:</b>
• «тип: текст» — подать заявку  
• отправить телефон — запросить перезвон

<b>Для деканата:</b>
• обработка заявок  
• просмотр перезвонов  
• рассылки

<b>Для администратора:</b>
• /role id role — изменить роль
  `;

  return ctx.reply(text, {
    format: "html",
    attachments: [
      kb([
        [{ text: "Назад", payload: "BACK_TO_MENU" }]
      ])
    ]
  });
}

// ======================================================
//  ABOUT TEXT
// ======================================================
async function showAbout(ctx) {
  const text = `
<b>О проекте «Единый деканат 24/7»</b>

Этот чат-бот помогает студентам и деканату:
• подача заявок  
• запросы на перезвон  
• автоматизация рутинных процессов  
• централизованные рассылки  
  `;

  return ctx.reply(text, {
    format: "html",
    attachments: [
      kb([
        [{ text: "Назад", payload: "BACK_TO_MENU" }]
      ])
    ]
  });
}

// ======================================================
//  MAIN MENU
// ======================================================
async function showMainMenu(ctx, userId) {
  const role = await getRole(userId);

  const rows = [];

  // ==== Для обычного пользователя ====
  if (role === "user") {
    rows.push([
      { text: "Подать заявку", payload: "REQ_MENU" },
      { text: "Перезвоните мне", payload: "CALLBACK_MENU" }
    ]);
    rows.push([
      { text: "Мои заявки", payload: "USER_MY_REQUESTS" }
    ]);
  }

  // ==== Общие кнопки ====
  rows.push([
    { text: "Помощь", payload: "HELP_MENU" },
    { text: "О проекте", payload: "ABOUT_MENU" }
  ]);

  // ==== Кнопки деканата ====
  if (role === "dekanat" || role === "admin") {
    rows.push([
      { text: "Рассылка", payload: "DEKANAT_BROADCAST" },
      { text: "Заявки", payload: "DEKANAT_REQUESTS" }
    ]);

    rows.push([
      { text: "Перезвоны", payload: "DEKANAT_CALLBACKS" }
    ]);
  }

  // ==== Только для администратора ====
  if (role === "admin") {
    rows.push([
      { text: "Управление ролями", payload: "ADMIN_ROLES" }
    ]);
  }

  return ctx.reply("Добро пожаловать! \nВыберите действие:", {
    attachments: [kb(rows)],
  });
}

async function notifyUserAboutRequest(requestId, message) {
  const req = await runPython("get_request", [requestId]);
  if (!req || !req.user_id) return;

  try {
    await bot.api.sendMessageToUser(req.user_id, message);
  } catch (err) {
    console.error(`Не удалось уведомить пользователя ${req.user_id}:`, err);
  }
}

async function showRequestsWithFilter(ctx, userId, filter = "all") {
  const role = await getRole(userId);
  if (!["dekanat", "admin"].includes(role)) {
    return ctx.reply("Доступ запрещён.");
  }

  const list = await runPython("list_requests_filtered", [filter]);

  const titles = {
    all: "все",
    new: "новые",
    in_progress: "в работе",
    done: "выполненные",
    rejected: "отклонённые"
  };
  let msg = `<b>Заявки</b> — ${titles[filter] || "все"}\n\n`;
  const keyboard = [];

  if (!list.length) {
    msg += "Заявок нет.";
  } else {
    for (const r of list) {
      const name = r.user_name ? ` (${r.user_name})` : "";
      const emoji = {
        new: "Новые",
        in_progress: "В работе",
        done: "Готово",
        rejected: "Отклонено"
      }[r.status] || "?";

      msg += `${emoji} <b>ID: ${r.id}</b>\n`;
      msg += `Тип: <b>${r.type}</b>\n`;
      msg += `От: <b>${r.user_id}${name}</b>\n`;
      msg += `Статус: <b>${r.status}</b>\n\n`;

      if (!["done", "rejected"].includes(r.status)) {
        keyboard.push([
          { text: `В работе #${r.id}`, payload: `REQ_PROGRESS_${r.id}` },
          { text: `Готово #${r.id}`, payload: `REQ_DONE_${r.id}` },
          { text: `Отклонить #${r.id}`, payload: `REQ_REJECT_${r.id}` }
        ]);
      }
    }
  }

  // Фильтры внизу
  keyboard.push(
    [
      { text: "Все", payload: "REQ_FILTER_all" },
      { text: "Новые", payload: "REQ_FILTER_new" },
      { text: "В работе", payload: "REQ_FILTER_in_progress" }
    ],
    [
      { text: "Выполнено", payload: "REQ_FILTER_done" },
      { text: "Отклонено", payload: "REQ_FILTER_rejected" },
      { text: "Назад", payload: "BACK_TO_MENU" }
    ]
  );

  return ctx.reply(msg, {
    format: "html",
    attachments: [kb(keyboard)]
  });
}

bot.on("bot_started", async (ctx) => {
  const userId = ctx.user?.user_id;
  if (!userId) return;

  // Авторегистрация
  await runPython("ensure_user", [String(userId), ctx.user?.first_name || ""]);

  // Показываем главное меню
  return showMainMenu(ctx, userId);
});

// ======================================================
//  MESSAGE HANDLER
// ======================================================
bot.on("message_created", async (ctx) => {
  const userId = extractUserId(ctx);
  if (!userId) return;

  const text = ctx?.message?.body?.text || "";
  const attachments = ctx?.message?.body?.attachments || [];

  // AUTO-REGISTER USER
  const name = ctx?.message?.sender?.first_name || "";
  await runPython("ensure_user", [String(userId), name]);

  // FSM broadcast mode
  const state = composeState.get(userId);

  if (state?.mode === "broadcast") {
    if (attachments.length > 0) {
      state.attachments.push(...attachments);
      composeState.set(userId, state);
      return ctx.reply(
        `Добавлено вложений: ${attachments.length}. Теперь отправьте текст — начну рассылку.`
      );
    }

    if (text.trim()) {
      composeState.delete(userId);
      await ctx.reply("Начинаю рассылку…");

      const res = await sendBroadcastToAll(
        userId,
        text.trim(),
        state.attachments
      );

      return ctx.reply(
        `Готово!\nОтправлено: ${res.sent}\nПропущено: ${res.skipped}`
      );
    }

    return;
  }

  if (state?.mode === "awaiting_request_body") {
    if (text.trim().toLowerCase() === "отмена") {
      composeState.delete(userId);
      await ctx.reply("Подача заявки отменена.");
      return showMainMenu(ctx, userId);
    }

    const type = state.request_type;
    const body = text.trim();

    const result = await runPython("create_request", [
      String(userId),
      type,
      body
    ]);

    composeState.delete(userId);

    if (result?.id) {
      await ctx.reply(
        `Заявка успешно подана!\n\n` +
        `ID: <b>${result.id}</b>\n` +
        `Тип: <b>${type}</b>`,
        { format: "html" }
      );

      // Опционально: уведомить деканат о новой заявке
      // await notifyDekanatNewRequest(result);
    } else {
      await ctx.reply("Ошибка при создании заявки. Попробуйте позже.");
    }

    return showMainMenu(ctx, userId);
  }

  // FSM: отклонение заявки
  if (state?.mode === "reject_request") {
    const reqId = state.request_id;
    const comment = text.trim();

    if (text.toLowerCase() === "отмена") {
      composeState.delete(userId);
      await ctx.reply("Отклонение отменено.");
      return showMainMenu(ctx, userId);
    }

    await runPython("update_request_status", [reqId, "rejected", comment, String(userId)]);
    composeState.delete(userId);

    await ctx.reply(`Заявка #${reqId} отклонена`);
    await notifyUserAboutRequest(reqId, `Ваша заявка отклонена\nПричина: ${comment}`);
    return showRequestsWithFilter(ctx, userId);
  }

  // /start
  if (text === "/start") {
    return showMainMenu(ctx, userId);
  }

  // /help
  if (text === "/help") {
    return showHelp(ctx);
  }

  // /about
  if (text === "/about") {
    return showAbout(ctx);
  }

  // Admin command: /role
  if (text.startsWith("/role")) {
    const role = await getRole(userId);
    if (role !== "admin") {
      return ctx.reply("Недостаточно прав.");
    }
    
    const [, uidStr, newRole] = text.split(/\s+/);
    const uid = Number(uidStr);
    if (!uid || !newRole) {
      return ctx.reply(
        "Неверный формат.\nИспользование: /role <user_id> <user|dekanat|admin>"
      );
    }

    // Проверка роли
    if (!VALID_ROLES.includes(newRole)) {
      return ctx.reply(
        `Роль <b>${newRole}</b> не существует.\n\n` +
        `Доступные роли:\n• admin\n• dekanat\n• user`,
        { format: "html" }
      );
    }

    // Проверяем наличие пользователя
    const exists = await runPython("get_user", [String(uid)]);

    if (!exists) {
      return ctx.reply(
        `Пользователь с ID <b>${uid}</b> не найден в системе.`,
        { format: "html" }
      );
    }

    await runPython("set_user_role", [String(uid), newRole]);
    return ctx.reply(`✔ Роль пользователя <b>${uid}</b> изменена на <b>${newRole}</b>`, {
      format: "html",
    });
  }

  // Request: "тип: текст"
  if (text.includes(":")) {
    const [type, body] = text.split(":", 2).map((s) => s.trim());
    if (!body) {
      return ctx.reply("Неверный формат. Пример:\nсправка: нужна 095/у");
    }

    const req = await runPython("create_request", [
      String(userId),
      type.toLowerCase(),
      body,
    ]);

    return ctx.reply(`Заявка принята! ID: ${req?.id}`);
  }

  // Phone for callback
  if (/^\+?\d{7,15}$/.test(text.trim())) {
    await runPython("create_callback", [String(userId), text.trim(), ""]);
    return ctx.reply("Заявка на перезвон принята! Вам позвонят.");
  }

  return ctx.reply("Команда не распознана. Нажмите /help");
});

// ======================================================
//  CALLBACK HANDLER
// ======================================================
bot.on("message_callback", async (ctx) => {
  const userId = extractUserId(ctx);
  const payload = ctx?.callback?.payload;

  console.log("CALLBACK PAYLOAD:", ctx.callback.payload);  // ← ЭТА СТРОКА
  console.log("FULL CTX:", ctx);

  if (!userId) return;

  const name =
    ctx?.callback?.user?.first_name ||
    ctx?.message?.sender?.first_name ||
    "";
  await runPython("ensure_user", [String(userId), name]);

  // HELP
  if (payload === "HELP_MENU") {
    return showHelp(ctx);
  }

  // ABOUT
  if (payload === "ABOUT_MENU") {
    return showAbout(ctx);
  }

  // Back to main menu
  if (payload === "BACK_TO_MENU") {
    return showMainMenu(ctx, userId);
  }

  // Callback request
  if (payload === "CALLBACK_MENU") {
    return ctx.reply("Введите номер телефона:");
  }

  // === Деканат: заявки ===
  if (payload === "DEKANAT_REQUESTS") {
    return showRequestsWithFilter(ctx, userId, "all");
  }

  if (payload === "REQ_MENU") {
    const rows = [
      [
        { text: "Справка об обучении", payload: "REQ_TYPE_справка" },
        { text: "Академическая (095/у)", payload: "REQ_TYPE_академическая" }
      ],
      [
        { text: "Повторная сессия", payload: "REQ_TYPE_сессия" },
        { text: "Зачётка / справка", payload: "REQ_TYPE_зачётка" }
      ],
      [
        { text: "Академ. отпуск / выход", payload: "REQ_TYPE_отпуск" },
        { text: "Другое", payload: "REQ_TYPE_другое" }
      ],
      [{ text: "Назад", payload: "BACK_TO_MENU" }]
    ];

    return ctx.reply(
      "<b>Выберите тип заявки:</b>\n\n" +
      "Или просто напишите вручную:\n" +
      "<code>тип: ваш текст</code>\n" +
      "Например: <code>справка: нужна в военкомат</code>",
      {
        format: "html",
        attachments: [kb(rows)]
      }
    );
  }

  // === Обработка выбора типа заявки через кнопку ===
  if (payload.startsWith("REQ_TYPE_")) {
    const rawType = payload.slice(9); // после "REQ_TYPE_"

    const typeMap = {
      "справка":          { type: "справка",          prompt: "Укажите, куда нужна справка об обучении и срочно ли:" },
      "академическая":    { type: "академическая",    prompt: "Академическая справка (095/у) — укажите цель и куда предоставить:" },
      "сессия":           { type: "сессия",           prompt: "Повторная сессия — укажите дисциплины и причину:" },
      "зачётка":          { type: "зачётка",          prompt: "Дубликат зачётной книжки или справки — укажите причину:" },
      "отпуск":           { type: "отпуск",           prompt: "Академический отпуск или выход из него — укажите даты и причину:" },
      "другое":           { type: "другое",           prompt: "Опишите вашу заявку подробно:" }
    };

    const selected = typeMap[rawType] || typeMap["другое"];
    
    // Запоминаем выбранный тип
    composeState.set(userId, {
      mode: "awaiting_request_body",
      request_type: selected.type
    });

    return ctx.reply(
      `${selected.prompt}\n\n` +
      "Напишите текст заявки.\n" +
      "Для отмены — отправьте <b>отмена</b>",
      { format: "html" }
    );
  }

  // Фильтры
  if (payload.startsWith("REQ_FILTER_")) {
    const filter = payload.split("_")[2];
    const valid = ["all", "new", "in_progress", "done", "rejected"];
    const f = valid.includes(filter) ? filter : "all";
    return showRequestsWithFilter(ctx, userId, f);
  }

  // === Обработка действий с заявкой ===
  if (payload.startsWith("REQ_PROGRESS_")) {
    const reqId = payload.replace("REQ_PROGRESS_", "");
    const adminId = userId;
  
    console.log(`Taking request #${reqId} in progress by admin ${adminId}`);
  
    const result = await runPython("update_request_status", [reqId, "in_progress", null, String(adminId)]);
  
    if (result?.error) {
      await ctx.reply(`Ошибка: ${result.error}`);
    } else {
      await ctx.reply(`Заявка #${reqId} взята в работу`);
      await notifyUserAboutRequest(reqId, "Ваша заявка взята в работу");
    }
  
    return showRequestsWithFilter(ctx, userId);
  }

  if (payload.startsWith("REQ_DONE_")) {
    const reqId = payload.replace("REQ_DONE_", "");
    const adminId = userId;
  
    console.log(`Marking request #${reqId} as done by admin ${adminId}`);
  
    const result = await runPython("update_request_status", [reqId, "done", null, String(adminId)]);
  
    if (result?.error) {
      await ctx.reply(`Ошибка: ${result.error}`);
    } else {
      await ctx.reply(`Заявка #${reqId} отмечена как выполненная`);
      await notifyUserAboutRequest(reqId, "Ваша заявка выполнена!");
    }
  
    return showRequestsWithFilter(ctx, userId);
  }

  if (payload.startsWith("REQ_REJECT_")) {
    const reqId = payload.replace("REQ_REJECT_", "");
  
    console.log(`Starting rejection process for request #${reqId}`);
  
    composeState.set(userId, { 
      mode: "reject_request", 
      request_id: reqId 
    });
  
    return ctx.reply(`Введите причину отклонения заявки #${reqId}:`);
  }

  // Dean — callbacks
  if (payload === "DEKANAT_CALLBACKS") {
    const list = await runPython("list_callbacks", []);
    if (!list.length) return ctx.reply("Нет заявок на перезвон.");

    let msg = "<b>Перезвоны</b>\n\n";
    for (const r of list) {
      msg += `ID: <b>${r.id}</b>\nТелефон: ${r.phone}\nОт: ${r.user_id}\nСтатус: ${r.status}\n\n`;
    }

    return ctx.reply(msg, { format: "html" });
  }

  // Dean — broadcast
  if (payload === "DEKANAT_BROADCAST") {
    const role = await getRole(userId);
    if (!(role === "dekanat" || role === "admin")) {
      return ctx.reply("Недостаточно прав.");
    }

    composeState.set(userId, { mode: "broadcast", attachments: [] });

    return ctx.reply(
      "Отправьте текст рассылки или вложения.\nКогда отправите текст — я начну рассылку."
    );
  }

  if (payload === "USER_MY_REQUESTS") {
    const list = await runPython("list_user_requests", [String(userId)]);

    if (!list || list.length === 0) {
      return ctx.reply("У вас пока нет заявок.");
    }

    let msg = "<b>Ваши заявки</b>:\n\n";
    for (const r of list) {
      msg += `ID ${r.id}\nТип: ${r.type}\nСтатус: <b>${r.status}</b>\n\n`;
    }

    return ctx.reply(msg, { format: "html" });
  }

  // Admin panel
  if (payload === "ADMIN_ROLES") {
    return ctx.reply(
      "Использование:\n/role <id> <user|dekanat|admin>"
    );
  }
});

// ======================================================
//  Start bot
// ======================================================
bot.start().then(() => {
  console.log("Бот «Деканат 24/7» запущен!");
});
