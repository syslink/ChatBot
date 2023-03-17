import * as dotenv from 'dotenv';
import { OpenAI } from './openAI.js';
import { Database } from './database.js';
import { Logger } from './logger.js';

export class Prompt {
    constructor(mongodb, openAI) {
        this.mongodb = mongodb;
        this.openAI = openAI;
        this.prompts = [];
    }

    async translateAllPrompts2Chinese() {
        const prompts = await this.mongodb.getAllPrompts();
        console.log(prompts.length);
        prompts.map(async (promptInfo, index) => {
            const result = await this.openAI.getResponse(index, promptInfo.prompt, 1000);
            console.log(promptInfo.prompt, '->', result);
            promptInfo.chPrompt = result;
            await this.mongodb.insertOrUpdatePrompt(promptInfo);
        })
    }
}

const test = async () => {
    dotenv.config()


    var logger = new Logger();

    const { mongodbUrl, apiKey, gptModel } = process.env

    const mongodb = new Database(mongodbUrl, logger);
    await mongodb.init();

    const openAI = new OpenAI(apiKey, gptModel, mongodb, logger);

    console.log('new prompt');
    const prompt = new Prompt(mongodb, openAI);

    console.log('translateAllPrompts2Chinese');
    await prompt.translateAllPrompts2Chinese();
}

test();