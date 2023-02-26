import * as dotenv from 'dotenv'
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
import Languages from './languages.json';

export class SpeechWrapper {
  constructor(groupName, telegramBot, openAI, SPEECH_KEY, SPEECH_REGION, mongodb, logger) {
    this.ffmpeg = new FfmpegCommand();
    this.prefix = groupName ? '/' + groupName : '/gpt'
    this.telegramBot = telegramBot;
    this.openAI = openAI;
    this.mongodb = mongodb;
    this.logger = logger;

    this.speechDefaultConfig = SpeechConfig.fromSubscription(SPEECH_KEY, SPEECH_REGION);
    speechDefaultConfig.speechRecognitionLanguage = "en-US";
    speechDefaultConfig.speechSynthesisLanguage = 'en-US';
    speechDefaultConfig.speechSynthesisVoiceName = "en-US-JennyNeural"; 

    this.userLanaguageSet = {}
  }

  setLanguage(userId, language) {
    if (Languages[language] != undefined) {
      const userSpeechConfig = {};
      userSpeechConfig.speechRecognitionLanguage = Languages[language]['recognition'];
      userSpeechConfig.speechSynthesisLanguage =  Languages[language]['synthesisLanguage'];
      userSpeechConfig.speechSynthesisVoiceName = Languages[language]['synthesisVoiceName'];
      this.userLanaguageSet[userId] = userSpeechConfig;
      this.mongodb.insertOrUpdateLanguageSetting(getTelegramId(userId), userSpeechConfig);
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
  
    synthesizer.speakTextAsync(completion,
      function (result) {
        if (result.reason === ResultReason.SynthesizingAudioCompleted) {
          this.logger.debug("synthesis finished.", fileName, ", duration=", result.audioDuration);
          const ffmpeg = new FfmpegCommand();
          ffmpeg.input(fileName)
                .output(outputFileName)
                .on('end', async function() {
                  this.logger.debug(fileName + ' => ' + outputFileName);
                  const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;
                  await this.telegramBot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                  await this.telegramBot.sendVoice(chatId, outputFileName, {duration: parseInt(result.audioDuration / 1000000) / 10});
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
