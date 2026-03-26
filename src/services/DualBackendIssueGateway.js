class DualBackendIssueGateway {
    constructor(sheetGateway, trelloGateway) {
        this.sheetGateway = sheetGateway;
        this.trelloGateway = trelloGateway;
    }

    async markDone(issueId) {
        const sheetPromise = this.sheetGateway ? this.sheetGateway.markDone(issueId) : Promise.resolve();
        const trelloPromise = this.trelloGateway ? this.trelloGateway.markDone(issueId) : Promise.resolve();

        await Promise.all([sheetPromise, trelloPromise]);
    }

    async markInProgress(issueId) {
        const sheetPromise = this.sheetGateway ? this.sheetGateway.markInProgress(issueId) : Promise.resolve();
        const trelloPromise = this.trelloGateway ? this.trelloGateway.markInProgress(issueId) : Promise.resolve();

        await Promise.all([sheetPromise, trelloPromise]);
    }

    async removeIssue(issueId) {
        const sheetPromise = this.sheetGateway ? this.sheetGateway.removeIssue(issueId) : Promise.resolve();
        const trelloPromise = this.trelloGateway ? this.trelloGateway.removeIssue(issueId) : Promise.resolve();

        await Promise.all([sheetPromise, trelloPromise]);
    }

    async assignIssue(issueId, responsibleOwner) {
        const sheetPromise = this.sheetGateway ? this.sheetGateway.assignIssue(issueId, responsibleOwner) : Promise.resolve();
        const trelloPromise = this.trelloGateway ? this.trelloGateway.assignIssue(issueId, responsibleOwner) : Promise.resolve();

        await Promise.all([sheetPromise, trelloPromise]);
    }

    async createIssue(issuePayload) {
        let trelloOk = false;
        let trelloCard = null;

        // Create Trello issue first to get a permanent media URL
        if (this.trelloGateway) {
            try {
                trelloCard = await this.trelloGateway.createIssue(issuePayload);
                trelloOk = true;

                // Sync: If Trello created an attachment, use ITS URL for the Sheet (since Telegram URLs are temporary)
                if (issuePayload.image && trelloCard && trelloCard.id) {
                    // Slight delay to ensure Trello has processed the attachment if needed
                    const trelloAttachmentUrl = await this.trelloGateway.getCardAttachmentUrl(trelloCard.id);
                    if (trelloAttachmentUrl) {
                        issuePayload.image = trelloAttachmentUrl;
                    }
                }
            } catch (error) {
                console.error("[DualBackend] Trello creation failed:", error.message);
            }
        }

        // Now create in Sheet with the permanent URL
        let sheetOk = false;
        if (this.sheetGateway) {
            try {
                await this.sheetGateway.createIssue(issuePayload);
                sheetOk = true;
            } catch (error) {
                console.error("[DualBackend] Sheet creation failed:", error.message);
            }
        }

        if (!sheetOk && !trelloOk) {
            throw new Error("Failed to create issue in both Sheet and Trello backends");
        }

        return {
            sheetCreated: sheetOk,
            trelloCreated: trelloOk
        };
    }

    async updateIssueChatId(issueId, chatId) {
        const sheetPromise = this.sheetGateway ? this.sheetGateway.updateIssueChatId(issueId, chatId) : Promise.resolve();
        const trelloPromise = this.trelloGateway ? this.trelloGateway.updateIssueChatId(issueId, chatId) : Promise.resolve();

        await Promise.all([sheetPromise, trelloPromise]);
    }
}

module.exports = DualBackendIssueGateway;
