import * as dotenv from 'dotenv';
import log4js from 'log4js';
import AWS from "aws-sdk";
import fs from 'fs';
import { getTelegramId } from './web3Auth.js';
import Languages from './languages.json' assert { type: "json" };

export class AWSSpeechWrapper {
  constructor(telegramBot, speech_key, speech_secret, mongodb, logger) {
    this.telegramBot = telegramBot;
    this.mongodb = mongodb;
    this.logger = logger;

    AWS.config.update({
        region: 'us-west-2',
        accessKeyId: speech_key,
        secretAccessKey: speech_secret
    });
    this.polly = new AWS.Polly();
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

  async synthesizeVoice(prompt, completion, msg, language, bSendTextMsg) {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;

    const params = {
        OutputFormat: 'ogg',
        Text: completion,
        VoiceId: 'Joanna'
    };
    const _this = this;
    this.polly.synthesizeSpeech(params, (err, data) => {
        if (err) {
            console.log(err);
        } else if (data.AudioStream instanceof Buffer) {
            const outputFileName = `./voiceFiles/${chatId}-${msgId}-res.ogg`;
            // 保存音频文件
            fs.writeFile(outputFileName, data.AudioStream, async (err) => {
                if (err) {
                    console.log(err);
                }
                const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;                  
                if (_this.telegramBot != null) {
                    if (bSendTextMsg) {
                        await _this.telegramBot.getNativeBot().sendMessage(chatId, response, { parse_mode: 'Markdown' });
                    }
                    await _this.telegramBot.getNativeBot().sendVoice(chatId, outputFileName, {duration: parseInt(result.audioDuration / 1000000) / 10});
                }
                if (_this.mongodb != null) 
                await _this.mongodb.insertDialog(getTelegramId(msg.from.id), prompt, completion, 'voice', curSpeecConfig.speechRecognitionLanguage);
            });
        }
      });
  }
  
  async synthesizeVoice1(prompt, completion, msg, language, bSendTextMsg) {
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
    this.logger.info("start synthesis voice:", fileName);
    const _this = this;
    synthesizer.speakTextAsync(completion,
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
  fs.access(fileName, fs.constants.F_OK, (err) => {
    if (err) {
      console.log('File does not exist');      
      speech.synthesizeVoice('hello', 'what can i do for you?', msg, '英语', true);
    } else {
      console.log('File exists');
      speech.recognizeVoice(msg, fileName);
    }
  });
}

//test();