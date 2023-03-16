import * as dotenv from 'dotenv';
import log4js from 'log4js';
import { 
  SpeechConfig, 
  AudioConfig, 
  SpeechRecognizer, 
  SpeechSynthesizer, 
  ResultReason, 
  CancellationDetails } from "microsoft-cognitiveservices-speech-sdk";
import FfmpegCommand  from 'fluent-ffmpeg';
import fs from 'fs';
import { getTelegramId } from './web3Auth.js';
import Languages from './languages.json' assert { type: "json" };

// aws 语音识别：https://docs.aws.amazon.com/zh_cn/sdk-for-javascript/v3/developer-guide/transcribe-examples-section.html
// aws 语音合成：
// https://learn.microsoft.com/zh-cn/azure/cognitive-services/speech-service/language-support?tabs=tts
// https://speech.microsoft.com/portal/803454d3e71b416e8bb85f8be34071b9/audiocontentcreation/file
export class SpeechWrapper {
  constructor(telegramBot, SPEECH_KEY, SPEECH_REGION, mongodb, logger) {
    this.telegramBot = telegramBot;
    this.mongodb = mongodb;
    this.logger = logger;

    this.speechDefaultConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    this.speechDefaultConfig.speechRecognitionLanguage = "en-US";
    this.speechDefaultConfig.speechSynthesisLanguage = 'en-US';
    this.speechDefaultConfig.speechSynthesisVoiceName = "en-US-JennyNeural"; 

    this.userLanaguageSet = {}
    this.userSpeedSet = {}
  }

  async setLanguage(userId, language) {
    if (Languages[language] != null) {
      const userSpeechConfig = {};
      userSpeechConfig.speechRecognitionLanguage = Languages[language]['recognition'];
      userSpeechConfig.speechSynthesisLanguage =  Languages[language]['synthesisLanguage'];
      userSpeechConfig.speechSynthesisVoiceName = Languages[language]['synthesisVoiceName'];
      this.userLanaguageSet[userId] = userSpeechConfig;
      if (this.mongodb != null)
        await this.mongodb.insertOrUpdateLanguageSetting(getTelegramId(userId), userSpeechConfig);
      return "";
    }
    return "对象不存在";
  }

  async getLanguageSetting(userId) {
    if (this.userLanaguageSet[userId] != null) {
      return this.userLanaguageSet[userId];
    }
    if (this.mongodb != null) return null;

    const result = await this.mongodb.getLanguageSetting(getTelegramId(userId));
    if (result == null) return null;

    this.userLanaguageSet[userId] = result;
    return result;
  }

  async setSpeed(userId, speed) {
    if (speed == null || speed.length == 0) speed = 1;

    if (speed < 0.5) speed = 0.5;
    if (speed > 2) speed = 2;
    if (speed < 1) {
      speed = ('-' + (1 - speed) * 100).substring(0, 6) + '%';
    } else if (speed > 1) {
      speed = ('+' + (speed - 1) * 100).substring(0, 6) + '%';
    } else {
      speed = '0.00%';
    }
    this.userSpeedSet[userId] = speed;
    if (this.mongodb != null)
        await this.mongodb.insertOrUpdateSpeed(getTelegramId(userId), speed);
  }

  async getSpeed(userId) {
    if (this.userSpeedSet[userId] != null) return this.userSpeedSet[userId];
    const result = await this.mongodb.getSpeed(getTelegramId(userId));

    if (result == null) return '0.00%';

    this.userSpeedSet[userId] = result.speed;
    return result.speed;
  }

  async recognizeVoice(msg, fileName) {
    let audioConfig = AudioConfig.fromWavFileInput(fs.readFileSync(fileName));
    const curSpeecConfig = this.userLanaguageSet[msg.from.id] == null ? this.speechDefaultConfig : this.userLanaguageSet[msg.from.id];
    let speechRecognizer = new SpeechRecognizer(curSpeecConfig, audioConfig);
  
    speechRecognizer.recognizeOnceAsync(result => {
        switch (result.reason) {
            case ResultReason.RecognizedSpeech:
                this.logger.debug(`RECOGNIZED Text = ${result.text}`);
                msg.text = result.text;
                speechRecognizer.close();
                if (this.telegramBot != null)
                  this.telegramBot.msgHandler(msg);
                break;
            case ResultReason.NoMatch:
                speechRecognizer.close();
                this.logger.debug("NOMATCH: Speech could not be recognized.");
                break;
            case ResultReason.Canceled:
                speechRecognizer.close();
                const cancellation = CancellationDetails.fromResult(result);
                this.logger.debug(`CANCELED: Reason=${cancellation.reason}`);
  
                if (cancellation.reason == CancellationReason.Error) {
                  this.logger.error(`CANCELED: ErrorCode=${cancellation.ErrorCode}`);
                  this.logger.error(`CANCELED: ErrorDetails=${cancellation.errorDetails}`);
                  this.logger.error("CANCELED: Did you set the speech resource key and region values?");
                }
                break;
        }
        speechRecognizer = null;
    });
  }
  
  async synthesizeVoice(prompt, completion, msg, language, bSendTextMsg) {
    const userId = msg.from.id;
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    const fileName = `./voiceFiles/${chatId}-${msgId}-res.wav`;
    const outputFileName = `./voiceFiles/${chatId}-${msgId}-res.ogg`;
    const audioConfig = AudioConfig.fromAudioFileOutput(fileName);
    const userLanguageSetting = await this.getLanguageSetting(userId);
    const curSpeehConfig = userLanguageSetting == null ? this.speechDefaultConfig : userLanguageSetting;
    const tmpLanguageType = language != null ? Languages[language] : null;
    if (tmpLanguageType != null) {
      curSpeehConfig.speechSynthesisLanguage = tmpLanguageType['synthesisLanguage'];
      curSpeehConfig.speechSynthesisVoiceName = tmpLanguageType['synthesisVoiceName'];
    }
    let synthesizer = new SpeechSynthesizer(curSpeehConfig, audioConfig);
    this.logger.info("start synthesis voice:", fileName);
    const _this = this;

    const speed = await this.getSpeed(userId);
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis"
                                       xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="en-US">
                    <voice name='${curSpeehConfig.speechSynthesisVoiceName}'>
                      <mstts:express-as style='chat'>
                        <prosody rate="${speed}">
                          ${completion}
                        </prosody>
                      </mstts:express-as>
                    </voice>
                  </speak>`;
    
    synthesizer.speakSsmlAsync(ssml,
      function (result) {
        if (result.reason === ResultReason.SynthesizingAudioCompleted) {
          _this.logger.debug("synthesis finished.", fileName, ", duration=", result.audioDuration);
          const ffmpeg = new FfmpegCommand();
          ffmpeg.input(fileName)
                .output(outputFileName)
                .on('end', async function() {
                  _this.logger.debug(fileName + ' => ' + outputFileName);
                  const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;                  
                  if (_this.telegramBot != null) {
                    if (bSendTextMsg) {
                      await _this.telegramBot.getNativeBot().sendMessage(chatId, response, { parse_mode: 'Markdown' });
                    }
                    await _this.telegramBot.getNativeBot().sendVoice(chatId, outputFileName, {duration: parseInt(result.audioDuration / 1000000) / 10});
                  }
                  if (_this.mongodb != null) 
                    await _this.mongodb.insertDialog(getTelegramId(msg.from.id), prompt, completion, 'voice', curSpeecConfig.speechRecognitionLanguage);
                })
                .on('error', function(err) {
                  _this.logger.error(fileName + ' =xx=> ' + outputFileName + ", error:" + err.message);
                })
                .run(); 
        } else {
          this.logger.error("Speech synthesis canceled, " + result.errorDetails +
              "\nDid you set the speech resource key and region values?");
        }
        synthesizer.close();
        synthesizer = null;
      },
      function (err) {
        this.logger.error("err - " + err);
        synthesizer.close();
        synthesizer = null;
      });
  }
}

const test = async () => {
  dotenv.config();
  log4js.configure({
    appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
    categories: { default: { appenders: ["chatbot"], level: "debug" } },
  });
  var logger = log4js.getLogger("chatbot");

  const { SPEECH_KEY, SPEECH_REGION } = process.env;
  console.log(SPEECH_KEY, SPEECH_REGION);
  const speech = new SpeechWrapper(null, SPEECH_KEY, SPEECH_REGION, null, logger);
  speech.setLanguage('111', "法语");
  console.log(speech.getLanguageSetting('111'));

  const fileName = './voiceFiles/2-3-res.wav';
  const msg = {
    from: {id: 1},
    chat: {id: 2},
    message_id: 3
  }
  speech.synthesizeVoice('hello', 'what can i do for you? I am Jenny, an super AI, you could ask me anything.', msg, '英语', true);
}

//test();