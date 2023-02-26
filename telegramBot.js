import TelegramBot from 'node-telegram-bot-api';
import { getTelegramId, sign } from './web3Auth.js';
import FfmpegCommand  from 'fluent-ffmpeg';

export class TelegramBot {
    constructor(speakbot_token, mongodb, maxVoiceDialogNumber, bStartVip, vip, openAI, logger) {
        this.bot = new TelegramBot(speakbot_token, { polling: true});
        this.logger.info(new Date().toLocaleString(), '--Bot has been started...');
        this.userInited = {};
        this.userDialogCount = {};
        this.mongodb = mongodb;
        this.maxVoiceDialogNumber = maxVoiceDialogNumber;
        this.bStartVip = bStartVip;
        this.vip = vip;
        this.openAI = openAI;
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
        if (bStartVip) {
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
            this.logger.info(new Date().toLocaleString(), '--Received message from id:', msg.chat.id, ':', msg.text);  
            msg.type = 'text';
            if (userInited[msg.from.id] != true) {
              await this.initUserInfo(msg);
            }
            await this.msgHandler(msg);
        });
    }

    async startListenVoice() {
        this.bot.on('voice', async (msg) => {
            if (userInited[msg.from.id] != true) {
              await this.initUserInfo(msg);
            }
            let bPass = await this.checkUserValid(msg);
            if (!bPass) {
              await this.bot.sendMessage(msg.chat.id, `对不起，您已经达到每天口语对话${maxVoiceDialogNumber}条的上限，如需继续，请登录网站https://chatbot.cryptometa.ai注册成为VIP`);
              return;
            }
            const fileId = msg.voice.file_id;
            const chatId = msg.chat.id;
            const msgId = msg.message_id;
            msg.type = 'voice';
            this.bot.getFileLink(fileId).then(fileLink => {
              // 下载语音文件
              this.bot.downloadFile(fileId, './').then(voicePath => {
                const fileName = `./voiceFiles/${chatId}-${msgId}.ogg`;
                const outputFileName = `./voiceFiles/${chatId}-${msgId}.wav`;
                fs.renameSync(voicePath, fileName);
                const ffmpeg = new FfmpegCommand();
                ffmpeg.input(fileName)
                      .output(outputFileName)
                      .on('end', function() {
                        this.logger.debug('\n\n' + fileName + ' => ' + outputFileName);
                        this.speech.recognizeVoice(msg, outputFileName);
                        //ffmpeg.close();
                      })
                      .on('error', function(err) {
                        this.logger.error(fileName + ' =xx=> ' + outputFileName + err.message);
                        //ffmpeg.close();
                      })
                      .run();            
              });
            });
          });
    }

    async msgHandler(msg) {
        if (typeof msg.text !== 'string' || ((msg.chat.type === 'group' || msg.chat.type === 'supergroup') && msg.type === 'text' && !msg.text.startsWith(prefix))) {  
          return;
        }
        switch (true) {
          case msg.text.startsWith('/start'):
            await this.bot.sendMessage(msg.chat.id, 
              '👋您好！我是搭载ChatGPT内核的聊天机器人，您可以同我文字交谈，也可以跟我进行多国语言口语对话，\
              目前支持的语言包括：中文、英语、西班牙语、德语、法语、日语以及韩语，默认的口语对话为英语');
            await this.bot.sendMessage(msg.chat.id, 
                '如果需要切换到其它语言对话，如西班牙语，需要向我发送命令：/setLanguage 西班牙语，或者切换到中文: /setLanguage 中文\
                只有当我确认后，才可以通过此语言对话哦');
            await this.bot.sendMessage(msg.chat.id, 
              '除此之外，如果您需要我将文本翻译为其它语言并让我朗读出来，请按此格式给我发送文本信息：翻译为英语：xxx, 翻译为法语：xxx');
            break;
          case msg.text.startsWith('/verify'):
            const signature = sign(msg.from.id, msg.text.substr('/verify'.length).trim());
            this.logger.debug(signature);
            await this.bot.sendMessage(msg.chat.id, JSON.stringify(signature));
            break;
          case msg.text.startsWith('/setLanguage'):
            this.speech.setLanguage(msg.from.id, msg.text.substr('/setLanguage'.length).trim());
            await this.bot.sendMessage(msg.chat.id, "已设置成功，可以开始" + msg.text.substr('/setLanguage'.length).trim() + "对话");
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
        try {
          this.bot.sendChatAction(msg.chat.id, 'typing');
          intervalId = setInterval(() => {
              this.bot.sendChatAction(msg.chat.id, bVoice ? 'record_voice' : 'typing');
          }, 5000);
          const prompt = msg.text.startsWith(prefix) ? msg.text.replace(prefix, '').trim() : msg.text.trim();
          const resText = await this.openAI.getResponse(prompt, bVoice ? 200 : 500);
          clearInterval(intervalId);
          
          if (!bVoice) {
            await this.bot.sendMessage(msg.chat.id, resText);
            if (msg.text.startsWith("翻译为")) {
              const language = msg.text.substr("翻译为".length, 2);
              this.speech.synthesizeVoice(prompt, resText, msg, language);
            }
          } else {
            this.speech.synthesizeVoice(prompt, resText, msg);
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