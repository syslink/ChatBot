import Web3 from "web3";
import * as dotenv from 'dotenv';
import vipABI from './vip.json' assert { type: "json" };
import abi from 'ethereumjs-abi';

dotenv.config()

const web3 = new Web3('https://nd-645-530-838.p2pify.com/181a9755ad317732b98d898de7107adf');
const { privateKey, vipContractAddr } = process.env;

const vipContract = new web3.eth.Contract(vipABI, vipContractAddr);

export function getTelegramId(userName) {
    const buf = Buffer.from('' + userName, 'utf8');
    const hex = '0x' + buf.toString('hex');
    const telegramId = web3.utils.sha3(hex);
    return telegramId;
}

export function sign(userName, userAddr) {
    const telegramId = getTelegramId(userName);
    const encoded = abi.solidityPack(['bytes32', 'address'], [telegramId, userAddr]).toString('hex');
    let messageHash = web3.utils.soliditySha3('0x' + encoded);
    const signature = web3.eth.accounts.sign(messageHash, privateKey);
    const result = {messageHash, telegramId, v: signature.v, s: signature.s, r: signature.r}
    return result;
}

export async function checkVip(userName) {
    const buf = Buffer.from('' + userName, 'utf8');
    const hex = '0x' + buf.toString('hex');
    const telegramId = web3.utils.sha3(hex);
    try {        
        let result = await vipContract.methods.telegramId2TokenIdMap(telegramId).call();
        console.log(result);
        const tokenId = result;
        if (tokenId == 0) return false;
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

// const buf = Buffer.from('100', 'utf8');
// const hex = buf.toString('hex');
// console.log(hex);

// console.log(web3.utils.sha3('100'));

// console.log(web3.utils.keccak256('100'));

//console.log(abi.solidityPack(['bytes32', 'address'], ['0x8c18210df0d9514f2d2e5d8ca7c100978219ee80d3968ad850ab5ead208287b3', '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4']).toString('hex'))
//console.log(abi.rawEncode(['string', 'address'], ['0x8c18210df0d9514f2d2e5d8ca7c100978219ee80d3968ad850ab5ead208287b3', '0x5B38Da6a701c568545dCfcB03FcB875f56beddC4']).toString('hex'))
//console.log(web3.utils.keccak256("0x8c18210df0d9514f2d2e5d8ca7c100978219ee80d3968ad850ab5ead208287b35b38da6a701c568545dcfcb03fcb875f56beddc4"))

// console.log(web3.eth.accounts.privateKeyToAccount(privateKey).address);

// const signature = sign('0x313030', "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4");

// console.log(signature);

// const buf = Buffer.from("\x19Ethereum Signed Message:\n32", 'utf8');
// const hex = '0x' + buf.toString('hex');
// console.log(hex);

// const encoded = abi.solidityPack(['bytes', 'bytes32', 'address'], [buf, signature.telegramId, "0x5B38Da6a701c568545dCfcB03FcB875f56beddC4"]).toString('hex');
// let messageHash = web3.utils.soliditySha3(encoded);
// console.log(messageHash)
// console.log(web3.eth.accounts.recover(messageHash, signature.v, signature.r, signature.s, true));
//console.log(web3.eth.accounts.recover(signature.messageHash, signature, true));