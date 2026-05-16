const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Fire-and-forget: failures are logged, not thrown — emails should never break a request.
async function sendMail({ to, subject, text, html }) {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@example.com";
    try {
        // No creds? Don't try Gmail — log instead so dev keeps working.
        if (!process.env.SMTP_USER) {
            console.log(`[mailer:console] to=${to} subject=${JSON.stringify(subject)}\n${text || ""}`);
            return { mode: "console" };
        }
        const info = await transporter.sendMail({ from, to, subject, text, html });
        return { mode: "gmail", messageId: info.messageId };
    } catch (err) {
        console.error("[mailer] sendMail failed:", err.message);
        return { mode: "error", error: err.message };
    }
}

module.exports = { sendMail };
