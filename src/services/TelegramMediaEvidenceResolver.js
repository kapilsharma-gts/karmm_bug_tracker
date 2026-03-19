class TelegramMediaEvidenceResolver {
    constructor(telegramToken, httpClient) {
        this.telegramToken = telegramToken;
        this.httpClient = httpClient;
    }

    async extractPhotoUrl(messageEnvelope) {
        if (!messageEnvelope.photo) {
            return "";
        }

        const largestPhotoVariant = messageEnvelope.photo[messageEnvelope.photo.length - 1];
        const telegramFileLookup = await this.httpClient.get(
            `https://api.telegram.org/bot${this.telegramToken}/getFile?file_id=${largestPhotoVariant.file_id}`
        );

        return `https://api.telegram.org/file/bot${this.telegramToken}/${telegramFileLookup.data.result.file_path}`;
    }
}

module.exports = TelegramMediaEvidenceResolver;