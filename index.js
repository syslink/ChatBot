import * as dotenv from 'dotenv'
import log4js from 'log4js';
import { TelegramBot } from './telegramBot.js';
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

const { mongodbUrl, speakbot_token, apiKey, gptModel, group_name, SPEECH_KEY, SPEECH_REGION, maxVoiceDialogNumber } = process.env

const mongodb = new Database(mongodbUrl);
await mongodb.init();

const vip = new VIP();
const openAI = new OpenAI(apiKey, gptModel, logger);

const telegramBot = new TelegramBot(speakbot_token, mongodb, maxVoiceDialogNumber, true, vip, speech, openAI, logger);
const speech = new SpeechWrapper('/gpt', telegramBot, SPEECH_KEY, SPEECH_REGION, mongodb, logger);
telegramBot.startListen(speech);




