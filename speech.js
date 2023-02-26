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

export class SpeechWrapper {
  constructor(telegramBot, SPEECH_KEY, SPEECH_REGION, mongodb, logger) {
    this.ffmpeg = new FfmpegCommand();
    this.telegramBot = telegramBot;
    this.mongodb = mongodb;
    this.logger = logger;

    this.speechDefaultConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    this.speechDefaultConfig.speechRecognitionLanguage = "en-US";
    this.speechDefaultConfig.speechSynthesisLanguage = 'en-US';
    this.speechDefaultConfig.speechSynthesisVoiceName = "en-US-JennyNeural"; 

    this.userLanaguageSet = {}
  }

  async setLanguage(userId, language) {
    if (Languages[language] != undefined) {
      const userSpeechConfig = {};
      userSpeechConfig.speechRecognitionLanguage = Languages[language]['recognition'];
      userSpeechConfig.speechSynthesisLanguage =  Languages[language]['synthesisLanguage'];
      userSpeechConfig.speechSynthesisVoiceName = Languages[language]['synthesisVoiceName'];
      this.userLanaguageSet[userId] = userSpeechConfig;
      if (this.mongodb != null)
        await this.mongodb.insertOrUpdateLanguageSetting(getTelegramId(userId), userSpeechConfig);
    }
  }

  getLanguageSetting(userId) {
    return this.userLanaguageSet[userId];
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
  
  async synthesizeVoice(prompt, completion, msg, language) {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    const fileName = `./voiceFiles/${chatId}-${msgId}-res.wav`;
    const outputFileName = `./voiceFiles/${chatId}-${msgId}-res.ogg`;
    const audioConfig = AudioConfig.fromAudioFileOutput(fileName);
    const curSpeecConfig = this.userLanaguageSet[msg.from.id] == null ? this.speechDefaultConfig : this.userLanaguageSet[msg.from.id];
    const tmpLanguageType = language != null ? Languages[language] : null;
    if (tmpLanguageType != null) {
      curSpeecConfig.speechSynthesisLanguage = tmpLanguageType['synthesisLanguage'];
      curSpeecConfig.speechSynthesisVoiceName = tmpLanguageType['synthesisVoiceName'];
    }
    let synthesizer = new SpeechSynthesizer(curSpeecConfig, audioConfig);
    console.log("start synthesis voice");
    synthesizer.speakTextAsync(completion,
      function (result) {
        console.log(result);
        if (result.reason === ResultReason.SynthesizingAudioCompleted) {
          console.log("synthesis finished, start to convert wav => ogg");
          this.logger.debug("synthesis finished.", fileName, ", duration=", result.audioDuration);
          const ffmpeg = new FfmpegCommand();
          ffmpeg.input(fileName)
                .output(outputFileName)
                .on('end', async function() {
                  this.logger.debug(fileName + ' => ' + outputFileName);
                  const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;                  
                  if (this.telegramBot != null) {
                    await this.telegramBot.getNativeBot().sendMessage(chatId, response, { parse_mode: 'Markdown' });
                    await this.telegramBot.getNativeBot().sendVoice(chatId, outputFileName, {duration: parseInt(result.audioDuration / 1000000) / 10});
                  }
                  if (this.mongodb != null) 
                    await this.mongodb.insertDialog(getTelegramId(msg.from.id), prompt, completion, curSpeecConfig.speechRecognitionLanguage);
                })
                .on('error', function(err) {
                  this.logger.error(fileName + ' =xx=> ' + outputFileName + ", error:" + err.message);
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
  fs.access(fileName, fs.constants.F_OK, (err) => {
    if (err) {
      console.log('File does not exist');      
      speech.synthesizeVoice('hello', 'what can i do for you?', msg, '英语');
    } else {
      console.log('File exists');
      speech.recognizeVoice(msg, fileName);
    }
  });
}

//test();