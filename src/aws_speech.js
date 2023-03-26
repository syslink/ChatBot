import * as dotenv from 'dotenv';
import log4js from 'log4js';
import { Polly, StartSpeechSynthesisTaskCommand } from "@aws-sdk/client-polly";
import { S3, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import FfmpegCommand  from 'fluent-ffmpeg';
import fs from 'fs';
import { getTelegramId } from './web3Auth.js';
import Languages from './languages.json' assert { type: "json" };

export class AWSSpeechWrapper {
  constructor(telegramBot, speech_key, speech_secret, mongodb, logger) {
    this.telegramBot = telegramBot;
    this.mongodb = mongodb;
    this.logger = logger;

    this.polly = new Polly({
      region: "us-east-1", // Replace with your AWS region
      credentials: {
        accessKeyId: speech_key,
        secretAccessKey: speech_secret,
      },
    });

    this.s3 = new S3({
      region: "us-east-1", // Replace with your AWS region
      credentials: {
        accessKeyId: speech_key,
        secretAccessKey: speech_secret,
      },
    });
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
        OutputFormat: 'ogg_vorbis',
        Text: completion,
        TextType: "text",
        VoiceId: 'Joanna',
        OutputS3BucketName: "chatbot-synthesis",
        OutputS3KeyPrefix: "polly/",
    };
    
    // Create the synthesis task
    const startSynthesisTaskCommand = new StartSpeechSynthesisTaskCommand(params);
    const synthesisTask = await this.polly.send(startSynthesisTaskCommand);
    const taskId = synthesisTask.SynthesisTask.TaskId;
    console.log('taskId', taskId);
    // Wait for the task to complete
    const checkTaskParams = { TaskId: taskId };
    let synthesisResult = null;
    while (synthesisResult === null || synthesisResult.SynthesisTask.TaskStatus !== "completed") {
      synthesisResult = await this.polly.getSpeechSynthesisTask(checkTaskParams);
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 5 seconds
    }
    //console.log('synthesisResult', synthesisResult);

    const audioUrl = synthesisResult.SynthesisTask.OutputUri;

    const s3Params = {
      Bucket: 'chatbot-synthesis',
      Key: audioUrl.substring(audioUrl.indexOf('polly'))
    }; 
    const command = new GetObjectCommand(s3Params);
    const signedUrl = await getSignedUrl(this.s3, command, { expiresIn: 60 });
    
    const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;                  
    if (this.telegramBot != null) {
        if (bSendTextMsg) {
            await this.telegramBot.getNativeBot().sendMessage(chatId, response, { parse_mode: 'Markdown' });
        }
        await this.telegramBot.getNativeBot().sendVoice(chatId, signedUrl);
    }
    if (this.mongodb != null) 
      await this.mongodb.insertDialog(getTelegramId(msg.from.id), prompt, completion, 'voice', 'en-us');
  }
}

const test = async () => {
  dotenv.config();
  log4js.configure({
    appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
    categories: { default: { appenders: ["chatbot"], level: "debug" } },
  });
  var logger = log4js.getLogger("chatbot");

  const { aws_access_key, aws_secret_key } = process.env;

  const speech = new AWSSpeechWrapper(null, aws_access_key, aws_secret_key, null, logger);
  // speech.setLanguage('111', "法语");
  console.log('synthesizeVoice');

  const msg = {
    from: {id: 1},
    chat: {id: 2},
    message_id: 3
  }
  speech.synthesizeVoice('hello', 'what can i do for you? I am in America. ', msg, '英语', true);
}

//test();