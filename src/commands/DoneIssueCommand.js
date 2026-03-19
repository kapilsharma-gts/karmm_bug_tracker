const IssueWorkflowCommand = require("./IssueWorkflowCommand");

class DoneIssueCommand extends IssueWorkflowCommand {
    matches(executionContext) {
        return executionContext.messageText.startsWith("/done");
    }

    async execute(executionContext) {
        const issueId = executionContext.messageText.split(" ")[1];
        await this.sheetIssueGateway.markDone(issueId);
        await this.telegramNotifier.send(executionContext.chatIdentifier, `Bug ${issueId} marked as DONE`);
        return true;
    }
}

module.exports = DoneIssueCommand;