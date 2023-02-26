import { Configuration, OpenAIApi } from "openai";
import * as dotenv from 'dotenv';

export class OpenAI {
    constructor(apiKey, gptModel, logger) {
        const configuration = new Configuration({ apiKey });
        this.openAI = new OpenAIApi(configuration);
        this.gptModel = gptModel;
        this.logger = logger;
    }

    async getResponse(prompt, maxTokens) {
        const res = await this.openAI.createCompletion({
            model: this.gptModel,
            prompt,
            max_tokens: maxTokens,
            top_p: 1,
            stop: "###",
        }, { responseType: 'json' });
        let resText = res.data.choices[0].text;
        if (resText.indexOf("\n\n") > 0) {
            resText = resText.substr(resText.indexOf("\n\n") + "\n\n".length).trim();
        }
        this.logger ? this.logger.debug(resText.trim()) : console.log(resText.trim());
        return resText;
    }
}

const test = async () => {
    dotenv.config();
    const { apiKey, gptModel } = process.env;
    
    const openAI = new OpenAI(apiKey, gptModel);
    await openAI.getResponse('你好', 200);
}

// await test();