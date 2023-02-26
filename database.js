import { MongoClient } from 'mongodb';
import { getCurDate, getWeekNumber } from './utils.js';

export class Database {
    constructor(mongodbUrl) {
        this.mongodbUrl = mongodbUrl;
    }

    async init() {
        this.client = new MongoClient(this.mongodbUrl);
        await this.client.connect();
        console.log("Connected to MongoDB");
        this.mongodbo = this.client.db("chatbot");
        this.dialogCol = this.mongodbo.collection('englishDialog');
        this.languageSettingCol = this.mongodbo.collection('languageSetting');
    }
    async insertDialog(telegramId, prompt, completion, language) {
        const today = new Date();
        await this.dialogCol.insertOne({telegramId, prompt, completion, language, date: getCurDate(today), week: today.getFullYear() + '-' + getWeekNumber(today)});
    }

    async insertOrUpdateLanguageSetting(telegramId, languageSetting) {
        await languageSettingCol.updateOne(
            { id: telegramId },
            { $set: languageSetting },
            { upsert: true }
        );
    }

    async getLanguageSetting(telegramId) {
        const result = await languageSettingCol.findOne({ id: telegramId });
        return result;
    }

    async getSomeoneCountOfOneDay(telegramId, date) {
        const result = await dialogCol.countDocuments({telegramId, date: getCurDate(date)});
        return result;
    }   
    
    async getAllDataOfOneWeek(week) {
        const cursor = await dialogCol.find({week});
        const result = await cursor.toArray();
        return result;
    }
}