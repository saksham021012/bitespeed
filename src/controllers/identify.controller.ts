import { Request, Response } from "express";
import { identifyContact } from "../services/contact.service";

export async function handleIdentify(req: Request, res: Response) {
    try {
        const { email, phoneNumber } = req.body;

        // At least one of email or phoneNumber must be provided
        if (!email && !phoneNumber) {
            return res.status(400).json({
                error: "At least one of email or phoneNumber must be provided",
            });
        }

        // Normalize phoneNumber to string if it comes as a number
        const normalizedPhone = phoneNumber ? String(phoneNumber) : null;
        const normalizedEmail = email ? String(email) : null;

        const result = await identifyContact(normalizedEmail, normalizedPhone);

        return res.status(200).json(result);
    } catch (error) {
        console.error("Error in /identify:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}
