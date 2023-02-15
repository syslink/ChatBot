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

// const { FfmpegCommand } = Ffmpeg;

dotenv.config()

const { textbot_token, speakbot_token, apiKey, gptModel, group_name, SPEECH_KEY, SPEECH_REGION } = process.env
const prefix = group_name ? '/' + group_name : '/gpt'
const bot = new TelegramBot(speakbot_token, { polling: true});
console.log(new Date().toLocaleString(), '--Bot has been started...');

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
              console.log(`RECOGNIZED Text = ${result.text}`);
              msg.text = result.text;
              speechRecognizer.close();
              msgHandler(msg);
              break;
          case ResultReason.NoMatch:
            speechRecognizer.close();
              console.log("NOMATCH: Speech could not be recognized.");
              break;
          case ResultReason.Canceled:
              speechRecognizer.close();
              const cancellation = CancellationDetails.fromResult(result);
              console.log(`CANCELED: Reason=${cancellation.reason}`);

              if (cancellation.reason == CancellationReason.Error) {
                  console.log(`CANCELED: ErrorCode=${cancellation.ErrorCode}`);
                  console.log(`CANCELED: ErrorDetails=${cancellation.errorDetails}`);
                  console.log("CANCELED: Did you set the speech resource key and region values?");
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
        console.log("synthesis finished.", fileName, ", duration=", result.audioDuration);
        const ffmpeg = new FfmpegCommand();
        ffmpeg.input(fileName)
              .output(outputFileName)
              .on('end', function() {
                console.log(fileName + ' => ' + outputFileName);
                const response = 'You: ' + prompt + '\n\nChatGPT: ' + completion;
                bot.sendMessage(chatId, response, { parse_mode: 'Markdown' }).then(() => {
                  bot.sendVoice(chatId, outputFileName);
                })
                //ffmpeg.ffmpegProc.kill();
              })
              .on('error', function(err) {
                console.error(fileName + ' =xx=> ' + outputFileName + ", error:" + err.message);
                //ffmpeg.close();
              })
              .run(); 
      } else {
        console.error("Speech synthesis canceled, " + result.errorDetails +
            "\nDid you set the speech resource key and region values?");
      }
      synthesizer.close();
      synthesizer = null;
    },
    function (err) {
      console.trace("err - " + err);
      synthesizer.close();
      synthesizer = null;
    });
}


bot.on('text', async (msg) => {
  console.log(new Date().toLocaleString(), '--Received message from id:', msg.chat.id, ':', msg.text);  
  msg.type = 'text';
  await msgHandler(msg);
});

bot.on('voice', msg => {
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
              console.log('\n\n' + fileName + ' => ' + outputFileName);
              recognizeVoice(msg, outputFileName);
              //ffmpeg.close();
            })
            .on('error', function(err) {
              console.error(fileName + ' =xx=> ' + outputFileName + err.message);
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
      await bot.sendMessage(msg.chat.id, '👋您好！我是ChatGPT，很高兴能与您交谈？');
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
    console.log('Error:', err)
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
    console.log(resText.trim());
    if (!bVoice)
      await bot.sendMessage(msg.chat.id, resText);
    else {
      synthesizeVoice(prompt, resText, msg);
    }
    return;
  } catch (error) {
      clearInterval(intervalId);
      if (error.response?.status) {
          console.error(error.response.status, error.message);    
          await bot.sendMessage(msg.chat.id, '😭被限速了，请稍后再试，错误代码: ' + error.response.status);      
      } else {
          console.error('An error occurred during OpenAI request', error);
          await bot.sendMessage(msg.chat.id, '😭出错了，请稍后再试');
      }
  }
}