import { Configuration, OpenAIApi } from "openai";
import * as dotenv from 'dotenv';
import log4js from 'log4js';
import fs from 'fs';
import { getTelegramId } from './web3Auth.js';
import gptFee from './gptFee.json' assert { type: "json" };

// price: https://openai.com/pricing
/*
// gpt- 4 
Model	        Prompt	            Completion        version            freeTokens
8K context	$0.03 / 1K tokens	$0.06 / 1K tokens    gpt-4                  10K
32K context	$0.06 / 1K tokens	$0.12 / 1K tokens    gpt-4-32k-0314          5K

// gpt-3.5
Model	            Usage                 freeTokens
gpt-3.5-turbo	$0.002 / 1K tokens           50K

{
telegramId: "",
usage: {
    gpt-4: {
        prompt: 1000,
        completion: 10000,
        totalCost: 10      
    },
    gpt-4-32K: {
        prompt: 1000,
        completion: 10000,  
        totalCost: 10          
    },
    gpt-3.5-turbo: {
        prompt: 1000,
        completion: 10000, 
        totalCost: 10      
    }
}
}
*/
export class OpenAI {
    constructor(apiKey, gptModel, mongodb, logger) {
        const configuration = new Configuration({ apiKey });
        this.openAI = new OpenAIApi(configuration);
        this.gptModel = gptModel;
        this.mongodb = mongodb;
        this.logger = logger;
        this.userContextLog = {}
        this.systemRoleSetting = {}
    }

    async getResponse(userId, prompt, maxTokens) {
        if (this.gptModel == 'gpt-3.5-turbo' || this.gptModel == 'gpt-4') {
            return this.getChatGPTAPIResponse(userId, prompt, maxTokens);
        } else if (this.gptModel == 'text-davinci-003') {
            return this.getDavinciAPIResponse(userId, prompt, maxTokens);
        }
    }

    async setSystemRole(userId, systemRoleInfo) {
        if (systemRoleInfo == null || systemRoleInfo.length == 0) {
            systemRoleInfo = 'You are a helpful assistant.';
        }
        this.systemRoleSetting[userId] = systemRoleInfo;
        if (this.mongodb != null)
            await this.mongodb.insertOrUpdateSystemRoleSetting(getTelegramId(userId), systemRoleInfo);
    }

    async getSystemRole(userId) {
        if (this.systemRoleSetting[userId] != null) return this.systemRoleSetting[userId];
        
        const result = this.mongodb == null ? null : await this.mongodb.getSystemRoleSetting(getTelegramId(userId));
    
        if (result == null) return 'You are a helpful assistant.';
    
        this.systemRoleSetting[userId] = result.systemRoleInfo;
        return result.systemRoleInfo;
      }

    async getChatGPTAPIResponse(userId, prompt, maxTokens) {
        const context = this.getUserContext(userId);
        const systemRole = await this.getSystemRole(userId);
        const telegramId = getTelegramId(userId);
        const userGptVersion = await this.mongodb.getGPTVersion(telegramId);
        let gptModel = userGptVersion != null ? userGptVersion : this.gptModel;

        const res = await this.openAI.createChatCompletion({
            model: gptModel,
            messages: [
                {"role": "system", "content": systemRole},
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
        this.mongodb.insertOrUpdateUsage(telegramId, usage);
        return {response: resText, usage: res.data.usage};
    }

    async updateUsage(userId, model, curUsage) {
        const telegramId = getTelegramId(userId);
        // get previous usage
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
        this.logger.debug(JSON.stringify(res.data));
        return res.data.text;
    }

    async getTranslation(voiceFilePath) {
        const voiceFile = fs.createReadStream(voiceFilePath);
        const res = await this.openAI.createTranslation(voiceFile, 'whisper-1');
        this.logger.debug(JSON.stringify(res.data));
        return res.data.text;
    }

    async translateCh2EnWordByWord(prompt) {
        const result = await this.translate("You are a translator who can only do one thing: translate Chinese to English word by word.", prompt);
        
        return result;
    }

    async translateCh2EnBySentence(prompt) {
        const result = await this.translate("You are a translator who can translate Chinese to English .", prompt);
        
        return result;
    }

    async translate(systemContent, prompt) {
        const res = await this.openAI.createChatCompletion({
            model: this.gptModel,
            messages: [
                {"role": "system", "content": systemContent},
                {"role": "user", "content": prompt}],
            max_tokens: 1000,
            top_p: 1,
            stop: "###"
        }, { responseType: 'json' });
        //console.log(JSON.stringify(res.data));
        let resText = res.data.choices[0].message.content;
        if (resText.indexOf("\n\n") > 0) {
            resText = resText.substr(resText.indexOf("\n\n") + "\n\n".length).trim();
        }
        resText = resText.trim();
        this.logger.debug(resText);
        return resText;
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
    
    const openAI = new OpenAI(apiKey, gptModel, null, logger);
    const response = await openAI.getResponse('abcd', 'good morning', 2000);
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
    log4js.configure({
        appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
        categories: { default: { appenders: ["chatbot"], level: "debug" } },
    });
    var logger = log4js.getLogger("chatbot");

    const { apiKey, gptModel } = process.env;
    
    const openAI = new OpenAI(apiKey, gptModel, null, logger);
    await openAI.getTranslation(voiceFile);
}

const testTranslate = async (prompt) => {
    dotenv.config();
    log4js.configure({
        appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
        categories: { default: { appenders: ["chatbot"], level: "debug" } },
    });
    var logger = log4js.getLogger("chatbot");

    const { apiKey, gptModel } = process.env;

    //console.log(JSON.parse(gptFee));
    
    const openAI = new OpenAI(apiKey, gptModel, null, logger);
    const result = await openAI.translateCh2EnWordByWord(prompt);
    return result;
}

// await testText();
// await testVoiceTranslation('./voiceFiles/849007458-213.mp3');
//console.log(await testTranslate('英语'));

console.log(gptFee);