import * as dotenv from 'dotenv'
import log4js from 'log4js';
import { TelegramChatBot } from './telegramBot.js';
import { OpenAI } from './openAI.js';
import { Database } from './database.js';
import { VIP } from './vip.js';
import { SpeechWrapper } from './speech.js';

dotenv.config()

log4js.configure({
  appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
  categories: { default: { appenders: ["chatbot"], level: "debug" } },
});
var logger = log4js.getLogger("chatbot");

const { mongodbUrl, speakbot_token, apiKey, gptModel, groupPrefix, SPEECH_KEY, SPEECH_REGION, maxVoiceDialogNumber } = process.env

const mongodb = new Database(mongodbUrl);
await mongodb.init();

const vip = new VIP();
const openAI = new OpenAI(apiKey, gptModel, logger);

const telegramBot = new TelegramChatBot(speakbot_token, mongodb, maxVoiceDialogNumber, true, vip, openAI, groupPrefix, logger);
const speech = new SpeechWrapper(telegramBot, SPEECH_KEY, SPEECH_REGION, mongodb, logger);
telegramBot.startListen(speech);




