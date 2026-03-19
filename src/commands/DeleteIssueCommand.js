const IssueWorkflowCommand = require("./IssueWorkflowCommand");

class DeleteIssueCommand extends IssueWorkflowCommand {
    matches(executionContext) {
        return executionContext.messageText.startsWith("/delete");
    }

    async execute(executionContext) {
        const issueId = executionContext.messageText.split(" ")[1];
        await this.sheetIssueGateway.removeIssue(issueId);
        await this.telegramNotifier.send(executionContext.chatIdentifier, `Bug ${issueId} deleted`);
        return true;
    }
}

module.exports = DeleteIssueCommand;