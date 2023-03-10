import { MongoClient } from 'mongodb';
import { getCurDate, getWeek, getMonth } from './utils.js';
import * as dotenv from 'dotenv';

export class Database {
    constructor(mongodbUrl, logger) {
        this.mongodbUrl = mongodbUrl;
        this.logger = logger;
    }

    async init() {
        this.client = new MongoClient(this.mongodbUrl);
        await this.client.connect();
        console.log("Connected to MongoDB");
        this.mongodbo = this.client.db("chatbot");
        this.dialogCol = this.mongodbo.collection('englishDialog');
        this.languageSettingCol = this.mongodbo.collection('languageSetting');
        this.socialEnableCol = this.mongodbo.collection('socialEnable');
    }

    async insertDialog(telegramId, prompt, completion, contentType, language) {
        const today = new Date();
        await this.dialogCol.insertOne({telegramId, prompt, completion, contentType, language, 
                                        time: today.getTime(),
                                        date: getCurDate(today), 
                                        week: getWeek(today),
                                        month: getMonth(today)});
    }

    async setSocialEnable(telegramId, enable) {
        if (enable) {
            await this.socialEnableCol.insertOne({telegramId});
        } else {
            await this.socialEnableCol.deleteOne({telegramId});
        }
    }

    async isSocialEnable(telegramId) {
        const result = await this.socialEnableCol.findOne({telegramId});
        return result != null;
    }

    async getAllSocialEnableIds() {
        const result = await this.socialEnableCol.find();
        return result.toArray();
    }

    async insertOrUpdateLanguageSetting(telegramId, languageSetting) {
        await this.languageSettingCol.updateOne(
            { telegramId },
            { $set: languageSetting },
            { upsert: true }
        );
    }

    async getLanguageSetting(telegramId) {
        const result = await this.languageSettingCol.findOne({ telegramId });
        return result;
    }

    async getSomeoneCountOfOneDay(telegramId, date) {
        const result = await this.dialogCol.countDocuments({telegramId, date: getCurDate(date)});
        return result;
    }   
    
    async getAllDataOfOneWeek(date) {
        const week = getWeek(date);
        const cursor = await this.dialogCol.find({week});
        const result = await cursor.toArray();
        return result;
    }
    
    async getSomeOneDataOfOneMonth(telegramId, date, language) {
        const curMonth = getMonth(date);
        const queryCondtion = ({telegramId, month: curMonth});
        if (language != null) {
            queryCondtion.language = language;
        }
        const cursor = await this.dialogCol.find(queryCondtion);
        const result = await cursor.toArray();
        return result;
    }

    async getSomeOneDataOfTwoMonths(telegramId, date) {
        const curMonth = getMonth(date);
        const lastMonth = getMonth(new Date(date.getTime() - 3600 * 24 * 30 * 1000));
        const cursor = await this.dialogCol.find({telegramId, $or: [{month: curMonth}, {month: lastMonth}]});
        const result = await cursor.toArray();
        return result;
    }

    async getAllTelegramId() {
        const telegramIds = await this.dialogCol.distinct('telegramId');
        return telegramIds;
    }
}

const test = async () => {
    dotenv.config();
    const { mongodbUrl } = process.env;
    console.log(mongodbUrl);
    const mongodb = new Database(mongodbUrl);
    await mongodb.init();
    
    await mongodb.insertDialog('111', 'text', 'world', 'en-us');
    await mongodb.insertDialog('222', 'text1', 'world1', 'en-us');
    
    const speechDefaultConfig = {};
    speechDefaultConfig.speechRecognitionLanguage = "en-US";
    speechDefaultConfig.speechSynthesisLanguage = 'en-US';
    speechDefaultConfig.speechSynthesisVoiceName = "en-US-JennyNeural"; 
    await mongodb.insertOrUpdateLanguageSetting('111', speechDefaultConfig);
    
    console.log(await mongodb.getLanguageSetting('111'));
    console.log(await mongodb.getSomeoneCountOfOneDay('111', new Date()));
    console.log(await mongodb.getAllDataOfOneWeek(new Date()));
}

const testGetTelegramIds = async () => {
    dotenv.config();
    const { mongodbUrl } = process.env;
    console.log(mongodbUrl);
    const mongodb = new Database(mongodbUrl);
    await mongodb.init();

    const telegramIds = await mongodb.getAllTelegramId();
    console.log(telegramIds.length);
    telegramIds.map(telegramId => {
        mongodb.getSomeOneDataOfOneMonth(telegramId, new Date()).then(dialogs => {
            if (dialogs.length > 10)
                console.log(telegramId, dialogs.length);
            // dialogs.map(dialog => {
            //     console.log('  ', dialog.prompt);
            // })
        })
    })
}

// test();
// testGetTelegramIds();
