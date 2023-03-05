import TelegramBot from 'node-telegram-bot-api';
import { getTelegramId, sign } from './web3Auth.js';
import FfmpegCommand  from 'fluent-ffmpeg';
import fs from 'fs';

export class TelegramChatBot {
    constructor(speakbot_token, mongodb, maxVoiceDialogNumber, bStartVip, vip, openAI, groupPrefix, logger, bInLocal) {
        if (bInLocal) {
          this.bot = new TelegramBot(speakbot_token, { polling: true, request: { proxy: "socks5://127.0.0.1:1080" }});
        } else {
          this.bot = new TelegramBot(speakbot_token, { polling: true });
        }
        this.logger = logger;
        this.logger.info('--Bot has been started...');
        this.userInited = {};
        this.userDialogCount = {};
        this.mongodb = mongodb;
        this.maxVoiceDialogNumber = maxVoiceDialogNumber;
        this.bStartVip = bStartVip;
        this.vip = vip;
        this.openAI = openAI;
        this.groupPrefix = groupPrefix;
        this.blockedUsers = {};
    }

    getNativeBot() {
        return this.bot;
    }

    async startListen(speech) {
        this.speech = speech;
        this.startListenText();
        this.startListenVoice();
    }

    async initUserInfo(msg) {
        const telegramId = getTelegramId(msg.from.id);
        const setting = await this.mongodb.getLanguageSetting(telegramId);
        this.logger.debug(setting);
        const count = await this.mongodb.getSomeoneCountOfOneDay(telegramId, new Date());
        this.userDialogCount[msg.from.id] = count;
        
        this.userInited[msg.from.id] = true;
    }

    async checkUserValid(msg) {
        if (this.bStartVip) {
            if (this.userDialogCount[msg.from.id] >= this.maxVoiceDialogNumber) {
                const bVip = await this.vip.checkVip(msg.from.id);
                if (!bVip) {
                    return false;
                }
            }
        }
        this.userDialogCount[msg.from.id]++;
        return true;
    }

    async startListenText() {
        this.bot.on('text', async (msg) => {
            if (msg.text && msg.text.match(/ETELEGRAM: 403 Forbidden/)) {
              this.blockedUsers[msg.chat.id] = true;
              this.logger.debug(`User ${msg.chat.id} has blocked the bot`);
            }
            if (this.blockedUsers[msg.chat.id]) {
              this.logger.debug(`User ${msg.chat.id} is blocked`);
              return;
            }
          
            this.logger.info('--Received message from id:', msg.chat.id, ':', msg.text);  
            msg.type = 'text';
            if (this.userInited[msg.from.id] != true) {
              await this.initUserInfo(msg);
            }
            await this.msgHandler(msg);
        });
    }

    async startListenVoice() {
        this.bot.on('voice', async (msg) => {
            if (this.userInited[msg.from.id] != true) {
              await this.initUserInfo(msg);
            }
            let bPass = await this.checkUserValid(msg);
            if (!bPass) {
              await this.bot.sendMessage(msg.chat.id, `对不起，您已经达到每天口语对话${maxVoiceDialogNumber}条的上限，如需继续，请登录网站https://chatbot.cryptometa.ai注册成为VIP`);
              await this.bot.sendMessage(msg.chat.id, `在网站上注册成为VIP后，可向我发送以下指令进行确认：/checkVIP`);
              return;
            }
            const fileId = msg.voice.file_id;
            const chatId = msg.chat.id;
            const msgId = msg.message_id;
            msg.type = 'voice';
            const _this = this;
            this.bot.getFileLink(fileId).then(fileLink => {
              // 下载语音文件
              this.bot.downloadFile(fileId, './').then(voicePath => {
                const fileName = `./voiceFiles/${chatId}-${msgId}.ogg`;
                const outputFileName = `./voiceFiles/${chatId}-${msgId}.mp3`;
                fs.renameSync(voicePath, fileName);
                const ffmpeg = new FfmpegCommand();
                ffmpeg.input(fileName)
                      .output(outputFileName)
                      .on('end', () => {
                        _this.logger.debug('\n\n' + fileName + ' => ' + outputFileName);
                        //_this.speech.recognizeVoice(msg, outputFileName);
                        _this.openAI.getTranslation(outputFileName).then(translatedText => {
                          msg.text = translatedText;
                          _this.msgHandler(msg);
                        })
                        //ffmpeg.close();
                      })
                      .on('error', function(err) {
                        _this.logger.error(fileName + ' =xx=> ' + outputFileName + err.message);
                        //ffmpeg.close();
                      })
                      .run();            
              });
            });
          });
    }

    async msgHandler(msg) {
        if (typeof msg.text !== 'string' || 
            ((msg.chat.type === 'group' || msg.chat.type === 'supergroup') && msg.type === 'text' && !msg.text.startsWith(this.groupPrefix))) {  
          return;
        }
        switch (true) {
          case msg.text.startsWith('/start'):
            await this.bot.sendMessage(msg.chat.id, 
              '👋您好！我是搭载ChatGPT内核的聊天机器人，您可以同我文字交谈，也可以跟我进行多国语言口语对话，\
              所有口语我都将自动转译为英语，并用英语口语跟你对话。');
            await this.bot.sendMessage(msg.chat.id, 
              '除此之外，如果您需要我将文本翻译为其它语言并让我朗读出来，请按以下格式给我发送文本信息：翻译为英语：xxx, 翻译为法语：xxx');
            await this.bot.sendMessage(msg.chat.id, 
              '目前我支持的语言包括: 英语、德语、西班牙语、法语、日语、韩语以及中文');
            break;
          case msg.text.startsWith('/verify'):
            const signature = sign(msg.from.id, msg.text.substr('/verify'.length).trim());
            this.logger.debug(signature);
            await this.bot.sendMessage(msg.chat.id, JSON.stringify(signature));
            break;
          case msg.text.startsWith('/setLanguage'):
            await this.speech.setLanguage(msg.from.id, msg.text.substr('/setLanguage'.length).trim());
            await this.bot.sendMessage(msg.chat.id, "已设置成功，可以开始" + msg.text.substr('/setLanguage'.length).trim() + "对话");
            break;
          case msg.text.startsWith('/checkVip'):
            const bVip = await this.vip.checkVip(msg.from.id);
            await this.bot.sendMessage(msg.chat.id, bVip ? "恭喜您是VIP用户" : "对不起，您目前不是VIP用户");
            break;
          case msg.text.length >= 2:
            await this.response(msg, msg.type === 'voice');
            break;
          default:
            await this.bot.sendMessage(msg.chat.id, '😭我不太明白您的意思。');
            break;
        }
      }
      
      async response(msg, bVoice) {
        let intervalId;
        const telegramId = getTelegramId(msg.from.id);
        try {
          this.bot.sendChatAction(msg.chat.id, 'typing');
          intervalId = setInterval(() => {
              this.bot.sendChatAction(msg.chat.id, bVoice ? 'record_voice' : 'typing');
          }, 5000);
          const prompt = msg.text.startsWith(this.groupPrefix) ? msg.text.replace(this.groupPrefix, '').trim() : msg.text.trim();
          this.logger.info('start to get response from openai', prompt);
          const resText = await this.openAI.getResponse(telegramId, prompt, bVoice ? 200 : 500);
          clearInterval(intervalId);
          
          if (!bVoice) {
            await this.bot.sendMessage(msg.chat.id, resText);
            if (msg.text.startsWith("翻译为")) {
              const language = msg.text.substr("翻译为".length, 2);
              this.speech.synthesizeVoice(prompt, resText, msg, language);
            } else {
              await this.mongodb.insertDialog(telegramId, prompt, resText, 'text', '');
            }
          } else {
            this.speech.synthesizeVoice(prompt, resText, msg, null, true);
          }
          return;
        } catch (error) {
            clearInterval(intervalId);
            if (error.response?.status) {
                this.logger.error(error.response.status, error.message);    
                await this.bot.sendMessage(msg.chat.id, '😭OpenAI服务出错，请稍后再试，错误代码: ' + error.response.status);      
            } else {
                this.logger.error('An error occurred during OpenAI request', error);
                await this.bot.sendMessage(msg.chat.id, '😭服务出错，请稍后再试');
            }
        }
    }
}