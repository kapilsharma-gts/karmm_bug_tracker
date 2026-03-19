class IssueWorkflowCommand {
    constructor(sheetIssueGateway, telegramNotifier) {
        this.sheetIssueGateway = sheetIssueGateway;
        this.telegramNotifier = telegramNotifier;
    }

    matches() {
        return false;
    }

    async execute() {
        return false;
    }
}

module.exports = IssueWorkflowCommand;