const IssuePriorityHeuristics = require("./IssuePriorityHeuristics");

class IssuePayloadComposer {
    static buildIssuePayload({ issueText, issueReporter, evidenceImageUrl }) {
        const issueTitle = issueText.split("\n")[0];
        const issueDescription = issueText;
        const issuePriority = IssuePriorityHeuristics.inferPriority(issueText);

        return {
            id: Date.now(),
            title: issueTitle,
            description: issueDescription,
            steps: `1. Open app\n2. Perform "${issueTitle}"\n3. Observe issue`,
            expected: "Feature should work correctly",
            actual: `${issueTitle} issue occurring`,
            priority: issuePriority,
            status: "OPEN",
            image: evidenceImageUrl,
            reporter: issueReporter,
            date: new Date().toISOString()
        };
    }
}

module.exports = IssuePayloadComposer;