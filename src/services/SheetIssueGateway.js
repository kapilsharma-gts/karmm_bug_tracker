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
        await this.httpClient.post(this.sheetWebhookUrl, issuePayload);
    }
}

module.exports = SheetIssueGateway;