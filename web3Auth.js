import Web3 from "web3";
import vipABI from './vip.json' assert { type: "json" };;

const web3 = new Web3('https://nd-645-530-838.p2pify.com/181a9755ad317732b98d898de7107adf');
const { privateKey, vipContractAddr } = process.env;

const vipContract = new web3.eth.Contract(vipABI, vipContractAddr);

export function sign(userName, userAddr) {
    const telegramId = web3.utils.sha3(userName + '');
    const messageHash =  web3.utils.sha3(telegramId + userAddr);
    const signature = web3.eth.accounts.sign(messageHash, privateKey);
    signature.telegramId = telegramId;
    return signature;
}

export async function checkVip(userName) {
    const telegramId = web3.utils.sha3(userName);
    try {        
        let result = await vipContract.methods.telegramId2TokenIdMap(telegramId).call();
        console.log(result);
        const tokenId = result.tokenId;
        result = await vipContract.methods.userRechargeInfos(tokenId).call();
        if (result.endTime > new Date().getTime() / 1000 && telegramId == result.telegramId) {
            return true;
        }
        return false;
    } catch (error) {
        console.log(error);
        return false;
    }
}