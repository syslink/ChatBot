import { Configuration, OpenAIApi } from "openai";
import * as dotenv from 'dotenv';
import fs from 'fs';

export class OpenAI {
    constructor(apiKey, gptModel, logger) {
        const configuration = new Configuration({ apiKey });
        this.openAI = new OpenAIApi(configuration);
        this.gptModel = gptModel;
        this.logger = logger;
    }

    async getResponse(userId, prompt, maxTokens) {
        if (this.gptModel == 'gpt-3.5-turbo') {
            return this.getChatGPTAPIResponse(userId, prompt, maxTokens);
        } else if (this.gptModel == 'text-davinci-003') {
            return this.getDavinciAPIResponse(userId, prompt, maxTokens);
        }
    }

    async getChatGPTAPIResponse(userId, prompt, maxTokens) {
        const res = await this.openAI.createChatCompletion({
            model: this.gptModel,
            messages: [{"role": "user", "content": prompt}],
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
        this.logger.debug(resText.trim());
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
        this.logger ? this.logger.debug(resText.trim()) : console.log(resText.trim());
        return resText;
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
    const { apiKey, gptModel } = process.env;
    
    const openAI = new OpenAI(apiKey, gptModel);
    await openAI.getResponse('abcd', '系分析下最近中美关', 2000);
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

// await test();
// await testVoiceTranslation('./voiceFiles/849007458-129.mp3');