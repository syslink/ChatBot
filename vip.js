import { checkVip } from './web3Auth.js';

export class VIP {
    constructor() {
        this.userVip = {}
    }

    async checkVip(userId) {
        if (this.userVip[userId]) return true;
        const bVip = await checkVip(userId);
        if (bVip) {
            this.userVip[userId] = bVip;
            return true;
        }
        return false;
    }
}