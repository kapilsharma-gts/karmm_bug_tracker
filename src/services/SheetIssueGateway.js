class SheetIssueGateway {
    constructor(sheetWebhookUrl, httpClient) {
        this.sheetWebhookUrl = sheetWebhookUrl;
        this.httpClient = httpClient;
    }

    async markDone(issueId) {
        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "update",
            id: issueId,
            status: "DONE"
        });
    }

    async markInProgress(issueId) {
        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "update",
            id: issueId,
            status: "IN PROGRESS"
        });
    }

    async markWithStatus(issueId, status) {
        // Generic method to mark with any status
        // Normalize status to match expected values
        let normalizedStatus = status.toUpperCase();
        if (normalizedStatus === "IN DEVELOPMENT") {
            normalizedStatus = "IN PROGRESS";
        } else if (normalizedStatus === "BUG NOT RESOLVED") {
            normalizedStatus = "BUG NOT RESOLVED";
        } else if (normalizedStatus === "FUTURE UPDATE") {
            normalizedStatus = "FUTURE UPDATE";
        } else if (!["DONE", "IN PROGRESS", "OPEN"].includes(normalizedStatus)) {
            // Map other statuses if needed
            normalizedStatus = normalizedStatus.toUpperCase();
        }

        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "update",
            id: issueId,
            status: normalizedStatus,
            source: "trello"
        });
    }

    async removeIssue(issueId) {
        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "delete",
            id: issueId
        });
    }

    async assignIssue(issueId, responsibleOwner) {
        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "assign",
            id: issueId,
            assignee: responsibleOwner
        });
    }

    async createIssue(issuePayload) {
        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "create",
            ...issuePayload
        });
    }

    async updateIssueChatId(issueId, chatId) {
        await this.httpClient.post(this.sheetWebhookUrl, {
            action: "linkchat",
            id: issueId,
            chatId: chatId
        });
    }
}

module.exports = SheetIssueGateway;