import { Configuration, OpenAIApi } from "openai";
import * as dotenv from 'dotenv';
import log4js from 'log4js';
import fs from 'fs';

export class OpenAI {
    constructor(apiKey, gptModel, logger) {
        const configuration = new Configuration({ apiKey });
        this.openAI = new OpenAIApi(configuration);
        this.gptModel = gptModel;
        this.logger = logger;
        this.userContextLog = {}
    }

    async getResponse(userId, prompt, maxTokens) {
        if (this.gptModel == 'gpt-3.5-turbo') {
            return this.getChatGPTAPIResponse(userId, prompt, maxTokens);
        } else if (this.gptModel == 'text-davinci-003') {
            return this.getDavinciAPIResponse(userId, prompt, maxTokens);
        }
    }

    async getChatGPTAPIResponse(userId, prompt, maxTokens) {
        const context = this.getUserContext(userId);
        const res = await this.openAI.createChatCompletion({
            model: this.gptModel,
            messages: [
                {"role": "system", "content": "You are a helpful assistant."},
                ...context,
                {"role": "user", "content": prompt}],
            max_tokens: maxTokens,
            top_p: 1,
            stop: "###",
            user: userId
        }, { responseType: 'json' });
        //console.log(JSON.stringify(res.data));
        let resText = res.data.choices[0].message.content;
        if (resText.indexOf("\n\n") > 0) {
            resText = resText.substr(resText.indexOf("\n\n") + "\n\n".length).trim();
        }
        resText = resText.trim();
        this.logger.debug(resText);
        this.saveContext(userId, prompt, resText);
        return resText;
    }

    async getDavinciAPIResponse(userId, prompt, maxTokens) {
        const res = await this.openAI.createCompletion({
            model: this.gptModel,
            prompt,
            max_tokens: maxTokens,
            top_p: 1,
            stop: "###",
            user: userId
        }, { responseType: 'json' });
        let resText = res.data.choices[0].text;
        if (resText.indexOf("\n\n") > 0) {
            resText = resText.substr(resText.indexOf("\n\n") + "\n\n".length).trim();
        }
        resText = resText.trim();
        this.logger.debug(resText);
        return resText;
    }

    saveContext(userId, prompt, completion) {
        if (this.userContextLog[userId] == null) {
            this.userContextLog[userId] = [];
        }
        this.userContextLog[userId].push({"role": "user", "content": prompt});
        this.userContextLog[userId].push({"role": "assistant", "content": completion});
        if (this.userContextLog[userId].length > 6) {
            this.userContextLog[userId] = this.userContextLog[userId].slice(2);
        }
    }

    getUserContext(userId) {
        if (this.userContextLog[userId] == null) return [];

        return this.userContextLog[userId];
    }

    async getWhisperResponse(voiceFilePath) {
        const voiceFile = fs.createReadStream(voiceFilePath);
        const res = await this.openAI.createTranscription(voiceFile, 'whisper-1');
        console.log(JSON.stringify(res.data));
        return res.data.text;
    }

    async getTranslation(voiceFilePath) {
        const voiceFile = fs.createReadStream(voiceFilePath);
        const res = await this.openAI.createTranslation(voiceFile, 'whisper-1');
        console.log(JSON.stringify(res.data));
        return res.data.text;
    }
}

const testText = async () => {
    dotenv.config();
    log4js.configure({
        appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
        categories: { default: { appenders: ["chatbot"], level: "debug" } },
    });
    var logger = log4js.getLogger("chatbot");
    
    const { apiKey, gptModel } = process.env;
    
    const openAI = new OpenAI(apiKey, gptModel, logger);
    const response = await openAI.getResponse('abcd', '系分析下最近中美关系', 2000);
    console.log(response);
}

const testVoiceRecognize = async (voiceFile) => {
    dotenv.config();
    const { apiKey, gptModel } = process.env;
    
    const openAI = new OpenAI(apiKey, gptModel);
    await openAI.getWhisperResponse(voiceFile);
}

const testVoiceTranslation = async (voiceFile) => {
    dotenv.config();
    const { apiKey, gptModel } = process.env;
    
    const openAI = new OpenAI(apiKey, gptModel);
    await openAI.getTranslation(voiceFile);
}

await testText();
await testVoiceTranslation('./voiceFiles/849007458-213.mp3');