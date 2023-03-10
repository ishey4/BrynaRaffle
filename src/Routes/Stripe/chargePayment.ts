import { Request, Response } from "express";
import { sendEmail } from "../../API/Email/SendEmail";
import { STRIPE_PRIVATE_KEY } from "../../Constants";
import { getDB, setDB } from "../../DB/localDB";
import { getTickets } from "../../utils";
import { EmailTemplate, IEmailTemplateProps } from "../Email/EmailTemplate";

const stripe = require('stripe')(STRIPE_PRIVATE_KEY);

export const chargePayment = async (req: Request, resp: Response) => {
    try {
        const { amount, card, ticketIds, email, userId } = req.body;
        const token = await stripe.tokens.create({ card });

        const myTickets = await getTickets(ticketIds, userId)
        const otherTickets = (await getDB()).filter(({ uid }) => !ticketIds.includes(uid))
        const ticketSum = (myTickets.reduce((sum, { ticketNumber }) => sum + ticketNumber || 0, 0)) * 100
        const validation = myTickets.length === ticketIds.length && ticketSum === amount;

        const ticketsString = myTickets.map(({ ticketNumber }) => ticketNumber).join(",");

        if (!validation) {
            resp.status(500).json({ message: "Error validating tickets. Please refresh and try again" })
            return;
        }

        stripe.charges.create({
            amount,
            currency: 'usd',
            source: (await token).id,
            description: `Tickets: ${ticketsString}`
        }).then((charge: any) => {
            const { receipt_url, status, id } = charge;

            setDB([...otherTickets, ...myTickets.map((ticket) => ({ ...ticket, receipt_url, transactionId: id, status: 'Paid' }))])

            //need to create an email templater. 
            const emailProps: IEmailTemplateProps = {
                amount,
                email,
                receipt_url,
                tickets: myTickets
            }
            sendEmail({ body: EmailTemplate(emailProps), subject: "Raffle Ticket", toAddress: email })

            resp.json(charge)
        });
    } catch (e) {
        resp.status(500).json(e)
    }
}