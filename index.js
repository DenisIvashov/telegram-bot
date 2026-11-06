import "dotenv/config";
import { Bot, InlineKeyboard } from "grammy";
import http from 'http';

const SHEET_URL = 'https://script.google.com/macros/s/AKfycbwVICPyCR8MrC0916owVaDAuNWdjJWLF552mtyjx5ikGW-SqFeeXm9VDc6_q1Zb4gaY7g/exec';

const token = process.env.BOT_TOKEN;
const bot = new Bot(token);
const keyboard = new InlineKeyboard()
  .text("Услуга 1", "service_1")
  .text("Услуга 2", "service_2")
  .text("Услуга 3", "service_3");
const services = [
    {id: "service_1", name: "Услуга 1"},
    {id: "service_2", name: "Услуга 2"},
    {id: "service_3", name: "Услуга 3"}
] 
const userData = {} 

async function sendToSheet(service, name, phone) {
  try {
    const res = await fetch(SHEET_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ service, name, phone }),
      redirect: "follow",
    });
    console.log("Статус ответа Google:", res.status);
    const text = await res.text();
    console.log("Ответ Google:", text);
  } catch (error) {
    console.error('Ошибка отправки в Google:', error.message);
  }
}

bot.command("start", (ctx) => ctx.reply("Привет!"));
bot.command("menu", (ctx) => {
  ctx.reply("Выберите услугу:", { reply_markup: keyboard });
});

bot.on("message:text", async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const data = userData[userId];

    if (data && data.service && !data.name) {
        data.name = text;
        ctx.reply("Отлично! Теперь ваш телефон:")
    } else if (data && data.name && !data.phone) {
        data.phone = text;
        await sendToSheet(data.service, data.name, data.phone);
        ctx.reply(`Готово! Заявка: ${data.service}, ${data.name}, ${data.phone}`);
        delete userData[userId];
    } else {
        ctx.reply(text);
    }

});

bot.callbackQuery(/^service_/, (ctx) => {
  const serviceId = ctx.callbackQuery.data;
  const service = services.find(s => s.id === serviceId);
  const userId = ctx.from.id;

  userData[userId] = { service: service.name };

  ctx.reply(`Вы выбрали: ${service.name}. Как вас зовут?`);
  ctx.answerCallbackQuery();
});


const port = process.env.PORT || 10000;
http.createServer((req, res) => {
    res.writeHead(200);
    res.end('Bot is alive');
}).listen(port, () => {
    console.log(`Health check on port ${port}`);
});

bot.start();
