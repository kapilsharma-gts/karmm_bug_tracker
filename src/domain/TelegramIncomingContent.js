class TelegramIncomingContent {
    static parse(messageEnvelope) {
        const messageText = messageEnvelope.text || "";
        const mediaCaption = messageEnvelope.caption || "";

        return {
            messageText,
            mediaCaption,
            consolidatedContent: messageText || mediaCaption
        };
    }
}

module.exports = TelegramIncomingContent;