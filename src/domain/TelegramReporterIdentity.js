class TelegramReporterIdentity {
    static composeReporter(userProfile) {
        const personName = `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim();

        if (userProfile.username) {
            return `@${userProfile.username}`;
        }

        if (personName) {
            return personName;
        }

        return "unknown";
    }
}

module.exports = TelegramReporterIdentity;