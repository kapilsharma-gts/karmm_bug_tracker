const IssueWorkflowCommand = require("./IssueWorkflowCommand");

class ProgressIssueCommand extends IssueWorkflowCommand {
    matches(executionContext) {
        return executionContext.messageText.startsWith("/progress");
    }

    async execute(executionContext) {
        const issueId = executionContext.messageText.split(" ")[1];
        await this.sheetIssueGateway.markInProgress(issueId);
        await this.telegramNotifier.send(
            executionContext.chatIdentifier,
            `Bug ${issueId} marked as IN PROGRESS`
        );
        return true;
    }
}

module.exports = ProgressIssueCommand;