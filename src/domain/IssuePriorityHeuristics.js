class IssuePriorityHeuristics {
    static inferPriority(issueNarrative) {
        const normalizedNarrative = issueNarrative.toLowerCase();

        if (
            normalizedNarrative.includes("crash") ||
            normalizedNarrative.includes("fail") ||
            normalizedNarrative.includes("error") ||
            normalizedNarrative.includes("not working")
        ) {
            return "HIGH";
        }

        if (normalizedNarrative.includes("slow") || normalizedNarrative.includes("lag")) {
            return "LOW";
        }

        return "MEDIUM";
    }
}

module.exports = IssuePriorityHeuristics;