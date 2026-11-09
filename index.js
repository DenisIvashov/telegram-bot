import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import http from 'http';

const SHEET_URL = process.env.SHEET_URL;

const token = process.env.BOT_TOKEN;
const bot = new Bot(token);

// Услуги
const services = [
    {id: "haircut", name: "Мужская стрижка"},
    {id: "beard", name: "Стрижка бороды"},
    {id: "combo", name: "Комплекс (стрижка + борода)"}
];

const userData = {}; // Временное хранилище данных пользователей

// Функция отправки в Google Sheets
// ИСПРАВЛЕНО: теперь функция возвращает true/false, чтобы знать, дошла ли заявка
async function sendToSheet(service, date, time, name, phone) {
  try {
    const res = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ service, date, time, name, phone }),
      redirect: "follow",
    });
    console.log("Статус ответа Google:", res.status);
    return res.status === 200 || res.status === 302; // успех — если сервер ответил OK
  } catch (error) {
    console.error('Ошибка отправки в Google:', error.message);
    return false; // не удалось отправить
  }
}

// 1. КОМАНДА СТАРТ
bot.command("start", (ctx) => {
    const keyboard = new InlineKeyboard().text("Записаться", "book");
    ctx.reply("Привет! Это BarberShop Omsk. Нажмите кнопку, чтобы записаться.", { reply_markup: keyboard });
});

// 2. ВЫБОР УСЛУГИ (показываем кнопки услуг)
bot.callbackQuery("book", (ctx) => {
    const keyboard = new InlineKeyboard();
    services.forEach(s => keyboard.text(s.name, `service_${s.id}`));
    ctx.editMessageText("Выберите услугу:", { reply_markup: keyboard });
    ctx.answerCallbackQuery();
});

// 3. УСЛУГА ВЫБРАНА (показываем кнопки дат)
bot.callbackQuery(/^service_/, (ctx) => {
    const serviceId = ctx.callbackQuery.data.replace('service_', '');
    const service = services.find(s => s.id === serviceId);
    const userId = ctx.from.id;

    userData[userId] = { service: service.name };

    const dateKeyboard = new InlineKeyboard()
        .text("Сегодня", "date_Сегодня")
        .text("Завтра", "date_Завтра")
        .text("Послезавтра", "date_Послезавтра");

    ctx.editMessageText(`Вы выбрали: ${service.name}. На какую дату?`, { reply_markup: dateKeyboard });
    ctx.answerCallbackQuery();
});

// 4. ДАТА ВЫБРАНА (показываем кнопки времени)
bot.callbackQuery(/^date_/, (ctx) => {
  const date = ctx.callbackQuery.data.replace("date_", "");
  const userId = ctx.from.id;

  let realDate;
  const now = new Date();
  // ИСПРАВЛЕНО: добавлена timeZone: "Asia/Omsk", иначе на сервере UTC
  // и «Сегодня» после 00:00 по Омску превращается во вчерашнюю дату
  if (date === "Сегодня") {
    realDate = now.toLocaleDateString("ru-RU", { timeZone: "Asia/Omsk" });
  } else if (date === "Завтра") {
    now.setDate(now.getDate() + 1);
    realDate = now.toLocaleDateString("ru-RU", { timeZone: "Asia/Omsk" });
  } else if (date === "Послезавтра") {
    now.setDate(now.getDate() + 2);
    realDate = now.toLocaleDateString("ru-RU", { timeZone: "Asia/Omsk" });
  }

  userData[userId].date = realDate; // Сохраняем реальную дату

  const timeKeyboard = new InlineKeyboard()
    .text("10:00", "time_10:00")
    .text("12:00", "time_12:00")
    .text("15:00", "time_15:00")
    .text("18:00", "time_18:00");

  ctx.editMessageText(`Дата: ${date}. Выберите удобное время:`, {
    reply_markup: timeKeyboard,
  });
  ctx.answerCallbackQuery();
});

// 5. ВРЕМЯ ВЫБРАНО (просим имя)
bot.callbackQuery(/^time_/, (ctx) => {
    const time = ctx.callbackQuery.data.replace('time_', '');
    const userId = ctx.from.id;
    
    userData[userId].time = time;

    ctx.editMessageText(`Время: ${time}. Отлично! Как вас зовут?`);
    ctx.answerCallbackQuery();
});

bot.command("clear", async (ctx) => {
    const userId = ctx.from.id;
    delete userData[userId];
    await ctx.deleteMessage();
    await ctx.reply("Чат очищен! Нажмите /start, чтобы начать новую запись.");
});

// 6. СБОР ИМЕНИ И ТЕЛЕФОНА
bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const data = userData[userId];

    if (!data) {
        return ctx.reply("Нажмите /start, чтобы начать запись.");
    }

    // Ждём имя
    if (data.service && data.date && data.time && !data.name) {
      data.name = text;
      ctx.reply("Отлично! Теперь ваш телефон:");
    }
    // Ждём телефон
    else if (data.name && !data.phone) {
      const cleanedPhone = text.replace(/\D/g, "");
      if (cleanedPhone.length < 11) {
        return ctx.reply(
          "Пожалуйста, введите корректный номер телефона (минимум 11 цифр):",
        );
      }
      let normalized = text.replace(/\D/g, "");
      if (normalized.startsWith("8")) {
        normalized = "+7" + normalized.slice(1);
      } else if (normalized.startsWith("7")) {
        normalized = "+" + normalized;
      } else if (normalized.length === 10) {
        normalized = "+7" + normalized;
      }
      data.phone = normalized;

      // ИСПРАВЛЕНО: сначала отправляем в таблицу и проверяем результат,
      // и только потом говорим клиенту о результате — честно
      const ok = await sendToSheet(
        data.service,
        data.date,
        data.time,
        data.name,
        data.phone,
      );

      if (ok) {
        ctx.reply(
          `✅ Заявка отправлена!\n\n` +
            `📅 Дата: ${data.date}\n` +
            `🕐 Время: ${data.time}\n` +
            `💈 Услуга: ${data.service}\n` +
            `👤 Имя: ${data.name}\n` +
            `📞 Телефон: ${data.phone}\n\n` +
            `Мы подтвердим запись по телефону. Ждём вас!`,
        );
      } else {
        // Таблица не приняла — не обманываем клиента, даём запасной канал
        ctx.reply(
          `⚠️ Не получилось отправить заявку автоматически.\n` +
            `Позвоните нам или напишите — запишем вас вручную.`,
        );
      }

      // Очищаем данные (в обоих случаях — клиент может начать заново)
      delete userData[userId];
    }
});

// HTTP-сервер для Render
const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is alive');
}).listen(port, () => {
    console.log(`Health check on port ${port}`);
});

bot.start();
