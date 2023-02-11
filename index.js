import * as dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'
import { ChatGPTAPI } from 'chatgpt'
import { Configuration, OpenAIApi } from "openai";

dotenv.config()

const { token, apiKey, group_name, temperature, presence_penalty } = process.env
const prefix = group_name ? '/' + group_name : '/gpt'
const bot = new TelegramBot(token, { polling: true});
console.log(new Date().toLocaleString(), '--Bot has been started...');

const configuration = new Configuration({
  apiKey,
});
const openai = new OpenAIApi(configuration);

// const api = new ChatGPTAPI({ apiKey, completionParams: {
//   temperature,
//   presence_penalty,
// } })

bot.on('text', async (msg) => {
  console.log(new Date().toLocaleString(), '--Received message from id:', msg.chat.id, ':', msg.text);
  await msgHandler(msg);
});

async function msgHandler(msg) {
  if (typeof msg.text !== 'string' || ((msg.chat.type === 'group' || msg.chat.type === 'supergroup') && !msg.text.startsWith(prefix))) {  
    return;
  }
  switch (true) {
    case msg.text.startsWith('/start'):
      await bot.sendMessage(msg.chat.id, '👋您好！我是ChatGPT，很高兴能与您交谈？');
      break;
    case msg.text.length >= 2:
      await chatGpt(msg);
      break;
    default:
      await bot.sendMessage(msg.chat.id, '😭我不太明白您的意思。');
      break;
  }
}

async function chatGpt(msg) {
  try {
    const tempId = (await bot.sendMessage(msg.chat.id, '🤔正在思考并组织语言，请稍等...', {
      reply_to_message_id: msg.message_id
    })).message_id;
    //const response = await api.sendMessage(msg.text.replace(prefix, ''))
    await getResponseFromOpenAI(msg, tempId);
  } catch (err) {
    console.log('Error:', err)
    await bot.sendMessage(msg.chat.id, '😭出错了，请稍后再试；如果您是管理员，请检查日志。');
    throw err
  }
}

async function getResponseFromOpenAI(msg, tempId) {
  try {
    bot.sendChatAction(msg.chat.id, 'typing');
    const intervalId = setInterval(() => {
        bot.sendChatAction(msg.chat.id, 'typing');
    }, 5000);
    const res = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: msg.text.replace(prefix, ''),
        max_tokens: 4000,
        n:1,
        stop: "",
    }, { responseType: 'json' });
    clearInterval(intervalId);
    console.log(res.data.choices[0].text);
    await bot.editMessageText(res.data.choices[0].text, { parse_mode: 'Markdown', chat_id: msg.chat.id, message_id: tempId });
    return;
  } catch (error) {
      if (error.response?.status) {
          console.error(error.response.status, error.message);
          error.response.data.on('data', async (data) => {
              const message = data.toString();
              try {
                  const parsed = JSON.parse(message);
                  console.error('An error occurred during OpenAI request: ', parsed);
              } catch(error) {
                  console.error('An error occurred during OpenAI request: ', message);
              }
          });
      } else {
          console.error('An error occurred during OpenAI request', error);
      }
      await bot.sendMessage(msg.chat.id, '😭出错了，请稍后再试');
  }
}