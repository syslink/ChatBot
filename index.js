import * as dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'
import { 
  SpeechConfig, 
  AudioConfig, 
  SpeechRecognizer, 
  SpeechSynthesizer, 
  ResultReason, 
  CancellationDetails } from "microsoft-cognitiveservices-speech-sdk";
import { Configuration, OpenAIApi } from "openai";
import FfmpegCommand  from 'fluent-ffmpeg';
import fs from 'fs';
import {getTelegramId, sign, checkVip} from './web3Auth.js';
import log4js from 'log4js';
import { MongoClient } from 'mongodb';

// const { FfmpegCommand } = Ffmpeg;

dotenv.config()
log4js.configure({
  appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
  categories: { default: { appenders: ["chatbot"], level: "debug" } },
});
var logger = log4js.getLogger("chatbot");

const { mongodbUrl, speakbot_token, apiKey, gptModel, group_name, SPEECH_KEY, SPEECH_REGION, maxEnglishDialogNumber } = process.env
const prefix = group_name ? '/' + group_name : '/gpt'
const bot = new TelegramBot(speakbot_token, { polling: true});
logger.info(new Date().toLocaleString(), '--Bot has been started...');
const userStat = {}
const startVip = false;
let mongodbo;
let mongodbCol;
const client = new MongoClient(mongodbUrl);

console.log(mongodbUrl);
client.connect((err) => {
  if (err) {
    console.log(err);
    return;
  }
  console.log(db);
  // Table is the name of your table
  mongodbo = client.db("chatbot");
  mongodbCol = mongodbo.collection('englishDialog');

  mongodbCol.insertOne({
    telegramId: getTelegramId(1000),
    prompt: "abc",
    completion: "def"
  }, (err, res) => {
    console.log(err, res);
    if (err) {
      logger.error(error);
    }
  });
});

const configuration = new Configuration({
  apiKey,
});
const openai = new OpenAIApi(configuration);

// This example requires environment variables named "SPEECH_KEY" and "SPEECH_REGION"
const speechConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
speechConfig.speechRecognitionLanguage = "en-US";
speechConfig.speechSynthesisLanguage = 'en-US';
speechConfig.speechSynthesisVoiceName = "en-US-JennyNeural"; 

function recognizeVoice(msg, fileName) {
  let audioConfig = AudioConfig.fromWavFileInput(fs.readFileSync(fileName));
  let speechRecognizer = new SpeechRecognizer(speechConfig, audioConfig);

  speechRecognizer.recognizeOnceAsync(result => {
      switch (result.reason) {
          case ResultReason.RecognizedSpeech:
              logger.debug(`RECOGNIZED Text = ${result.text}`);
              msg.text = result.text;
              speechRecognizer.close();
              msgHandler(msg);
              break;
          case ResultReason.NoMatch:
            speechRecognizer.close();
              logger.debug("NOMATCH: Speech could not be recognized.");
              break;
          case ResultReason.Canceled:
              speechRecognizer.close();
              const cancellation = CancellationDetails.fromResult(result);
              logger.debug(`CANCELED: Reason=${cancellation.reason}`);

              if (cancellation.reason == CancellationReason.Error) {
                  logger.error(`CANCELED: ErrorCode=${cancellation.ErrorCode}`);
                  logger.error(`CANCELED: ErrorDetails=${cancellation.errorDetails}`);
                  logger.error("CANCELED: Did you set the speech resource key and region values?");
              }
              break;
      }
      speechRecognizer = null;
  });
}

function synthesizeVoice(prompt, completion, msg) {
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  const fileName = `./voiceFiles/${chatId}-${msgId}-res.wav`;
  const outputFileName = `./voiceFiles/${chatId}-${msgId}-res.ogg`;
  const audioConfig = AudioConfig.fromAudioFileOutput(fileName);
  let synthesizer = new SpeechSynthesizer(speechConfig, audioConfig);

  synthesizer.speakTextAsync(completion,
    function (result) {
      if (result.reason === ResultReason.SynthesizingAudioCompleted) {
        logger.debug("synthesis finished.", fileName, ", duration=", result.audioDuration);
        const ffmpeg = new FfmpegCommand();
        ffmpeg.input(fileName)
              .output(outputFileName)
              .on('end', async function() {
                logger.debug(fileName + ' => ' + outputFileName);
                const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;
                const duration = 
                await bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                await bot.sendVoice(chatId, outputFileName, {duration: parseInt(result.audioDuration / 1000000) / 10});
                // mongodbCol.insertOne({
                //   telegramId: getTelegramId(msg.from.id),
                //   prompt,
                //   completion
                // }, (err, res) => {
                //   if (err) {
                //     logger.error(error);
                //   }
                // });
                //ffmpeg.ffmpegProc.kill();
              })
              .on('error', function(err) {
                logger.error(fileName + ' =xx=> ' + outputFileName + ", error:" + err.message);
                //ffmpeg.close();
              })
              .run(); 
      } else {
        logger.error("Speech synthesis canceled, " + result.errorDetails +
            "\nDid you set the speech resource key and region values?");
      }
      synthesizer.close();
      synthesizer = null;
    },
    function (err) {
      logger.error("err - " + err);
      synthesizer.close();
      synthesizer = null;
    });
}


bot.on('text', async (msg) => {
  logger.info(new Date().toLocaleString(), '--Received message from id:', msg.chat.id, ':', msg.text);  
  msg.type = 'text';
  await msgHandler(msg);
});

async function checkUserValid(msg) {
  if (userStat[msg.from.id] !== undefined && userStat[msg.from.id].bVip) return true;

  if (userStat[msg.from.id] === undefined) {
    userStat[msg.from.id] = {bVip: false, voiceNum: 1};
    return true;
  }
  if (startVip) {
    if (userStat[msg.from.id].voiceNum >= maxEnglishDialogNumber) {
      const bVip = await checkVip(msg.from.id);
      userStat[msg.from.id].bVip = bVip;
      if (!bVip) {
        return false;
      }
    }
  }

  userStat[msg.from.id].voiceNum++;
  return true;
}

bot.on('voice', async (msg) => {
  let bPass = await checkUserValid(msg);
  if (!bPass) {
    await bot.sendMessage(msg.chat.id, '对不起，如果您希望继续同我进行英语对话，请登录网站https://chatbot.nextnft.world, 并注册成为VIP用户');
    return;
  }
  const fileId = msg.voice.file_id;
  const chatId = msg.chat.id;
  const msgId = msg.message_id;
  msg.type = 'voice';
  bot.getFileLink(fileId).then(fileLink => {
    // 下载语音文件
    bot.downloadFile(fileId, './').then(voicePath => {
      const fileName = `./voiceFiles/${chatId}-${msgId}.ogg`;
      const outputFileName = `./voiceFiles/${chatId}-${msgId}.wav`;
      fs.renameSync(voicePath, fileName);
      const ffmpeg = new FfmpegCommand();
      ffmpeg.input(fileName)
            .output(outputFileName)
            .on('end', function() {
              logger.debug('\n\n' + fileName + ' => ' + outputFileName);
              recognizeVoice(msg, outputFileName);
              //ffmpeg.close();
            })
            .on('error', function(err) {
              logger.error(fileName + ' =xx=> ' + outputFileName + err.message);
              //ffmpeg.close();
            })
            .run();            
    });
  });
});

async function msgHandler(msg) {
  if (typeof msg.text !== 'string' || ((msg.chat.type === 'group' || msg.chat.type === 'supergroup') && msg.type === 'text' && !msg.text.startsWith(prefix))) {  
    return;
  }
  switch (true) {
    case msg.text.startsWith('/start'):
      await bot.sendMessage(msg.chat.id, '👋您好！我是ChatGPT，您可以同我文字交谈，也可以跟我英语语音交谈，助您提升英语口语水平');
      break;
    case msg.text.startsWith('/verify'):
      const signature = sign(msg.from.id, msg.text.substr('/verify '.length));
      logger.debug(signature);
      await bot.sendMessage(msg.chat.id, JSON.stringify(signature));
      break;
    case msg.text.length >= 2:
      await chatGpt(msg, msg.type === 'voice');
      break;
    default:
      await bot.sendMessage(msg.chat.id, '😭我不太明白您的意思。');
      break;
  }
}

async function chatGpt(msg, bVoice) {
  try {
    await getResponseFromOpenAI(msg, bVoice);
  } catch (err) {
    logger.error('Error:', err)
    await bot.sendMessage(msg.chat.id, '😭出错了，请稍后再试；如果您是管理员，请检查日志。');
    throw err
  }
}

async function getResponseFromOpenAI(msg, bVoice) {
  let intervalId;
  try {
    bot.sendChatAction(msg.chat.id, 'typing');
    intervalId = setInterval(() => {
        bot.sendChatAction(msg.chat.id, bVoice ? 'record_voice' : 'typing');
    }, 5000);
    const prompt = msg.text.startsWith(prefix) ? msg.text.replace(prefix, '') : msg.text;
    const res = await openai.createCompletion({
        model: gptModel,
        prompt,
        max_tokens: bVoice ? 200 : 1000,
        top_p: 1,
        stop: "###",
    }, { responseType: 'json' });
    let resText = res.data.choices[0].text;
    clearInterval(intervalId);
    if (resText.indexOf("\n\n") > 0) {
        resText = resText.substr(resText.indexOf("\n\n") + "\n\n".length);
    }
    logger.debug(resText.trim());
    if (!bVoice)
      await bot.sendMessage(msg.chat.id, resText);
    else {
      synthesizeVoice(prompt, resText, msg);
    }
    return;
  } catch (error) {
      clearInterval(intervalId);
      if (error.response?.status) {
          logger.error(error.response.status, error.message);    
          await bot.sendMessage(msg.chat.id, '😭被限速了，请稍后再试，错误代码: ' + error.response.status);      
      } else {
          logger.error('An error occurred during OpenAI request', error);
          await bot.sendMessage(msg.chat.id, '😭出错了，请稍后再试');
      }
  }
}