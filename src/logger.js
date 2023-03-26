import log4js from 'log4js';

export class Logger {
    constructor() {
        log4js.configure({
            appenders: { chatbot: { type: "file", filename: "chatbot.log" } },
            categories: { default: { appenders: ["chatbot"], level: "debug" } },
        });
        this.logger = log4js.getLogger("chatbot");
    }

    trace(message, ...args) {
        console.log(message, ...args);
        this.logger.trace(message, args.length > 0 ? args : '');
    }

    debug(message, ...args) {
        console.log(message, ...args);
        this.logger.debug(message, args.length > 0 ? args : '');
    }

    info(message, ...args) {
        console.log(message, ...args);
        this.logger.info(message, args.length > 0 ? args : '');
    }

    warn(message, ...args) {
        console.log(message, ...args);
        this.logger.warn(message, args.length > 0 ? args : '');
    }

    error(message, ...args) {
        console.log(message, ...args);
        this.logger.error(message, args.length > 0 ? args : '');
    }

    fatal(message, ...args) {
        console.log(message, ...args);
        this.logger.fatal(message, args.length > 0 ? args : '');
    }

    mark(message, ...args) {
        console.log(message, ...args);
        this.logger.mark(message, args.length > 0 ? args : '');
    }
}

const test = () => {
    const logger = new Logger();
    logger.debug('1');
    logger.debug('1', 2, 3);
    logger.info('212');
}

//test();