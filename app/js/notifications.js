// app/js/notifications.js

import dotenv from "dotenv";
dotenv.config();

import { Bot } from "@maxhub/max-bot-api";
import { runPython } from "./pythonBridge.js";

const bot = new Bot(process.env.BOT_TOKEN);

/**
 * attachments → массив объектов, которые приходят от MAX:
 * [
 *   { type: "image", url: "...", token: "...", filename: "..." }
 * ]
 *
 * Мы отправляем их напрямую.
 */
async function sendToUser(userId, text, attachments) {
  try {
    await bot.api.sendMessageToUser(userId, text || "", {
      attachments: attachments?.length ? attachments : undefined,
    });
    return true;
  } catch (err) {
    console.error(`Ошибка отправки пользователю ${userId}:`, err);
    return false;
  }
}

export async function sendBroadcastToAll(adminId, text, attachments = []) {
  console.log("=== Начало рассылки ===");
  console.log("Текст:", text);
  console.log("Вложений:", attachments.length);

  const users = await runPython("list_users", []);

  let sent = 0;
  let skipped = 0;

  for (const u of users) {
    const ok = await sendToUser(u.user_id, text, attachments);
    if (ok) sent++;
    else skipped++;
  }

  console.log("=== Конец рассылки ===");

  // логируем факт рассылки
  await runPython("create_broadcast", [
    String(adminId),
    text
  ]);

  return { sent, skipped };
}
