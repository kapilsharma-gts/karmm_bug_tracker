class TelegramOutboundNotifier {
    constructor(telegramToken, httpClient) {
        this.telegramToken = telegramToken;
        this.httpClient = httpClient;
    }

    async send(chatIdentifier, outgoingText) {
        await this.httpClient.post(
            `https://api.telegram.org/bot${this.telegramToken}/sendMessage`,
            { chat_id: chatIdentifier, text: outgoingText }
        );
    }
}

module.exports = TelegramOutboundNotifier;