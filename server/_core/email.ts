import nodemailer from "nodemailer";

export const sendEmailAlert = async (to: string, subject: string, html: string) => {
    // Check if SMTP is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn(`[Email] Muted: Missing SMTP credentials. Would have sent: ${subject} -> ${to}`);
        return;
    }

    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || '"PMP System Alerts" <noreply@pmp.local>',
            to,
            subject,
            html,
        });
        console.log(`[Email] Dispatched alert to ${to}`);
    } catch (e) {
        console.error("[Email] Failed to dispatch email", e);
    }
};
