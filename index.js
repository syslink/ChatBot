import * as dotenv from 'dotenv'
import { TelegramChatBot } from './telegramBot.js';
import { OpenAI } from './openAI.js';
import { Database } from './database.js';
import { VIP } from './vip.js';
import { SpeechWrapper } from './speech.js';
import { AWSSpeechWrapper } from './aws_speech.js';
import { Logger } from './logger.js';

dotenv.config()


var logger = new Logger();

const { mongodbUrl, speakbot_token, apiKey, gptModel, groupPrefix, aws_access_key, aws_secret_key, SPEECH_KEY, SPEECH_REGION, maxVoiceDialogNumber, bInLocal } = process.env

const mongodb = new Database(mongodbUrl, logger);
await mongodb.init();

const vip = new VIP();
const openAI = new OpenAI(apiKey, gptModel, logger);

const telegramBot = new TelegramChatBot(speakbot_token, mongodb, maxVoiceDialogNumber, true, vip, openAI, groupPrefix, logger, bInLocal == 1);
const speech = new SpeechWrapper(telegramBot, SPEECH_KEY, SPEECH_REGION, mongodb, logger);
telegramBot.startListen(speech);




