import { getTelegramId } from "./web3Auth";

export class Link {
    constructor(mongodb, openAI) {
        this.mongodb = mongodb;
        this.openAI = openAI;
        this.users = {}
        this.linkedUsers = {}
    }

    request(userId) {
        this.users[userId] = {
            timestamp: new Date().getTime()
        }
    }

    stop(userId) {
        this.users[userId] = null;
    }

    setUserMatchedScore(userId1, userId2, score) {
        if (this.linkedUsers[userId1] == null) {
            this.linkedUsers[userId1] = {}
            this.linkedUsers[userId1][userId2] = score;
        } else {
            this.linkedUsers[userId1][userId2] = score;
        }
    }

    filter(sentences) {
        const result = '';
        const duplicatedRecord = {}
        sentences.map(sentence => {
            const words = sentence.split(' ');
            words.map(word => {
                if (duplicatedRecord[word] == null) {
                    result += word + ' ';
                    duplicatedRecord[word] = true;
                }
            })
        })
        return result;
    }

    async analysis() {
        const userIds = [];
        Object.keys(this.users).forEach((userId) => {
            // get user's recent 30~60 days' dialog with bot
            const twoMonthEnSentences = this.mongodb.getSomeOneDataOfTwoMonths(getTelegramId(userId), new Date(), 'en-US');

            // filter the duplicated words
            const filterWords = this.filter(twoMonthEnSentences);

            // save the result in user's info
            this.users[userId].words = filterWords;

            // collect the user ids
            userIds.push(userId);
        });

        for (let i = 0; i < userIds.length; i++) {
            for (let j = i + 1; j < userIds.length; j++) {
                const userAWords = this.users[userIds[i]].words;
                const userBWords = this.users[userIds[j]].words;
                const sentence2OpenAI = `请帮我判断下面两句话的相关性程度，并给出分数，0分表示完全不相关，100分表示完全一样，句子A：${userAWords} 句子B：${userBWords}`;
                const response = await this.openAI.getResponse(sentence2OpenAI, 100);
                const pattern = /\d+/g;
                const numbers = response.match(pattern);
                if (numbers.length == 0) continue;
                this.setUserMatchedScore(userIds[i], userIds[j], numbers[0]); 
                this.setUserMatchedScore(userIds[j], userIds[i], numbers[0]);           
            }
        }
    }

    getSocialUsersByScore(userId, minScore) {
        const scoredUsersInfo = this.linkedUsers[userId];
        if (scoredUsers == null) return [];

        const scoredUsers = [];
        Object.keys(scoredUsersInfo).forEach(scoredUserId => {
            const score = this.linkedUsers[userId][scoredUserId];
            if (score >= minScore) {
                scoredUsers.push(scoredUserId);
            }
        })
        return scoredUsers;
    }
}