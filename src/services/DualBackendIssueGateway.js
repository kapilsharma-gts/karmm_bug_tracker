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
        const settlements = await Promise.allSettled([
            this.sheetGateway ? this.sheetGateway.createIssue(issuePayload) : Promise.resolve(),
            this.trelloGateway ? this.trelloGateway.createIssue(issuePayload) : Promise.resolve()
        ]);

        const [sheetResult, trelloResult] = settlements;
        const sheetOk = sheetResult.status === "fulfilled";
        const trelloOk = trelloResult.status === "fulfilled";

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
