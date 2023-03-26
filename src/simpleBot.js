import TelegramBot from 'node-telegram-bot-api';
import {SocksProxyAgent} from 'socks-proxy-agent';

export class TelegramChatBot {
    constructor(speakbot_token) {
        const proxy = 'socks5://127.0.0.1:1080';
        const agent = new SocksProxyAgent(proxy);
        this.bot = new TelegramBot(speakbot_token, { polling: true, request: { proxy: "socks5://127.0.0.1:1080" }});    
    }

    async startListen() {
        this.startListenText();
    }

    async startListenText() {
        this.bot.on('text', async (msg) => {
            console.log(msg);
        });
    }
}

const bot = new TelegramChatBot('6215653815:AAEj-spAJDJZzJT3IUGDUgcD7qX7duz1Oq0');
bot.startListen();