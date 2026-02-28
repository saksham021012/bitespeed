import prisma from "../prisma";
import { Contact, Prisma } from "@prisma/client";

interface IdentifyResponse {
    contact: {
        primaryContactId: number;
        emails: string[];
        phoneNumbers: string[];
        secondaryContactIds: number[];
    };
}

/**
 * Find the root primary contact for a given contact.
 * Walks up the linkedId chain until it finds a contact with no linkedId.
 */
async function findPrimaryContact(contact: Contact): Promise<Contact> {
    let current = contact;
    while (current.linkedId !== null) {
        const parent = await prisma.contact.findUnique({
            where: { id: current.linkedId },
        });
        if (!parent) break;
        current = parent;
    }
    return current;
}

/**
 * Get all contacts in a cluster given the primary contact ID.
 * Returns the primary contact and all secondary contacts ordered by createdAt.
 */
async function getContactCluster(primaryId: number): Promise<Contact[]> {
    const contacts = await prisma.contact.findMany({
        where: {
            OR: [{ id: primaryId }, { linkedId: primaryId }],
            deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
    });
    return contacts;
}

/**
 * Build the consolidated response from a cluster of contacts.
 */
function buildResponse(
    primary: Contact,
    allContacts: Contact[]
): IdentifyResponse {
    const emails: string[] = [];
    const phoneNumbers: string[] = [];
    const secondaryContactIds: number[] = [];

    // Primary contact's info goes first
    if (primary.email) emails.push(primary.email);
    if (primary.phoneNumber) phoneNumbers.push(primary.phoneNumber);

    // Then add secondary contacts' info
    for (const contact of allContacts) {
        if (contact.id === primary.id) continue;

        secondaryContactIds.push(contact.id);
        if (contact.email && !emails.includes(contact.email)) {
            emails.push(contact.email);
        }
        if (contact.phoneNumber && !phoneNumbers.includes(contact.phoneNumber)) {
            phoneNumbers.push(contact.phoneNumber);
        }
    }

    return {
        contact: {
            primaryContactId: primary.id,
            emails,
            phoneNumbers,
            secondaryContactIds,
        },
    };
}

/**
 * Main identity reconciliation logic.
 */
export async function identifyContact(
    email: string | null,
    phoneNumber: string | null
): Promise<IdentifyResponse> {
    // Guard: at least one identifier must be provided
    if (!email && !phoneNumber) {
        throw new Error("At least one of email or phoneNumber must be provided");
    }

    // Step 1: Find all existing contacts matching email or phoneNumber
    const conditions: Prisma.ContactWhereInput[] = [];
    if (email) conditions.push({ email });
    if (phoneNumber) conditions.push({ phoneNumber });

    const matchingContacts = await prisma.contact.findMany({
        where: {
            OR: conditions,
            deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
    });

    // Step 2: No matches — create a new primary contact
    if (matchingContacts.length === 0) {
        const newContact = await prisma.contact.create({
            data: {
                email,
                phoneNumber,
                linkPrecedence: "primary",
            },
        });

        return {
            contact: {
                primaryContactId: newContact.id,
                emails: email ? [email] : [],
                phoneNumbers: phoneNumber ? [phoneNumber] : [],
                secondaryContactIds: [],
            },
        };
    }

    // Steps 3–5 wrapped in a serializable transaction to prevent race conditions
    return await prisma.$transaction(async (tx) => {
        // Step 3: Find all distinct primary contacts in the matched set
        const primaryContactsMap = new Map<number, Contact>();

        for (const contact of matchingContacts) {
            const primary = await findPrimaryContact(contact);
            if (!primaryContactsMap.has(primary.id)) {
                primaryContactsMap.set(primary.id, primary);
            }
        }

        const primaryContacts = Array.from(primaryContactsMap.values()).sort(
            (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );

        // The oldest primary becomes THE primary
        const rootPrimary = primaryContacts[0];

        // Step 4: If multiple primaries exist, demote the newer ones
        if (primaryContacts.length > 1) {
            for (let i = 1; i < primaryContacts.length; i++) {
                const demotedPrimary = primaryContacts[i];

                // Update the demoted primary to become secondary
                await tx.contact.update({
                    where: { id: demotedPrimary.id },
                    data: {
                        linkedId: rootPrimary.id,
                        linkPrecedence: "secondary",
                    },
                });

                // Update all contacts that were linked to the demoted primary
                await tx.contact.updateMany({
                    where: { linkedId: demotedPrimary.id },
                    data: { linkedId: rootPrimary.id },
                });
            }
        }

        // Step 5: Check if we need to create a new secondary contact
        // A secondary is created if the request introduces new information
        const allClusterContacts = await getContactCluster(rootPrimary.id);

        const existingEmails = new Set(
            allClusterContacts.map((c) => c.email).filter(Boolean)
        );
        const existingPhones = new Set(
            allClusterContacts.map((c) => c.phoneNumber).filter(Boolean)
        );

        const hasNewEmail = email && !existingEmails.has(email);
        const hasNewPhone = phoneNumber && !existingPhones.has(phoneNumber);

        // Check if the exact email+phone combination already exists in the cluster
        const exactMatch = allClusterContacts.some(
            (c) => c.email === email && c.phoneNumber === phoneNumber
        );

        if ((hasNewEmail || hasNewPhone) && !exactMatch) {
            await tx.contact.create({
                data: {
                    email,
                    phoneNumber,
                    linkedId: rootPrimary.id,
                    linkPrecedence: "secondary",
                },
            });
        }

        // Step 6: Re-fetch the full cluster and build response
        const finalCluster = await getContactCluster(rootPrimary.id);

        // Pull primary from the cluster instead of a redundant DB query
        const freshPrimary = finalCluster.find((c) => c.id === rootPrimary.id)!;

        return buildResponse(freshPrimary, finalCluster);
    }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    });
}
