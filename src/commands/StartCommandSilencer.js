const IssueWorkflowCommand = require("./IssueWorkflowCommand");

class StartCommandSilencer extends IssueWorkflowCommand {
    matches(executionContext) {
        return executionContext.messageText.trim() === "/start";
    }

    async execute() {
        return true;
    }
}

module.exports = StartCommandSilencer;