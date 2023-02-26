import { MongoClient } from 'mongodb';
import { getCurDate, getWeekNumber } from './utils.js';
import * as dotenv from 'dotenv';

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
        await this.languageSettingCol.updateOne(
            { id: telegramId },
            { $set: languageSetting },
            { upsert: true }
        );
    }

    async getLanguageSetting(telegramId) {
        const result = await this.languageSettingCol.findOne({ id: telegramId });
        return result;
    }

    async getSomeoneCountOfOneDay(telegramId, date) {
        const result = await this.dialogCol.countDocuments({telegramId, date: getCurDate(date)});
        return result;
    }   
    
    async getAllDataOfOneWeek(date) {
        const week = date.getFullYear() + '-' + getWeekNumber(date)
        const cursor = await this.dialogCol.find({week});
        const result = await cursor.toArray();
        return result;
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
