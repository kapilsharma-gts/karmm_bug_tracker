const IssueWorkflowCommand = require("./IssueWorkflowCommand");

class AssignIssueCommand extends IssueWorkflowCommand {
    matches(executionContext) {
        return executionContext.messageText.startsWith("/assign");
    }

    async execute(executionContext) {
        const commandSegments = executionContext.messageText.split(" ");
        const issueId = commandSegments[1];
        const responsibleOwner = commandSegments[2];

        await this.sheetIssueGateway.assignIssue(issueId, responsibleOwner);
        await this.telegramNotifier.send(
            executionContext.chatIdentifier,
            `Bug ${issueId} assigned to ${responsibleOwner}`
        );
        return true;
    }
}

module.exports = AssignIssueCommand;