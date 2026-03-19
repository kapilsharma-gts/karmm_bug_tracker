class TelegramIssueWorkflowRouter {
    constructor(issueCommands) {
        this.issueCommands = issueCommands;
    }

    async tryHandle(executionContext) {
        for (const issueCommand of this.issueCommands) {
            if (!issueCommand.matches(executionContext)) {
                continue;
            }

            return issueCommand.execute(executionContext);
        }

        return false;
    }
}

module.exports = TelegramIssueWorkflowRouter;