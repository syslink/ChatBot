import { Configuration, OpenAIApi } from "openai";

export class OpenAI {
    constructor(apiKey, gptModel, logger) {
        const configuration = new Configuration({
            apiKey,
          });
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
        this.logger.debug(resText.trim());
        return resText;
    }
}